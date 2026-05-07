package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// PriceBenchmarkHandler — 외부 태양광 가격 벤치마크를 저장하고 AI 수집을 실행한다.
// 비유: 시세지 여러 장을 같은 장부의 날짜별 점으로 옮기는 창구.
type PriceBenchmarkHandler struct {
	DB         *supa.Client
	httpClient *http.Client
}

func NewPriceBenchmarkHandler(db *supa.Client) *PriceBenchmarkHandler {
	return &PriceBenchmarkHandler{
		DB:         db,
		httpClient: &http.Client{Timeout: 20 * time.Second},
	}
}

type benchmarkSource struct {
	Key      string
	Name     string
	Homepage string
	Query    string
}

var benchmarkSources = []benchmarkSource{
	{Key: "opis", Name: "OPIS Solar Weekly", Homepage: "https://www.opisnet.com/product/solar-weekly/", Query: "OPIS Solar Weekly Chinese Module Marker CMM FOB China TOPCon 600W forward curve DDP US Europe"},
	{Key: "infolink", Name: "InfoLink Consulting", Homepage: "https://www.infolink-group.com/energy-article/solar-topic-price", Query: "InfoLink Consulting weekly solar module cell wafer polysilicon price centralized distributed project module price"},
	{Key: "trendforce", Name: "TrendForce EnergyTrend", Homepage: "https://www.energytrend.com/pricequotes.html", Query: "TrendForce EnergyTrend weekly solar module price China export price monthly tender analysis"},
	{Key: "pvinsights", Name: "PVinsights", Homepage: "https://pvinsights.com/", Query: "PVinsights daily solar module price poly silicon wafer cell price"},
	{Key: "china_tender", Name: "중국 국영 대량 입찰", Homepage: "https://guangfu.bjx.com.cn/", Query: "北极星 太阳能 光伏 组件 集采 中标 价格 华能 华电 国家能源 国家电投 中国电建 TOPCon"},
	{Key: "cpia_floor", Name: "CPIA 최저원가 가이던스", Homepage: "https://www.chinapv.org.cn/", Query: "中国光伏行业协会 CPIA 光伏组件 最低成本 价格 指引"},
	{Key: "tier1_asp", Name: "Tier-1 제조사 ASP", Homepage: "https://ir.jinkosolar.com/", Query: "Jinko Longi Trina JA Solar Tongwei quarterly module ASP dollar per watt"},
}

