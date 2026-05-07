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
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
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

// GetRun — GET /api/v1/price-benchmarks/runs/{id}
// PR 43: 비동기 AIRefresh 의 진행 상황 폴링용. status='running'/'completed'/'partial'/'failed'.
func (h *PriceBenchmarkHandler) GetRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "id")
	if runID == "" {
		response.RespondError(w, http.StatusBadRequest, "run_id가 누락됐습니다")
		return
	}
	data, _, err := h.DB.From("price_benchmark_runs").
		Select("*", "exact", false).
		Eq("run_id", runID).
		Execute()
	if err != nil {
		log.Printf("[가격 벤치마크 단건 조회 실패] runID=%s err=%v", runID, err)
		response.RespondError(w, http.StatusInternalServerError, "수집 로그 조회 실패")
		return
	}
	var runs []model.PriceBenchmarkRun
	if err := json.Unmarshal(data, &runs); err != nil || len(runs) == 0 {
		response.RespondError(w, http.StatusNotFound, "수집 로그를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, runs[0])
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

	// PR 43: 비동기 패턴 — 즉시 run_id 반환, goroutine 백그라운드 작업.
	// 이전 동기 호출은 client/backend 85s timeout 에 자주 fail.
	// frontend 가 GET /runs/{id} 폴링으로 진행 상황 확인.
	go h.runAIRefreshAsync(runID, userID, sources, provider, llmModel, maxTokens)

	response.RespondJSON(w, http.StatusOK, map[string]any{
		"run_id":         runID,
		"status":         "running",
		"inserted_count": 0,
		"skipped_count":  0,
		"warnings":       []string{},
		"items":          []any{},
	})
}

// runAIRefreshAsync — AIRefresh 의 실제 작업을 백그라운드 goroutine 에서 실행.
// req.Context 와 분리된 context.Background 사용 — client 가 끊어도 계속 진행.
// 자체 timeout 10분 (큰 LLM 호출 + 4 source 병렬 여유).
func (h *PriceBenchmarkHandler) runAIRefreshAsync(runID, userID string, sources []benchmarkSource, provider, llmModel string, maxTokens int) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[ai-refresh async] run=%s PANIC: %v", runID, r)
			msg := fmt.Sprintf("panic: %v", r)
			h.finishRun(runID, "failed", 0, 0, &msg, nil, nil, nil)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	log.Printf("[ai-refresh async] run=%s start sources=%d provider=%s", runID, len(sources), provider)

	// PR 41: 병렬 분산 + 취합 — source 별 shard 로 분리 호출.
	// 이전 단일 LLM 호출은 모든 source 의 evidence 를 한번에 던져 컨텍스트 초과 빈발.
	// 각 source 를 독립 LLM 호출로 (동시 4 cap), 결과 취합 후 finishRun 으로 마감.
	type sourceShard struct {
		src      benchmarkSource
		evidence []benchmarkEvidenceItem
		warnings []string
		raw      string
		output   *priceBenchmarkAIOutput
		err      error
	}

	shards := make([]sourceShard, len(sources))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4) // 동시 4 — vLLM/Z.AI 부하 한계
	for i, src := range sources {
		wg.Add(1)
		go func(i int, src benchmarkSource) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					shards[i].err = fmt.Errorf("panic: %v", r)
					log.Printf("[ai-refresh async] src=%s PANIC: %v", src.Key, r)
				}
			}()
			sem <- struct{}{}
			defer func() { <-sem }()
			shards[i].src = src
			// PR 44: source 별 명시적 timeout 4분 (vLLM 응답 1~2분 정상 + 여유).
			srcCtx, srcCancel := context.WithTimeout(ctx, 4*time.Minute)
			defer srcCancel()
			ev, w := h.collectBenchmarkEvidence(srcCtx, []benchmarkSource{src})
			shards[i].evidence = ev
			shards[i].warnings = w
			if len(ev) == 0 {
				shards[i].warnings = append(shards[i].warnings, fmt.Sprintf("%s: evidence 0 — AI 호출 skip", src.Key))
				log.Printf("[ai-refresh async] src=%s evidence 0", src.Key)
				return
			}
			log.Printf("[ai-refresh async] src=%s evidence=%d, LLM 호출 시작", src.Key, len(ev))
			raw, err := h.extractBenchmarksWithAI(srcCtx, provider, llmModel, maxTokens, ev)
			shards[i].raw = raw
			if err != nil {
				shards[i].err = err
				log.Printf("[ai-refresh async] src=%s LLM 실패: %v", src.Key, err)
				return
			}
			out, perr := parsePriceBenchmarkAIOutput(raw)
			if perr != nil {
				shards[i].err = perr
				log.Printf("[ai-refresh async] src=%s parse 실패: %v", src.Key, perr)
				return
			}
			shards[i].output = &out
			log.Printf("[ai-refresh async] src=%s ok points=%d", src.Key, len(out.Points))
		}(i, src)
	}
	wg.Wait()

	// 취합
	var allEvidence []benchmarkEvidenceItem
	var allWarnings []string
	var allPoints []model.CreatePriceBenchmarkRequest
	var combinedRaw strings.Builder
	successCount := 0
	for _, sh := range shards {
		allEvidence = append(allEvidence, sh.evidence...)
		allWarnings = append(allWarnings, sh.warnings...)
		if sh.err != nil {
			allWarnings = append(allWarnings, fmt.Sprintf("%s 추출 실패: %v", sh.src.Key, sh.err))
			continue
		}
		if sh.output != nil {
			successCount++
			allPoints = append(allPoints, sh.output.Points...)
			allWarnings = append(allWarnings, sh.output.Warnings...)
		}
		if sh.raw != "" {
			combinedRaw.WriteString("=== ")
			combinedRaw.WriteString(sh.src.Key)
			combinedRaw.WriteString(" ===\n")
			combinedRaw.WriteString(sh.raw)
			combinedRaw.WriteString("\n\n")
		}
	}

	rawStr := combinedRaw.String()
	if successCount == 0 && len(allPoints) == 0 {
		msg := "모든 source 추출 실패"
		allWarnings = append(allWarnings, msg)
		h.finishRun(runID, "failed", 0, 0, &msg, allWarnings, allEvidence, &rawStr)
		log.Printf("[ai-refresh async] run=%s FAILED — 모든 source 실패", runID)
		return
	}

	inserted, skipped, _ := h.insertAIBenchmarkPoints(runID, userID, allPoints)
	status := "completed"
	if inserted == 0 {
		status = "partial"
		allWarnings = append(allWarnings, "저장 가능한 가격 관측값이 없습니다")
	} else if skipped > 0 || len(allWarnings) > 0 {
		status = "partial"
	}
	h.finishRun(runID, status, inserted, skipped, nil, allWarnings, allEvidence, &rawStr)
	log.Printf("[ai-refresh async] run=%s %s — inserted=%d skipped=%d warnings=%d", runID, status, inserted, skipped, len(allWarnings))
}