type benchmarkEvidenceItem struct {
	SourceKey  string `json:"source_key"`
	SourceName string `json:"source_name"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	Content    string `json:"content"`
}

type priceBenchmarkAIOutput struct {
	Points   []model.CreatePriceBenchmarkRequest `json:"points"`
	Warnings []string                            `json:"warnings"`
}

// List — GET /api/v1/price-benchmarks
func (h *PriceBenchmarkHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("price_benchmarks").
		Select("*", "exact", false).
		Order("value_date", &postgrest.OrderOpts{Ascending: false}).
		Order("created_at", &postgrest.OrderOpts{Ascending: false})

	q := r.URL.Query()
	if source := q.Get("source_key"); source != "" && source != "all" {
		query = query.Eq("source_key", source)
	}
	if metric := q.Get("metric_key"); metric != "" && metric != "all" {
		query = query.Eq("metric_key", metric)
	}
	if region := q.Get("market_region"); region != "" && region != "all" {
		query = query.Eq("market_region", region)
	}
	if basis := q.Get("basis"); basis != "" && basis != "all" {
		query = query.Eq("basis", basis)
	}
	if from := q.Get("from"); from != "" {
		query = query.Gte("value_date", from)
	}
	if to := q.Get("to"); to != "" {
		query = query.Lte("value_date", to)
	}

	limit, offset := parseLimitOffset(r, 500, 3000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[가격 벤치마크 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "가격 벤치마크 목록 조회에 실패했습니다")
		return
	}

	var rows []model.PriceBenchmark
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[가격 벤치마크 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, rows)
}

// ListRuns — GET /api/v1/price-benchmarks/runs
func (h *PriceBenchmarkHandler) ListRuns(w http.ResponseWriter, r *http.Request) {
	limit, offset := parseLimitOffset(r, 20, 100)
	data, _, err := h.DB.From("price_benchmark_runs").
		Select("*", "exact", false).
		Order("started_at", &postgrest.OrderOpts{Ascending: false}).
		Range(offset, offset+limit-1, "").
		Execute()
	if err != nil {
		log.Printf("[가격 벤치마크 수집 로그 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "가격 벤치마크 수집 로그 조회에 실패했습니다")
		return
	}
	var runs []model.PriceBenchmarkRun
	if err := json.Unmarshal(data, &runs); err != nil {
		log.Printf("[가격 벤치마크 수집 로그 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, runs)
}

// Create — POST /api/v1/price-benchmarks
func (h *PriceBenchmarkHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	var req model.CreatePriceBenchmarkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if userID != "" {
		req.CreatedBy = &userID
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("price_benchmarks").
		Upsert(req, "source_key,metric_key,value_date,market_region,basis,currency", "", "").
		Execute()
	if err != nil {
		log.Printf("[가격 벤치마크 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "가격 벤치마크 등록에 실패했습니다")
		return
	}
	var created []model.PriceBenchmark
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "가격 벤치마크 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// AIRefresh — POST /api/v1/price-benchmarks/ai-refresh
func (h *PriceBenchmarkHandler) AIRefresh(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		response.RespondError(w, http.StatusUnauthorized, "인증 정보가 없습니다")
		return
	}
	var req model.PriceBenchmarkAIRefreshRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
			return
		}
	}

	sources := selectBenchmarkSources(req.SourceKeys)
	if len(sources) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수집할 source_key가 없습니다")
		return
	}

	provider, llmModel, maxTokens := resolveProviderModel(assistantRequest{MaxTokens: 4096})
	runID := uuid.NewString()
	sourceKeys := make([]string, 0, len(sources))
	for _, src := range sources {
		sourceKeys = append(sourceKeys, src.Key)
	}
	run := map[string]any{
		"run_id":       runID,
		"status":       "running",
		"provider":     provider,
		"model":        llmModel,
		"source_keys":  sourceKeys,
		"requested_by": userID,
	}
	if _, _, err := h.DB.From("price_benchmark_runs").Insert(run, false, "", "", "").Execute(); err != nil {
		log.Printf("[가격 벤치마크 수집 로그 생성 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "가격 벤치마크 수집 로그 생성에 실패했습니다")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 85*time.Second)
	defer cancel()

	evidence, warnings := h.collectBenchmarkEvidence(ctx, sources)
	raw, err := h.extractBenchmarksWithAI(ctx, provider, llmModel, maxTokens, evidence)
	if err != nil {
		msg := err.Error()
		warnings = append(warnings, msg)
		h.finishRun(runID, "failed", 0, 0, &msg, warnings, evidence, nil)
		response.RespondError(w, http.StatusBadGateway, "AI 가격 벤치마크 수집에 실패했습니다: "+msg)
		return
	}

	output, err := parsePriceBenchmarkAIOutput(raw)
	if err != nil {
		msg := err.Error()
		warnings = append(warnings, msg)
		h.finishRun(runID, "failed", 0, 0, &msg, warnings, evidence, &raw)
		response.RespondError(w, http.StatusBadGateway, "AI 응답을 가격 데이터로 해석하지 못했습니다: "+msg)
		return
	}
	warnings = append(warnings, output.Warnings...)

	inserted, skipped, rows := h.insertAIBenchmarkPoints(runID, userID, output.Points)
	status := "completed"
	if inserted == 0 {
		status = "partial"
		warnings = append(warnings, "저장 가능한 가격 관측값이 없습니다")
	} else if skipped > 0 || len(warnings) > 0 {
		status = "partial"
	}
	h.finishRun(runID, status, inserted, skipped, nil, warnings, evidence, &raw)

	response.RespondJSON(w, http.StatusOK, map[string]any{
		"run_id":         runID,
		"status":         status,
		"inserted_count": inserted,
		"skipped_count":  skipped,
		"warnings":       warnings,
		"items":          rows,
	})
}

func (h *PriceBenchmarkHandler) collectBenchmarkEvidence(ctx context.Context, sources []benchmarkSource) ([]benchmarkEvidenceItem, []string) {
	var evidence []benchmarkEvidenceItem
	var warnings []string
	tavilyKey := strings.TrimSpace(os.Getenv("TAVILY_API_KEY"))
	if tavilyKey == "" {
		warnings = append(warnings, "TAVILY_API_KEY 미설정: 공개 URL 직접 조회와 AI 추출만 사용했습니다")
	}

	for _, src := range sources {
		if src.Homepage != "" {
			if item, err := h.fetchHomepageEvidence(ctx, src); err == nil {
				evidence = append(evidence, item)
			} else {
				warnings = append(warnings, fmt.Sprintf("%s 홈페이지 조회 실패: %v", src.Name, err))
			}
		}
		if tavilyKey == "" {
			continue
		}
		results, err := h.searchTavily(ctx, tavilyKey, src.Query, 4)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s 웹 검색 실패: %v", src.Name, err))
			continue
		}
		for _, result := range results {
			evidence = append(evidence, benchmarkEvidenceItem{
				SourceKey:  src.Key,
				SourceName: src.Name,
				Title:      result.Title,
				URL:        result.URL,
				Content:    truncate(result.Content, 1800),
			})
		}
	}

	if len(evidence) == 0 {
		warnings = append(warnings, "수집 증거 텍스트가 없습니다. 유료 리포트 로그인/검색 키 설정을 확인하세요")
	}
	return evidence, warnings
}

func (h *PriceBenchmarkHandler) fetchHomepageEvidence(ctx context.Context, src benchmarkSource) (benchmarkEvidenceItem, error) {
	u, err := url.Parse(src.Homepage)
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	if err := guardFetchURL(u); err != nil {
		return benchmarkEvidenceItem{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src.Homepage, nil)
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	req.Header.Set("User-Agent", "SolarFlow-PriceBenchmark/1.0")
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 24000))
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	if resp.StatusCode/100 != 2 {
		return benchmarkEvidenceItem{}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return benchmarkEvidenceItem{
		SourceKey:  src.Key,
		SourceName: src.Name,
		Title:      src.Name + " homepage",
		URL:        src.Homepage,
		Content:    truncate(string(raw), 2400),
	}, nil
}

func (h *PriceBenchmarkHandler) searchTavily(ctx context.Context, apiKey, query string, maxResults int) ([]tavilyResultItem, error) {
	body, _ := json.Marshal(map[string]any{
		"api_key":      apiKey,
		"query":        query,
		"max_results":  clampLimit(maxResults, 3, 6),
		"search_depth": "basic",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.tavily.com/search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	var parsed tavilyResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil {
		return nil, err
	}
	return parsed.Results, nil
}

func (h *PriceBenchmarkHandler) extractBenchmarksWithAI(ctx context.Context, provider, llmModel string, maxTokens int, evidence []benchmarkEvidenceItem) (string, error) {
	system := `당신은 SolarFlow 가격예측용 태양광 모듈 가격 벤치마크 추출기입니다.
반드시 제공된 evidence 안에 명시된 가격만 추출하세요. 추정, 보간, 상식, 오래된 기억으로 값을 만들면 안 됩니다.
출력은 JSON 객체 하나만 반환하세요. Markdown, 설명문, 코드블록은 금지입니다.
형식:
{
  "points": [
    {
      "source_key": "opis|infolink|trendforce|pvinsights|china_tender|cpia_floor|tier1_asp",
      "source_name": "표시명",
      "metric_key": "cmm_fob_china_topcon_600w|forward_q1|forward_q2|forward_q3|forward_q4|ddp_us|ddp_europe|module_centralized|module_distributed|cell|wafer|polysilicon|china_domestic|china_export|china_state_tender|cpia_cost_floor|manufacturer_asp",
      "metric_label": "운영자가 보는 짧은 라벨",
      "value_date": "YYYY-MM-DD",
      "period_label": "weekly|daily|monthly|Q+1 등",
      "market_region": "fob_china|ddp_us|ddp_europe|china_domestic|china_export|global|manufacturer",
      "basis": "fob|ddp|spot|forward|tender|floor|asp",
      "currency": "USD|CNY|KRW",
      "price_usd_w": 0.000001 이상 숫자 또는 null,
      "price_cny_w": 0.000001 이상 숫자 또는 null,
      "price_krw_w": 0.0001 이상 숫자 또는 null,
      "cargo_min_mw": 5,
      "cargo_max_mw": 25,
      "quarter_label": "Q+1 등",
      "project_segment": "centralized|distributed|null",
      "technology": "TOPCon >=600W 등",
      "confidence": 0.0~1.0,
      "source_url": "근거 URL",
      "raw_excerpt": "가격이 나온 짧은 근거 문장",
      "notes": "주의사항"
    }
  ],
  "warnings": ["추출하지 못한 이유 또는 유료/로그인 한계"]
}`

	payload, _ := json.MarshalIndent(map[string]any{
		"today":    time.Now().Format("2006-01-02"),
		"sources":  benchmarkSources,
		"evidence": evidence,
	}, "", "  ")
	user := "다음 evidence 에서 OPIS CMM/forward/DDP, InfoLink, TrendForce, PVinsights, 중국 국영 입찰, CPIA floor, Tier-1 ASP 가격 관측값을 추출해 JSON으로 반환하세요.\n" + string(payload)

	assistant := NewAssistantHandler(h.DB)
	switch provider {
	case "anthropic":
		return assistant.callAnthropicOnce(ctx, llmModel, system, user, maxTokens)
	case "openai":
		return assistant.callOpenAIOnce(ctx, llmModel, system, user, maxTokens)
	default:
		return "", fmt.Errorf("지원하지 않는 provider: %s", provider)
	}
}

func parsePriceBenchmarkAIOutput(raw string) (priceBenchmarkAIOutput, error) {
	var out priceBenchmarkAIOutput
	body := strings.TrimSpace(raw)
	if strings.HasPrefix(body, "```") {
		body = strings.TrimPrefix(body, "```json")
		body = strings.TrimPrefix(body, "```")
		body = strings.TrimSuffix(body, "```")
		body = strings.TrimSpace(body)
	}
	start := strings.Index(body, "{")
	end := strings.LastIndex(body, "}")
	if start < 0 || end <= start {
		return out, fmt.Errorf("JSON 객체를 찾을 수 없습니다")
	}
	if err := json.Unmarshal([]byte(body[start:end+1]), &out); err != nil {
		return out, err
	}
	return out, nil
}