func (h *PriceBenchmarkHandler) collectBenchmarkEvidence(ctx context.Context, sources []benchmarkSource) ([]benchmarkEvidenceItem, []string) {
	var evidence []benchmarkEvidenceItem
	var warnings []string
	// PR 45: Tavily → Serper 전환
	serperKey := strings.TrimSpace(os.Getenv("SERPER_API_KEY"))
	if serperKey == "" {
		warnings = append(warnings, "SERPER_API_KEY 미설정: 공개 URL 직접 조회와 AI 추출만 사용했습니다")
	}

	for _, src := range sources {
		if src.Homepage != "" {
			if item, err := h.fetchHomepageEvidence(ctx, src); err == nil {
				evidence = append(evidence, item)
			} else {
				warnings = append(warnings, fmt.Sprintf("%s 홈페이지 조회 실패: %v", src.Name, err))
			}
		}
		if serperKey == "" {
			continue
		}
		results, err := h.searchSerper(ctx, serperKey, src.Query, 4)
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
				Content:    truncate(result.Content, 900), // PR 44: vLLM 응답 시간 단축 위해 축소
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

// searchSerper — Serper API (Google 검색) 호출. PR 45: Tavily 대체.
// 응답을 webSearchResultItem (기존 Tavily 호환) shape 으로 변환하여 downstream 호환 유지.
func (h *PriceBenchmarkHandler) searchSerper(ctx context.Context, apiKey, query string, maxResults int) ([]webSearchResultItem, error) {
	body, _ := json.Marshal(map[string]any{
		"q":   query,
		"num": clampLimit(maxResults, 3, 6),
		"gl":  "kr",
		"hl":  "ko",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://google.serper.dev/search", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", apiKey)
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	var parsed serperResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil {
		return nil, err
	}
	out := make([]webSearchResultItem, 0, len(parsed.Organic))
	for _, o := range parsed.Organic {
		out = append(out, webSearchResultItem{
			Title:   o.Title,
			URL:     o.Link,
			Content: o.Snippet,
			Score:   1.0,
		})
	}
	return out, nil
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