func (h *PriceBenchmarkHandler) insertAIBenchmarkPoints(runID, userID string, points []model.CreatePriceBenchmarkRequest) (int, int, []model.PriceBenchmark) {
	inserted := 0
	skipped := 0
	var createdRows []model.PriceBenchmark
	for _, point := range points {
		point.RunID = &runID
		point.CreatedBy = &userID
		point.Normalize()
		if point.SourceName == "" {
			point.SourceName = benchmarkSourceName(point.SourceKey)
		}
		if point.MetricLabel == "" {
			point.MetricLabel = point.MetricKey
		}
		if msg := point.Validate(); msg != "" {
			log.Printf("[가격 벤치마크 AI point skip] %s", msg)
			skipped++
			continue
		}
		data, _, err := h.DB.From("price_benchmarks").
			Upsert(point, "source_key,metric_key,value_date,market_region,basis,currency", "", "").
			Execute()
		if err != nil {
			log.Printf("[가격 벤치마크 AI point insert 실패] %v", err)
			skipped++
			continue
		}
		var rows []model.PriceBenchmark
		if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
			skipped++
			continue
		}
		inserted++
		createdRows = append(createdRows, rows[0])
	}
	return inserted, skipped, createdRows
}

func (h *PriceBenchmarkHandler) finishRun(runID, status string, inserted, skipped int, errMsg *string, warnings []string, evidence []benchmarkEvidenceItem, raw *string) {
	finished := time.Now().UTC().Format(time.RFC3339)
	payload := map[string]any{
		"status":         status,
		"finished_at":    finished,
		"inserted_count": inserted,
		"skipped_count":  skipped,
		"warnings":       warnings,
		"evidence":       evidence,
	}
	if errMsg != nil {
		payload["error_message"] = *errMsg
	}
	if raw != nil {
		payload["raw_response"] = truncate(*raw, 12000)
	}
	if _, _, err := h.DB.From("price_benchmark_runs").Update(payload, "", "").Eq("run_id", runID).Execute(); err != nil {
		log.Printf("[가격 벤치마크 수집 로그 갱신 실패] run_id=%s err=%v", runID, err)
	}
}

func selectBenchmarkSources(keys []string) []benchmarkSource {
	if len(keys) == 0 {
		return benchmarkSources
	}
	want := make(map[string]bool, len(keys))
	for _, key := range keys {
		k := strings.ToLower(strings.TrimSpace(key))
		if k != "" {
			want[k] = true
		}
	}
	var out []benchmarkSource
	for _, src := range benchmarkSources {
		if want[src.Key] {
			out = append(out, src)
		}
	}
	return out
}

func benchmarkSourceName(sourceKey string) string {
	for _, src := range benchmarkSources {
		if src.Key == sourceKey {
			return src.Name
		}
	}
	return sourceKey
}
