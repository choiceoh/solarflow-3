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
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/mount"
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

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDTxPriceBenchmark,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewPriceBenchmarkHandler(d.DB)
			g := d.Gates
			r.Route("/price-benchmarks", func(r chi.Router) {
				r.Use(g.Feature(feature.IDTxPriceBenchmark))
				r.Get("/", h.List)
				r.Get("/runs", h.ListRuns)
				r.Get("/runs/{id}", h.GetRun) // PR 43: 비동기 ai-refresh 폴링
				// PR 42: 우리 구매가 + 평균 판매가 시계열 — 가격예측 차트에 추가 시리즈로 표시
				r.Get("/our-prices", h.OurPrices)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Post("/ai-refresh", h.AIRefresh)
				r.With(g.Write).Patch("/{id}/review-status", h.UpdateReviewStatus)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
		},
	})
}

// benchmarkSource — PR 46: Endpoint/TimeWindow/Site 추가하여 source 별로 검색 분기.
// Endpoint: "search"(기본) | "news" | "scholar". TimeWindow: "day"|"week"|"month"|"year"|"".
// Site: site: 연산자 (e.g. "ir.jinkosolar.com OR ir.longi.com").
// HomepageFallbacks: 1차 Homepage 가 404/실패할 때 차례로 시도할 백업 URL.
// 시세지가 사이트 개편으로 path 만 바꿔도 다음 분기까지 evidence 가 끊기지 않게 함.
type benchmarkSource struct {
	Key               string
	Name              string
	Homepage          string
	HomepageFallbacks []string
	Query             string
	QueryVariants     []string // 비유: 첫 그물에 안 잡힌 자료를 다른 말투의 그물로 한 번 더 찾는다.
	Endpoint          string   // PR 46: search|news|scholar (기본 search)
	TimeWindow        string   // PR 46: day|week|month|year (기본 "")
	Site              string   // PR 46: site: 연산자 (선택)
}

// homepageURLs — Homepage + HomepageFallbacks 를 시도 순서대로 반환 (빈 문자열 제거).
func (s benchmarkSource) homepageURLs() []string {
	if strings.TrimSpace(s.Homepage) == "" {
		return nil
	}
	out := []string{s.Homepage}
	for _, u := range s.HomepageFallbacks {
		if strings.TrimSpace(u) != "" {
			out = append(out, u)
		}
	}
	return out
}

var benchmarkSources = []benchmarkSource{
	// 주간 발행 시세지 — tbs:qdr:w 로 최근 1주 결과만 (오래된 캐시 페이지 제외).
	{Key: "opis", Name: "OPIS Solar Weekly", Homepage: "https://www.opisnet.com/product/solar-weekly/", HomepageFallbacks: []string{"https://www.opisnet.com/product-category/renewables/", "https://www.opisnet.com/"}, Query: "OPIS Solar Weekly Chinese Module Marker CMM FOB China TOPCon 600W forward curve DDP Europe", QueryVariants: []string{"OPIS CMM FOB China module price DDP Europe forward curve", "OPIS solar module price assessment China TOPCon Europe DDP", "Chinese Module Marker CMM TOPCon 600W OPIS latest"}, Endpoint: "search", TimeWindow: "week"},
	// InfoLink — module/polysilicon 만 사용. cell, wafer 는 정확도 이슈로 제외.
	{Key: "infolink", Name: "InfoLink Consulting", Homepage: "https://www.infolink-group.com/energy-article/solar-topic-price", HomepageFallbacks: []string{"https://www.infolink-group.com/solar/", "https://www.infolink-group.com/"}, Query: "InfoLink Consulting weekly solar module polysilicon price China centralized distributed project module price", QueryVariants: []string{"InfoLink solar module price trend China centralized distributed polysilicon", "InfoLink 光伏 组件 价格 集中式 分布式 多晶硅", "InfoLink PV spot price module China project market"}, Endpoint: "search", TimeWindow: "week"},
	{Key: "trendforce", Name: "TrendForce EnergyTrend", Homepage: "https://www.energytrend.com/pricequotes.html", HomepageFallbacks: []string{"https://www.energytrend.com/solar/", "https://www.energytrend.com/"}, Query: "TrendForce EnergyTrend weekly solar module price China export Europe price monthly tender analysis", QueryVariants: []string{"EnergyTrend solar module price quote China export TrendForce", "TrendForce PV module price China domestic export Europe", "集邦新能源 EnergyTrend 光伏 组件 价格 中国 出口"}, Endpoint: "search", TimeWindow: "week"},
	// 일간 발행 — tbs:qdr:d.
	{Key: "pvinsights", Name: "PVinsights", Homepage: "https://pvinsights.com/", Query: "PVinsights daily solar module price China Europe module price", QueryVariants: []string{"PVinsights PV module price list China Europe", "PVinsights solar PV price module spot USD per watt", "PVinsights module price trend China Europe"}, Endpoint: "search", TimeWindow: "day"},
	// 중국 입찰 뉴스 — /news 엔드포인트 + 1개월. 입찰 결과는 뉴스성이 강함.
	{Key: "china_tender", Name: "중국 국영 대량 입찰", Homepage: "https://guangfu.bjx.com.cn/", HomepageFallbacks: []string{"https://news.bjx.com.cn/zt/guangfu/"}, Query: "北极星 太阳能 光伏 组件 集采 中标 价格 华能 华电 国家能源 国家电投 中国电建 TOPCon", QueryVariants: []string{"央企 光伏组件 集采 中标 单价 TOPCon 华能 华电 国家能源", "中国电建 光伏组件 集采 中标价格 N型 TOPCon", "光伏组件 开标 价格 集采 国企 央企 TOPCon"}, Endpoint: "news", TimeWindow: "month"},
	// CPIA 정책·가이던스 — 발표 빈도가 낮으므로 1개월.
	{Key: "cpia_floor", Name: "CPIA 최저원가 가이던스", Homepage: "https://www.chinapv.org.cn/", Query: "中国光伏行业协会 CPIA 光伏组件 最低成本 价格 指引", QueryVariants: []string{"CPIA module cost floor price China photovoltaic industry association", "中国光伏行业协会 组件 成本 价格 下限 指引", "CPIA 光伏组件 成本 价格 倡议 指导价"}, Endpoint: "search", TimeWindow: "month"},
}

const (
	benchmarkMaxSearchQueriesPerSource  = 8
	benchmarkSearchResultsPerQuery      = 4
	benchmarkMaxSearchEvidencePerSource = 14
	benchmarkSearchScrapeLimitPerSource = 3
)

var allowedBenchmarkSources = map[string]bool{
	"opis": true, "infolink": true, "trendforce": true, "pvinsights": true, "china_tender": true, "cpia_floor": true,
	"our_quote": true,
}

var allowedBenchmarkMetrics = map[string]bool{
	"cmm_fob_china_topcon_600w": true,
	"forward_q1":                true,
	"forward_q2":                true,
	"forward_q3":                true,
	"forward_q4":                true,
	"ddp_europe":                true,
	"module_centralized":        true,
	"module_distributed":        true,
	"polysilicon":               true,
	"china_domestic":            true,
	"china_export":              true,
	"china_state_tender":        true,
	"cpia_cost_floor":           true,
	"supplier_quote":            true,
}

var allowedBenchmarkBasis = map[string]bool{
	"fob": true, "cif": true, "ddp": true, "spot": true, "forward": true, "tender": true, "floor": true, "quote": true,
}

var allowedBenchmarkCurrencies = map[string]bool{
	"USD": true, "CNY": true, "KRW": true,
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

type benchmarkMetricTarget struct {
	MetricKey         string `json:"metric_key"`
	MetricLabel       string `json:"metric_label"`
	MarketRegion      string `json:"market_region"`
	Basis             string `json:"basis"`
	PreferredCurrency string `json:"preferred_currency,omitempty"`
	SearchHint        string `json:"search_hint"`
}

type benchmarkExistingContext struct {
	ExistingObservationKeys []string                           `json:"existing_observation_keys"`
	LatestBySlot            []benchmarkExistingSlot            `json:"latest_by_slot"`
	MissingFocus            []benchmarkMissingFocus            `json:"missing_focus"`
	RefreshPolicy           []string                           `json:"refresh_policy"`
	keySet                  map[string]bool                    `json:"-"`
	latestBySource          map[string]string                  `json:"-"`
	missingBySource         map[string][]benchmarkMissingFocus `json:"-"`
}

type benchmarkExistingSlot struct {
	SourceKey      string   `json:"source_key"`
	SourceName     string   `json:"source_name"`
	MetricKey      string   `json:"metric_key"`
	MetricLabel    string   `json:"metric_label"`
	LatestDate     string   `json:"latest_date"`
	MarketRegion   string   `json:"market_region"`
	Basis          string   `json:"basis"`
	Currency       string   `json:"currency"`
	PriceUSDW      *float64 `json:"price_usd_w,omitempty"`
	PriceCNYW      *float64 `json:"price_cny_w,omitempty"`
	PriceKRWW      *float64 `json:"price_krw_w,omitempty"`
	QuarterLabel   *string  `json:"quarter_label,omitempty"`
	ProjectSegment *string  `json:"project_segment,omitempty"`
	Technology     *string  `json:"technology,omitempty"`
	SourceURL      *string  `json:"source_url,omitempty"`
}

type benchmarkMissingFocus struct {
	SourceKey         string `json:"source_key"`
	SourceName        string `json:"source_name"`
	MetricKey         string `json:"metric_key"`
	MetricLabel       string `json:"metric_label"`
	MarketRegion      string `json:"market_region"`
	Basis             string `json:"basis"`
	PreferredCurrency string `json:"preferred_currency,omitempty"`
	SearchHint        string `json:"search_hint"`
	Reason            string `json:"reason"`
}

var benchmarkTargetMatrix = map[string][]benchmarkMetricTarget{
	"opis": {
		{MetricKey: "cmm_fob_china_topcon_600w", MetricLabel: "CMM FOB China TOPCon >=600W", MarketRegion: "fob_china", Basis: "spot", PreferredCurrency: "USD", SearchHint: "Chinese Module Marker CMM FOB China TOPCon 600W"},
		{MetricKey: "forward_q1", MetricLabel: "Forward Q+1", MarketRegion: "fob_china", Basis: "forward", PreferredCurrency: "USD", SearchHint: "OPIS Solar Weekly forward curve Q+1 module"},
		{MetricKey: "forward_q2", MetricLabel: "Forward Q+2", MarketRegion: "fob_china", Basis: "forward", PreferredCurrency: "USD", SearchHint: "OPIS Solar Weekly forward curve Q+2 module"},
		{MetricKey: "forward_q3", MetricLabel: "Forward Q+3", MarketRegion: "fob_china", Basis: "forward", PreferredCurrency: "USD", SearchHint: "OPIS Solar Weekly forward curve Q+3 module"},
		{MetricKey: "forward_q4", MetricLabel: "Forward Q+4", MarketRegion: "fob_china", Basis: "forward", PreferredCurrency: "USD", SearchHint: "OPIS Solar Weekly forward curve Q+4 module"},
		{MetricKey: "ddp_europe", MetricLabel: "DDP Europe", MarketRegion: "ddp_europe", Basis: "ddp", PreferredCurrency: "USD", SearchHint: "OPIS Solar Weekly DDP Europe module price"},
	},
	"infolink": {
		{MetricKey: "module_centralized", MetricLabel: "Centralized module", MarketRegion: "china_domestic", Basis: "spot", PreferredCurrency: "CNY", SearchHint: "InfoLink centralized project module price"},
		{MetricKey: "module_distributed", MetricLabel: "Distributed module", MarketRegion: "china_domestic", Basis: "spot", PreferredCurrency: "CNY", SearchHint: "InfoLink distributed project module price"},
		{MetricKey: "polysilicon", MetricLabel: "Polysilicon", MarketRegion: "china_domestic", Basis: "spot", PreferredCurrency: "CNY", SearchHint: "InfoLink polysilicon price"},
	},
	"trendforce": {
		{MetricKey: "china_domestic", MetricLabel: "중국 국내가", MarketRegion: "china_domestic", Basis: "spot", PreferredCurrency: "CNY", SearchHint: "TrendForce EnergyTrend China domestic solar module price"},
		{MetricKey: "china_export", MetricLabel: "중국 수출가", MarketRegion: "china_export", Basis: "spot", PreferredCurrency: "USD", SearchHint: "TrendForce EnergyTrend China export solar module price"},
	},
	"pvinsights": {},
	"china_tender": {
		{MetricKey: "china_state_tender", MetricLabel: "중국 국영 입찰가", MarketRegion: "china_domestic", Basis: "tender", PreferredCurrency: "CNY", SearchHint: "央企 国企 光伏组件 集采 中标 单价 TOPCon"},
	},
	"cpia_floor": {
		{MetricKey: "cpia_cost_floor", MetricLabel: "CPIA cost floor", MarketRegion: "china_domestic", Basis: "floor", PreferredCurrency: "CNY", SearchHint: "CPIA 光伏组件 最低成本 价格 指引"},
	},
}

// List — GET /api/v1/price-benchmarks
func (h *PriceBenchmarkHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("price_benchmarks").
		Select("*", "exact", false).
		In("market_region", model.PriceBenchmarkAllowedMarketRegions()).
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
		if !model.IsPriceBenchmarkMarketRegionAllowed(region) {
			w.Header().Set("X-Total-Count", "0")
			response.RespondJSON(w, http.StatusOK, []model.PriceBenchmark{})
			return
		}
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

	limit, offset := handlerutil.ParseLimitOffset(r, 500, 3000)
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
	limit, offset := handlerutil.ParseLimitOffset(r, 20, 100)
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
	if msg := validateBenchmarkCatalogPolicy(req); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("price_benchmarks").
		Upsert(req, "source_key,source_name,metric_key,value_date,market_region,basis,currency", "", "").
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

// Delete — DELETE /api/v1/price-benchmarks/{id}
// 비유: 신뢰하기 어려운 시세 점 하나를 가격 예측 그래프에서 지우는 것. 실행 로그는 감사 기록으로 남긴다.
func (h *PriceBenchmarkHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.RespondError(w, http.StatusBadRequest, "benchmark_id가 누락됐습니다")
		return
	}

	_, _, err := h.DB.From("price_benchmarks").
		Delete("", "").
		Eq("benchmark_id", id).
		Execute()
	if err != nil {
		log.Printf("[가격 벤치마크 삭제 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "가격 벤치마크 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, model.StatusResponse{Status: "deleted"})
}

// UpdateReviewStatus — PATCH /api/v1/price-benchmarks/{id}/review-status
// 비유: 가격 점을 후보/채택/제외 칸으로 옮겨 차트 기준선을 다듬는다.
func (h *PriceBenchmarkHandler) UpdateReviewStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.RespondError(w, http.StatusBadRequest, "benchmark_id가 누락됐습니다")
		return
	}
	var req model.UpdatePriceBenchmarkReviewStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	req.Normalize()
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	_, _, err := h.DB.From("price_benchmarks").
		Update(map[string]string{"review_status": req.ReviewStatus}, "", "").
		Eq("benchmark_id", id).
		Execute()
	if err != nil {
		log.Printf("[가격 벤치마크 검토 상태 변경 실패] id=%s status=%s err=%v", id, req.ReviewStatus, err)
		if isPriceBenchmarkReviewStatusSchemaError(err) {
			response.RespondError(w, http.StatusServiceUnavailable, "가격 벤치마크 검토 상태 DB 반영이 아직 완료되지 않았습니다. 091_price_benchmark_review_status.sql 적용과 PostgREST 스키마 캐시 갱신 후 다시 시도하세요")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "가격 벤치마크 검토 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, model.StatusResponse{Status: "ok"})
}

func isPriceBenchmarkReviewStatusSchemaError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "PGRST204") ||
		(strings.Contains(msg, "schema cache") &&
			strings.Contains(msg, "price_benchmarks") &&
			strings.Contains(msg, "review_status"))
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

	existingContext, existingWarnings := h.fetchExistingBenchmarkContext(ctx, sources)

	// PR 41: 병렬 분산 + 취합 — source 별 shard 로 분리 호출.
	// 이전 단일 LLM 호출은 모든 source 의 evidence 를 한번에 던져 컨텍스트 초과 빈발.
	// 각 source 를 독립 LLM 호출로 (동시 4 cap), 결과 취합 후 finishRun 으로 마감.
	// PR 47: shard 에 sourceDiagnostic 부착 + evidence hash 동일 시 LLM skip.
	type sourceShard struct {
		src        benchmarkSource
		evidence   []benchmarkEvidenceItem
		warnings   []string
		raw        string
		output     *priceBenchmarkAIOutput
		err        error
		diagnostic sourceDiagnostic // PR 47
	}

	// PR 47: 직전 run 의 source 별 evidence hash 로드 (무변동 skip 용).
	lastHashes := h.loadLastEvidenceHashes(ctx)

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
			sourceContext := existingContext.forSource(src.Key)
			ev, w := h.collectBenchmarkEvidence(srcCtx, []benchmarkSource{src}, sourceContext)
			shards[i].evidence = ev
			shards[i].warnings = w

			// PR 47: 진단 — homepage / search 단계 결과 기록.
			diag := sourceDiagnostic{EvidenceCount: len(ev)}
			homepageBytes := 0
			searchResults := 0
			homepageStatus := "no_homepage"
			if src.Homepage != "" {
				homepageStatus = "both_failed"
				for _, e := range ev {
					if strings.Contains(e.Title, "homepage") {
						homepageBytes = len(e.Content)
						if strings.Contains(e.Title, "scrape") {
							homepageStatus = "scrape_ok"
						} else {
							homepageStatus = "raw_fallback_ok"
						}
						break
					}
				}
			}
			for _, e := range ev {
				if !strings.Contains(e.Title, "homepage") {
					searchResults++
				}
			}
			diag.HomepageStatus = homepageStatus
			diag.HomepageBytes = homepageBytes
			diag.SearchResults = searchResults
			diag.EvidenceHash = hashEvidence(ev)

			if len(ev) == 0 {
				shards[i].warnings = append(shards[i].warnings, fmt.Sprintf("%s: evidence 0 — AI 호출 skip", src.Key))
				log.Printf("[ai-refresh async] src=%s evidence 0", src.Key)
				diag.SkipReason = "evidence_empty"
				diag.LLMParseStatus = "skipped_unchanged" // 의미상 skip
				shards[i].diagnostic = diag
				return
			}

			// PR 47: evidence hash 동일 → LLM skip.
			if prev, ok := lastHashes[src.Key]; ok && prev == diag.EvidenceHash {
				log.Printf("[ai-refresh async] src=%s evidence 무변동 (hash=%s) — LLM skip", src.Key, diag.EvidenceHash[:8])
				shards[i].warnings = append(shards[i].warnings, fmt.Sprintf("%s: evidence 무변동 — 직전 가격 유지 (LLM skip)", src.Key))
				diag.SkipReason = "evidence_unchanged"
				diag.LLMParseStatus = "skipped_unchanged"
				shards[i].diagnostic = diag
				return
			}

			log.Printf("[ai-refresh async] src=%s evidence=%d, LLM 호출 시작", src.Key, len(ev))
			raw, err := h.extractBenchmarksWithAI(srcCtx, provider, llmModel, maxTokens, ev, sourceContext)
			shards[i].raw = raw
			diag.LLMRawLength = len(raw)
			if err != nil {
				shards[i].err = err
				diag.LLMParseStatus = "llm_error"
				shards[i].diagnostic = diag
				log.Printf("[ai-refresh async] src=%s LLM 실패: %v", src.Key, err)
				return
			}
			out, perr := parsePriceBenchmarkAIOutput(raw)
			if perr != nil {
				shards[i].err = perr
				if strings.Contains(perr.Error(), "JSON 객체") {
					diag.LLMParseStatus = "json_not_found"
				} else {
					diag.LLMParseStatus = "unmarshal_err"
				}
				shards[i].diagnostic = diag
				log.Printf("[ai-refresh async] src=%s parse 실패: %v", src.Key, perr)
				return
			}
			shards[i].output = &out
			diag.LLMParseStatus = "ok"
			diag.PointsExtracted = len(out.Points)
			shards[i].diagnostic = diag
			log.Printf("[ai-refresh async] src=%s ok points=%d", src.Key, len(out.Points))
		}(i, src)
	}
	wg.Wait()

	// 취합
	// PR 47: evidence_hashes / diagnostics 도 함께 누적.
	var allEvidence []benchmarkEvidenceItem
	var allWarnings []string
	var allPoints []model.CreatePriceBenchmarkRequest
	var combinedRaw strings.Builder
	evidenceHashes := map[string]string{}
	diagnostics := map[string]sourceDiagnostic{}
	successCount := 0
	allWarnings = append(allWarnings, existingWarnings...)
	for _, sh := range shards {
		allEvidence = append(allEvidence, sh.evidence...)
		allWarnings = append(allWarnings, sh.warnings...)
		evidenceHashes[sh.src.Key] = sh.diagnostic.EvidenceHash
		diagnostics[sh.src.Key] = sh.diagnostic
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
		// PR 47: 모든 skip 인 경우 (무변동만) 는 '실패' 가 아닌 'completed' 처리.
		anyUnchanged := false
		for _, d := range diagnostics {
			if d.SkipReason == "evidence_unchanged" {
				anyUnchanged = true
				break
			}
		}
		if !anyUnchanged {
			msg := "모든 source 추출 실패"
			allWarnings = append(allWarnings, msg)
			h.finishRunWithDiagnostics(runID, "failed", 0, 0, &msg, allWarnings, allEvidence, &rawStr, evidenceHashes, diagnostics, nil)
			log.Printf("[ai-refresh async] run=%s FAILED — 모든 source 실패", runID)
			return
		}
		log.Printf("[ai-refresh async] run=%s 모든 source evidence 무변동 — 갱신 0 (정상)", runID)
		allWarnings = append(allWarnings, "모든 source 무변동: 직전 가격 유지")
		h.finishRunWithDiagnostics(runID, "completed", 0, 0, nil, allWarnings, allEvidence, &rawStr, evidenceHashes, diagnostics, nil)
		return
	}

	// PR 47: spike alert (DB upsert 전 비교).
	spikeWarnings := h.detectPriceSpikes(allPoints)
	allWarnings = append(allWarnings, spikeWarnings...)

	// PR 47: AI 가격정합성 검토 (역사 가격과 비교, 의심 point 식별).
	// 실패해도 run 자체는 계속 — sanity_review 만 nil 로.
	var sanityReview *sanityReviewResult
	reviewCtx, reviewCancel := context.WithTimeout(ctx, 90*time.Second)
	if review, err := h.reviewPriceSanity(reviewCtx, provider, llmModel, maxTokens, allPoints); err == nil && review != nil {
		sanityReview = review
		allWarnings = append(allWarnings, formatSanityWarnings(review)...)
		log.Printf("[ai-refresh async] run=%s 정합성 검토: checked=%d suspect=%d", runID, review.Checked, len(review.Suspect))
	} else if err != nil {
		log.Printf("[ai-refresh async] run=%s 정합성 검토 실패 (무시): %v", runID, err)
	}
	reviewCancel()

	inserted, skipped, _ := h.insertAIBenchmarkPoints(runID, userID, allPoints, existingContext)
	status := "completed"
	if inserted == 0 {
		status = "partial"
		allWarnings = append(allWarnings, "저장 가능한 가격 관측값이 없습니다")
	} else if skipped > 0 || len(allWarnings) > 0 {
		status = "partial"
	}
	h.finishRunWithDiagnostics(runID, status, inserted, skipped, nil, allWarnings, allEvidence, &rawStr, evidenceHashes, diagnostics, sanityReview)
	log.Printf("[ai-refresh async] run=%s %s — inserted=%d skipped=%d warnings=%d", runID, status, inserted, skipped, len(allWarnings))
}

func (h *PriceBenchmarkHandler) fetchExistingBenchmarkContext(ctx context.Context, sources []benchmarkSource) (benchmarkExistingContext, []string) {
	_ = ctx
	sourceKeys := make([]string, 0, len(sources))
	for _, src := range sources {
		sourceKeys = append(sourceKeys, src.Key)
	}
	query := h.DB.From("price_benchmarks").
		Select("source_key,source_name,metric_key,metric_label,value_date,market_region,basis,currency,price_usd_w,price_cny_w,price_krw_w,quarter_label,project_segment,technology,source_url", "exact", false).
		In("market_region", model.PriceBenchmarkAllowedMarketRegions()).
		Order("value_date", &postgrest.OrderOpts{Ascending: false}).
		Range(0, 799, "")
	if len(sourceKeys) > 0 {
		query = query.In("source_key", sourceKeys)
	}
	data, _, err := query.Execute()
	if err != nil {
		return buildBenchmarkExistingContext(sources, nil), []string{fmt.Sprintf("기존 가격 벤치마크 조회 실패: %v", err)}
	}
	var rows []model.PriceBenchmark
	if err := json.Unmarshal(data, &rows); err != nil {
		return buildBenchmarkExistingContext(sources, nil), []string{fmt.Sprintf("기존 가격 벤치마크 디코딩 실패: %v", err)}
	}
	return buildBenchmarkExistingContext(sources, rows), nil
}

func buildBenchmarkExistingContext(sources []benchmarkSource, rows []model.PriceBenchmark) benchmarkExistingContext {
	out := benchmarkExistingContext{
		RefreshPolicy: []string{
			"existing_observation_keys 와 동일한 source_key|metric_key|value_date|market_region|basis|currency 관측값은 다시 출력하지 않는다",
			"latest_by_slot 에 있는 지표는 evidence 의 value_date 가 latest_date 보다 최신일 때만 출력한다",
			"missing_focus 에 있는 source/metric/market_region/basis 조합을 먼저 찾고, 근거가 없으면 warnings 에 이유를 남긴다",
		},
		keySet:          map[string]bool{},
		latestBySource:  map[string]string{},
		missingBySource: map[string][]benchmarkMissingFocus{},
	}
	sourceNames := map[string]string{}
	for _, src := range sources {
		sourceNames[src.Key] = src.Name
	}

	latestBySlot := map[string]benchmarkExistingSlot{}
	targetPresent := map[string]bool{}
	for _, row := range rows {
		key := benchmarkObservationKey(row.SourceKey, row.MetricKey, row.ValueDate, row.MarketRegion, row.Basis, row.Currency)
		if key != "" && !out.keySet[key] {
			out.keySet[key] = true
			out.ExistingObservationKeys = append(out.ExistingObservationKeys, key)
		}
		slotKey := benchmarkSlotKey(row.SourceKey, row.MetricKey, row.MarketRegion, row.Basis)
		if slotKey == "" {
			continue
		}
		targetPresent[slotKey] = true
		if row.SourceName != "" {
			sourceNames[row.SourceKey] = row.SourceName
		}
		if row.ValueDate > out.latestBySource[row.SourceKey] {
			out.latestBySource[row.SourceKey] = row.ValueDate
		}
		prev, ok := latestBySlot[slotKey]
		if !ok || row.ValueDate > prev.LatestDate {
			latestBySlot[slotKey] = benchmarkExistingSlot{
				SourceKey:      row.SourceKey,
				SourceName:     firstNonEmpty(row.SourceName, sourceNames[row.SourceKey], benchmarkSourceName(row.SourceKey)),
				MetricKey:      row.MetricKey,
				MetricLabel:    firstNonEmpty(row.MetricLabel, row.MetricKey),
				LatestDate:     row.ValueDate,
				MarketRegion:   row.MarketRegion,
				Basis:          row.Basis,
				Currency:       row.Currency,
				PriceUSDW:      row.PriceUSDW,
				PriceCNYW:      row.PriceCNYW,
				PriceKRWW:      row.PriceKRWW,
				QuarterLabel:   row.QuarterLabel,
				ProjectSegment: row.ProjectSegment,
				Technology:     row.Technology,
				SourceURL:      row.SourceURL,
			}
		}
	}

	sort.Strings(out.ExistingObservationKeys)
	for _, slot := range latestBySlot {
		out.LatestBySlot = append(out.LatestBySlot, slot)
	}
	sort.Slice(out.LatestBySlot, func(i, j int) bool {
		a := out.LatestBySlot[i]
		b := out.LatestBySlot[j]
		if a.SourceKey != b.SourceKey {
			return a.SourceKey < b.SourceKey
		}
		if a.MetricKey != b.MetricKey {
			return a.MetricKey < b.MetricKey
		}
		return a.LatestDate > b.LatestDate
	})

	for _, src := range sources {
		targets := benchmarkTargetMatrix[src.Key]
		for _, target := range targets {
			slotKey := benchmarkSlotKey(src.Key, target.MetricKey, target.MarketRegion, target.Basis)
			if targetPresent[slotKey] {
				continue
			}
			missing := benchmarkMissingFocus{
				SourceKey:         src.Key,
				SourceName:        firstNonEmpty(sourceNames[src.Key], src.Name),
				MetricKey:         target.MetricKey,
				MetricLabel:       target.MetricLabel,
				MarketRegion:      target.MarketRegion,
				Basis:             target.Basis,
				PreferredCurrency: target.PreferredCurrency,
				SearchHint:        target.SearchHint,
				Reason:            "현재 DB에 해당 source/metric/region/basis 관측값이 없음",
			}
			out.MissingFocus = append(out.MissingFocus, missing)
			out.missingBySource[src.Key] = append(out.missingBySource[src.Key], missing)
		}
	}

	return out
}

func (c benchmarkExistingContext) forSource(sourceKey string) benchmarkExistingContext {
	sourceKey = benchmarkNormalizeKey(sourceKey)
	out := benchmarkExistingContext{
		RefreshPolicy:   append([]string(nil), c.RefreshPolicy...),
		keySet:          map[string]bool{},
		latestBySource:  map[string]string{},
		missingBySource: map[string][]benchmarkMissingFocus{},
	}
	for _, key := range c.ExistingObservationKeys {
		if strings.HasPrefix(key, sourceKey+"|") {
			out.ExistingObservationKeys = append(out.ExistingObservationKeys, key)
			out.keySet[key] = true
		}
	}
	for _, slot := range c.LatestBySlot {
		if slot.SourceKey == sourceKey {
			out.LatestBySlot = append(out.LatestBySlot, slot)
		}
	}
	for _, missing := range c.MissingFocus {
		if missing.SourceKey == sourceKey {
			out.MissingFocus = append(out.MissingFocus, missing)
			out.missingBySource[sourceKey] = append(out.missingBySource[sourceKey], missing)
		}
	}
	if latest := c.latestBySource[sourceKey]; latest != "" {
		out.latestBySource[sourceKey] = latest
	}
	return out
}

func (c benchmarkExistingContext) hasObservation(sourceKey, metricKey, valueDate, marketRegion, basis, currency string) bool {
	if c.keySet == nil {
		return false
	}
	return c.keySet[benchmarkObservationKey(sourceKey, metricKey, valueDate, marketRegion, basis, currency)]
}

func (h *PriceBenchmarkHandler) collectBenchmarkEvidence(ctx context.Context, sources []benchmarkSource, existing benchmarkExistingContext) ([]benchmarkEvidenceItem, []string) {
	var evidence []benchmarkEvidenceItem
	var warnings []string
	// PR 45: Tavily → Serper 전환
	serperKey := strings.TrimSpace(os.Getenv("SERPER_API_KEY"))
	if serperKey == "" {
		warnings = append(warnings, "SERPER_API_KEY 미설정: 공개 URL 직접 조회와 AI 추출만 사용했습니다")
	}

	for _, src := range sources {
		if urls := src.homepageURLs(); len(urls) > 0 {
			// PR 48: 1차 Homepage + HomepageFallbacks 를 순서대로 시도.
			// 각 URL 마다 Serper scrape (정제된 markdown) → raw HTTP 순서. 첫 성공에서 종료.
			// 모두 실패하면 attempt 들을 status code 별로 묶어 한 줄 warning + 웹 검색 fallback 안내.
			item, attempts, ok := h.tryFetchHomepage(ctx, serperKey, src, urls)
			if ok {
				evidence = append(evidence, item)
			} else {
				warnings = append(warnings, summarizeHomepageFailure(src.Name, attempts, serperKey != ""))
			}
		}
		if serperKey == "" {
			continue
		}
		searchEvidence, searchWarnings := h.collectSerperSearchEvidence(ctx, serperKey, src, existing)
		evidence = append(evidence, searchEvidence...)
		warnings = append(warnings, searchWarnings...)
	}

	if len(evidence) == 0 {
		warnings = append(warnings, "수집 증거 텍스트가 없습니다. 유료 리포트 로그인/검색 키 설정을 확인하세요")
	}
	return evidence, warnings
}

func (h *PriceBenchmarkHandler) collectSerperSearchEvidence(ctx context.Context, apiKey string, src benchmarkSource, existing benchmarkExistingContext) ([]benchmarkEvidenceItem, []string) {
	plans := buildBenchmarkSearchPlans(src, existing)
	var evidence []benchmarkEvidenceItem
	var warnings []string
	seen := map[string]bool{}
	scraped := 0
	for _, plan := range plans {
		results, err := h.searchSerperForSource(ctx, apiKey, plan, benchmarkSearchResultsPerQuery)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s 웹 검색 실패(%s): %v", src.Name, benchmarkSearchPlanLabel(plan), err))
			continue
		}
		for _, result := range results {
			key := searchResultDedupeKey(result)
			if key == "" || seen[key] {
				continue
			}
			seen[key] = true
			item := benchmarkEvidenceItem{
				SourceKey:  src.Key,
				SourceName: src.Name,
				Title:      result.Title,
				URL:        result.URL,
				Content:    truncate(result.Content, 900), // PR 44: vLLM 응답 시간 단축 위해 축소
			}
			if scraped < benchmarkSearchScrapeLimitPerSource {
				if scrapedItem, err := h.fetchSearchResultEvidenceViaSerperScrape(ctx, apiKey, src, result); err == nil {
					item = scrapedItem
					scraped++
				}
			}
			evidence = append(evidence, item)
			if len(evidence) >= benchmarkMaxSearchEvidencePerSource {
				return evidence, warnings
			}
		}
	}
	if len(evidence) == 0 && len(plans) > 0 {
		warnings = append(warnings, fmt.Sprintf("%s 웹 검색 결과 0건 (검색어 %d개 시도)", src.Name, len(plans)))
	}
	return evidence, warnings
}

func (h *PriceBenchmarkHandler) fetchSearchResultEvidenceViaSerperScrape(ctx context.Context, apiKey string, src benchmarkSource, result webSearchResultItem) (benchmarkEvidenceItem, error) {
	target := strings.TrimSpace(result.URL)
	if target == "" {
		return benchmarkEvidenceItem{}, fmt.Errorf("검색 결과 URL 없음")
	}
	u, err := url.Parse(target)
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	if err := guardFetchURL(u); err != nil {
		return benchmarkEvidenceItem{}, err
	}
	variant := src
	variant.Homepage = target
	item, err := h.fetchHomepageViaSerperScrape(ctx, apiKey, variant)
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	item.Title = firstNonEmpty(result.Title, item.Title) + " (search scrape)"
	item.URL = target
	return item, nil
}

// homepageAttempt — 한 번의 fetch 시도 결과. 모두 실패했을 때 warning 한 줄로 요약하기 위한 재료.
type homepageAttempt struct {
	url    string
	method string // "scrape" | "raw"
	err    error
}

// tryFetchHomepage — urls 를 순서대로 (각 URL 에 대해 scrape → raw) 시도하고, 첫 성공에서 evidence 반환.
// 모두 실패하면 attempts 와 ok=false 반환. 호출부에서 attempts 를 summarizeHomepageFailure 로 한 줄 warning 화.
func (h *PriceBenchmarkHandler) tryFetchHomepage(ctx context.Context, apiKey string, src benchmarkSource, urls []string) (benchmarkEvidenceItem, []homepageAttempt, bool) {
	var attempts []homepageAttempt
	for _, u := range urls {
		variant := src
		variant.Homepage = u
		if item, err := h.fetchHomepageViaSerperScrape(ctx, apiKey, variant); err == nil {
			return item, attempts, true
		} else {
			attempts = append(attempts, homepageAttempt{url: u, method: "scrape", err: err})
		}
		if item, err := h.fetchHomepageEvidence(ctx, variant); err == nil {
			return item, attempts, true
		} else {
			attempts = append(attempts, homepageAttempt{url: u, method: "raw", err: err})
		}
	}
	return benchmarkEvidenceItem{}, attempts, false
}

// summarizeHomepageFailure — 여러 URL × (scrape/raw) 시도 결과를 한 줄 warning 으로 압축.
// 같은 status code (예: HTTP 404) 끼리는 "HTTP 404×4" 처럼 카운트만 표기.
// searchFallback=true 면 "웹 검색으로 대체" 안내를 덧붙여 운영자가 fatal 인지 헷갈리지 않도록.
func summarizeHomepageFailure(srcName string, attempts []homepageAttempt, searchFallback bool) string {
	if len(attempts) == 0 {
		return fmt.Sprintf("%s 홈페이지 조회 실패", srcName)
	}
	buckets := map[string]int{}
	var keys []string
	for _, a := range attempts {
		k := normalizeHomepageError(a.err)
		if _, ok := buckets[k]; !ok {
			keys = append(keys, k)
		}
		buckets[k]++
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		if buckets[k] > 1 {
			parts = append(parts, fmt.Sprintf("%s×%d", k, buckets[k]))
		} else {
			parts = append(parts, k)
		}
	}
	urlCount := uniqueURLCount(attempts)
	summary := fmt.Sprintf("%s 홈페이지 조회 실패 (URL %d개·%s)", srcName, urlCount, strings.Join(parts, ", "))
	if searchFallback {
		summary += " — 웹 검색으로 대체"
	}
	return summary
}

// normalizeHomepageError — error 를 bucket key 로 정규화. "HTTP 404: ..." → "HTTP 404".
func normalizeHomepageError(err error) string {
	msg := err.Error()
	if strings.HasPrefix(msg, "HTTP ") {
		if i := strings.IndexByte(msg, ':'); i > 0 {
			return strings.TrimSpace(msg[:i])
		}
	}
	if len(msg) > 80 {
		return msg[:80] + "…"
	}
	return msg
}

// uniqueURLCount — attempts 에 등장한 distinct URL 수 (scrape/raw 같은 URL 은 1로 셈).
func uniqueURLCount(attempts []homepageAttempt) int {
	seen := map[string]bool{}
	for _, a := range attempts {
		seen[a.url] = true
	}
	return len(seen)
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

// searchSerperForSource — PR 46: source 별 endpoint(/search|/news|/scholar)·tbs·site 분기 호출.
// /news 응답은 news[] 배열이므로 별도 파싱 분기.
func (h *PriceBenchmarkHandler) searchSerperForSource(ctx context.Context, apiKey string, src benchmarkSource, maxResults int) ([]webSearchResultItem, error) {
	endpoint := src.Endpoint
	if endpoint == "" {
		endpoint = "search"
	}
	url := "https://google.serper.dev/" + endpoint
	q := buildSerperQuery(src.Query, src.Site, "", "", "")
	reqBody := map[string]any{
		"q":   q,
		"num": clampLimit(maxResults, 3, 6),
		"gl":  "kr",
		"hl":  "ko",
	}
	if tbs := timeWindowToTBS(src.TimeWindow); tbs != "" {
		reqBody["tbs"] = tbs
	}
	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
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
	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	// /news 응답은 news[] 배열, /search·/scholar 는 organic[].
	if endpoint == "news" {
		var parsed struct {
			News []struct {
				Title   string `json:"title"`
				Link    string `json:"link"`
				Snippet string `json:"snippet"`
				Date    string `json:"date"`
				Source  string `json:"source"`
			} `json:"news"`
		}
		if err := json.Unmarshal(rawBody, &parsed); err != nil {
			return nil, err
		}
		out := make([]webSearchResultItem, 0, len(parsed.News))
		for _, n := range parsed.News {
			out = append(out, webSearchResultItem{
				Title:   n.Title,
				URL:     n.Link,
				Content: strings.TrimSpace(n.Snippet + " (" + n.Source + " · " + n.Date + ")"),
				Score:   1.0,
				Date:    n.Date,
			})
		}
		return out, nil
	}
	var parsed serperResponse
	if err := json.Unmarshal(rawBody, &parsed); err != nil {
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

// fetchHomepageViaSerperScrape — PR 46. scrape.serper.dev 로 외부 페이지 본문을
// markdown 으로 추출. raw HTML 24KB 잘라먹기 대신 정제된 본문 → vLLM 토큰 효율 ↑.
// SERPER_API_KEY 부재 시 즉시 에러 (호출부에서 fallback 으로 raw GET 시도).
func (h *PriceBenchmarkHandler) fetchHomepageViaSerperScrape(ctx context.Context, apiKey string, src benchmarkSource) (benchmarkEvidenceItem, error) {
	if apiKey == "" {
		return benchmarkEvidenceItem{}, fmt.Errorf("SERPER_API_KEY 미설정")
	}
	body, _ := json.Marshal(map[string]any{
		"url":             src.Homepage,
		"includeMarkdown": true,
	})
	scrapeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(scrapeCtx, http.MethodPost, "https://scrape.serper.dev", bytes.NewReader(body))
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", apiKey)
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return benchmarkEvidenceItem{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return benchmarkEvidenceItem{}, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	var parsed serperScrapeResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&parsed); err != nil {
		return benchmarkEvidenceItem{}, err
	}
	// markdown 우선, 없으면 text. truncate 2400 (raw HTML 보다 정보 밀도가 높아 동일 cap 으로 충분).
	content := parsed.Markdown
	if content == "" {
		content = parsed.Text
	}
	if content == "" {
		return benchmarkEvidenceItem{}, fmt.Errorf("scrape 결과 본문 비어있음")
	}
	return benchmarkEvidenceItem{
		SourceKey:  src.Key,
		SourceName: src.Name,
		Title:      src.Name + " homepage (scrape)",
		URL:        src.Homepage,
		Content:    truncate(content, 2400),
	}, nil
}

func buildBenchmarkExtractionMessages(evidence []benchmarkEvidenceItem, existing benchmarkExistingContext) (string, string) {
	system := `당신은 SolarFlow 가격예측용 태양광 모듈 가격 벤치마크 추출기입니다.
반드시 제공된 evidence 안에 명시된 가격만 추출하세요. 추정, 보간, 상식, 오래된 기억으로 값을 만들면 안 됩니다.
이미 DB에 있는 관측값은 다시 수집하지 않습니다. existing_context.existing_observation_keys 와 동일한 source_key|metric_key|value_date|market_region|basis|currency 키는 evidence 에 보여도 points 에 넣지 마세요.
latest_by_slot 에 있는 기존 지표는 evidence 의 value_date 가 latest_date 보다 최신일 때만 추출하세요. 같은 날짜의 보강·재요약은 금지입니다.
missing_focus 는 현재 SolarFlow에 없는 source/metric/market_region/basis 조합입니다. 이 항목을 가장 먼저 샅샅이 확인하고, 찾지 못한 항목은 warnings 에 구체적으로 남기세요.
missing_focus 밖의 값은 evidence에 가격·날짜·단위가 모두 명확하고 기존 키와 중복되지 않을 때만 보조로 추출하세요.
출력은 JSON 객체 하나만 반환하세요. Markdown, 설명문, 코드블록은 금지입니다.

소스별 추출 제약:
- 수집 대상 지역은 중국/유럽만입니다. market_region 은 fob_china, china_domestic, china_export, cif_europe, ddp_europe 중 하나만 허용합니다.
- 한국 도착가(CIF Korea, DDP Korea) 는 자체 거래 자료로만 관리하므로 시장 수집 대상이 아닙니다. 한국 도착가 evidence 는 points 에 넣지 말고 warnings 에 제외 이유만 남기세요.
- 유럽 CIF 가격이 있으면 market_region=cif_europe, basis=cif 로 추출하세요. 한국 도착가의 시장 프록시로 활용합니다.
- 중국 내수(china_domestic) 에는 CIF/FOB 인코텀즈 개념이 없습니다. basis 는 spot 으로 두세요.
- ddp_us, usa, north_america, india, global, manufacturer 등 중국/유럽 밖 가격은 evidence 에 가격이 있어도 points 에 넣지 말고 warnings 에 제외 이유만 남기세요.
- forward 가격은 중국 FOB 또는 유럽 CIF/DDP 근거가 명시된 경우에만 추출하세요.
- InfoLink: module_centralized / module_distributed / polysilicon 만 추출. cell, wafer 는 evidence 에 가격이 있어도 절대 추출하지 마세요.
형식:
{
  "points": [
    {
      "source_key": "opis|infolink|trendforce|pvinsights|china_tender|cpia_floor",
      "source_name": "표시명",
      "metric_key": "cmm_fob_china_topcon_600w|forward_q1|forward_q2|forward_q3|forward_q4|ddp_europe|module_centralized|module_distributed|polysilicon|china_domestic|china_export|china_state_tender|cpia_cost_floor",
      "metric_label": "운영자가 보는 짧은 라벨",
      "value_date": "YYYY-MM-DD",
      "period_label": "weekly|daily|monthly|Q+1 등",
      "market_region": "fob_china|ddp_europe|china_domestic|china_export|cif_europe",
      "basis": "fob|cif|ddp|spot|forward|tender|floor",
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
		"today":            time.Now().Format("2006-01-02"),
		"sources":          benchmarkSourcesForEvidence(evidence),
		"existing_context": existing,
		"evidence":         evidence,
	}, "", "  ")
	user := "다음 evidence 에서 중국/유럽 가격 관측값만 추출하세요. 이미 가진 정보는 재수집하지 말고 existing_context.missing_focus 의 결측 지표와 latest_by_slot 이후의 최신 관측값을 우선하세요. 미국·기타 지역 가격은 points 에 넣지 말고 warnings 에 제외 이유만 남기세요.\n" + string(payload)
	return system, user
}

func (h *PriceBenchmarkHandler) extractBenchmarksWithAI(ctx context.Context, provider, llmModel string, maxTokens int, evidence []benchmarkEvidenceItem, existing benchmarkExistingContext) (string, error) {
	system, user := buildBenchmarkExtractionMessages(evidence, existing)

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

func validateBenchmarkCatalogPolicy(point model.CreatePriceBenchmarkRequest) string {
	if !allowedBenchmarkSources[point.SourceKey] {
		return "허용되지 않은 source_key입니다: " + point.SourceKey
	}
	if !allowedBenchmarkMetrics[point.MetricKey] {
		return "허용되지 않은 metric_key입니다: " + point.MetricKey
	}
	if !model.IsPriceBenchmarkMarketRegionAllowed(point.MarketRegion) {
		return "허용되지 않은 market_region입니다: " + point.MarketRegion
	}
	if !allowedBenchmarkBasis[point.Basis] {
		return "허용되지 않은 basis입니다: " + point.Basis
	}
	if !allowedBenchmarkCurrencies[point.Currency] {
		return "허용되지 않은 currency입니다: " + point.Currency
	}
	if point.SourceKey == "infolink" && (point.MetricKey == "cell" || point.MetricKey == "wafer") {
		return "InfoLink cell/wafer 지표는 수집 대상이 아닙니다"
	}
	if point.SourceKey == "our_quote" && point.MetricKey != "supplier_quote" {
		return "our_quote source는 supplier_quote 지표만 허용됩니다"
	}
	if point.MetricKey == "supplier_quote" && point.SourceKey != "our_quote" {
		return "supplier_quote 지표는 our_quote source에서만 허용됩니다"
	}
	return ""
}

func (h *PriceBenchmarkHandler) insertAIBenchmarkPoints(runID, userID string, points []model.CreatePriceBenchmarkRequest, existing benchmarkExistingContext) (int, int, []model.PriceBenchmark) {
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
		if !model.IsPriceBenchmarkMarketRegionAllowed(point.MarketRegion) {
			log.Printf("[가격 벤치마크 AI point skip] market_region=%s 는 중국/유럽 수집 대상이 아님", point.MarketRegion)
			skipped++
			continue
		}
		if point.SourceKey == "our_quote" {
			log.Printf("[가격 벤치마크 AI point skip] our_quote 는 수동 입력 전용")
			skipped++
			continue
		}
		// AI 가 시스템 프롬프트의 InfoLink 제외 지시를 무시해도 여기서 차단.
		if point.SourceKey == "infolink" && (point.MetricKey == "cell" || point.MetricKey == "wafer") {
			log.Printf("[가격 벤치마크 AI point skip] InfoLink %s 는 정책상 제외", point.MetricKey)
			skipped++
			continue
		}
		if existing.hasObservation(point.SourceKey, point.MetricKey, point.ValueDate, point.MarketRegion, point.Basis, point.Currency) {
			log.Printf("[가격 벤치마크 AI point skip] 기존 관측값 재수집 제외: %s", benchmarkObservationKey(point.SourceKey, point.MetricKey, point.ValueDate, point.MarketRegion, point.Basis, point.Currency))
			skipped++
			continue
		}
		if msg := point.Validate(); msg != "" {
			log.Printf("[가격 벤치마크 AI point skip] %s", msg)
			skipped++
			continue
		}
		if msg := validateBenchmarkCatalogPolicy(point); msg != "" {
			log.Printf("[가격 벤치마크 AI point skip] %s", msg)
			skipped++
			continue
		}
		data, _, err := h.DB.From("price_benchmarks").
			Upsert(point, "source_key,source_name,metric_key,value_date,market_region,basis,currency", "", "").
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
	h.finishRunWithDiagnostics(runID, status, inserted, skipped, errMsg, warnings, evidence, raw, nil, nil, nil)
}

// finishRunWithDiagnostics — PR 47. evidence_hashes / diagnostics / sanity_review 컬럼 함께 기록.
// 인자 nil 이면 해당 컬럼 미갱신.
func (h *PriceBenchmarkHandler) finishRunWithDiagnostics(
	runID, status string,
	inserted, skipped int,
	errMsg *string,
	warnings []string,
	evidence []benchmarkEvidenceItem,
	raw *string,
	evidenceHashes map[string]string,
	diagnostics map[string]sourceDiagnostic,
	sanityReview *sanityReviewResult,
) {
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
	if evidenceHashes != nil {
		payload["evidence_hashes"] = evidenceHashes
	}
	if diagnostics != nil {
		payload["diagnostics"] = diagnostics
	}
	if sanityReview != nil {
		payload["sanity_review"] = sanityReview
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

func benchmarkSourcesForEvidence(evidence []benchmarkEvidenceItem) []benchmarkSource {
	seen := map[string]bool{}
	var out []benchmarkSource
	for _, item := range evidence {
		key := benchmarkNormalizeKey(item.SourceKey)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		src := benchmarkSourceByKey(key)
		if src.Key == "" {
			src = benchmarkSource{Key: key, Name: firstNonEmpty(item.SourceName, benchmarkSourceName(key))}
		}
		out = append(out, src)
	}
	if len(out) == 0 {
		return benchmarkSources
	}
	return out
}

func benchmarkSourceByKey(sourceKey string) benchmarkSource {
	for _, src := range benchmarkSources {
		if src.Key == sourceKey {
			return src
		}
	}
	return benchmarkSource{}
}

func buildBenchmarkSearchPlans(src benchmarkSource, existing benchmarkExistingContext) []benchmarkSource {
	plans := make([]benchmarkSource, 0, benchmarkMaxSearchQueriesPerSource)
	seen := map[string]bool{}
	addPlan := func(plan benchmarkSource) {
		if len(plans) >= benchmarkMaxSearchQueriesPerSource {
			return
		}
		plan.Query = strings.TrimSpace(plan.Query)
		if plan.Query == "" {
			return
		}
		key := strings.Join([]string{
			strings.ToLower(plan.Endpoint),
			strings.ToLower(plan.TimeWindow),
			strings.ToLower(plan.Site),
			strings.ToLower(plan.Query),
		}, "\x1f")
		if seen[key] {
			return
		}
		seen[key] = true
		plans = append(plans, plan)
	}

	primary := benchmarkSourceWithMissingFocus(src, existing)
	addPlan(primary)
	for _, missing := range existing.missingBySource[src.Key] {
		plan := src
		plan.Query = strings.TrimSpace(src.Name + " " + missing.SearchHint)
		if latest := existing.latestBySource[src.Key]; latest != "" {
			plan.Query += " latest updated after " + latest
		} else {
			plan.Query += " latest current price"
		}
		addPlan(plan)
	}
	for _, variant := range src.QueryVariants {
		plan := src
		plan.Query = variant
		if latest := existing.latestBySource[src.Key]; latest != "" {
			plan.Query += " latest updated after " + latest
		}
		addPlan(plan)
	}
	if relaxed := relaxedBenchmarkTimeWindow(src.TimeWindow); relaxed != "" && relaxed != src.TimeWindow {
		plan := primary
		plan.TimeWindow = relaxed
		addPlan(plan)
	}
	return plans
}

func benchmarkSourceWithMissingFocus(src benchmarkSource, existing benchmarkExistingContext) benchmarkSource {
	missing := existing.missingBySource[src.Key]
	if len(missing) == 0 {
		if latest := existing.latestBySource[src.Key]; latest != "" {
			src.Query = src.Query + " latest updated after " + latest
		}
		return src
	}
	hints := make([]string, 0, len(missing))
	for _, item := range missing {
		hints = append(hints, item.SearchHint)
	}
	src.Query = src.Query + " missing metrics focus " + strings.Join(hints, " OR ")
	if latest := existing.latestBySource[src.Key]; latest != "" {
		src.Query += " latest updated after " + latest
	} else {
		src.Query += " latest current price"
	}
	return src
}

func relaxedBenchmarkTimeWindow(primary string) string {
	switch strings.ToLower(strings.TrimSpace(primary)) {
	case "day", "d":
		return "week"
	case "week", "w":
		return "month"
	case "month", "m":
		return "year"
	default:
		return ""
	}
}

func benchmarkSearchPlanLabel(plan benchmarkSource) string {
	endpoint := plan.Endpoint
	if endpoint == "" {
		endpoint = "search"
	}
	window := plan.TimeWindow
	if window == "" {
		window = "all"
	}
	return endpoint + "/" + window
}

func searchResultDedupeKey(result webSearchResultItem) string {
	if u := strings.TrimSpace(result.URL); u != "" {
		return u
	}
	key := strings.ToLower(strings.TrimSpace(result.Title + "|" + result.Content))
	return key
}

func benchmarkObservationKey(sourceKey, metricKey, valueDate, marketRegion, basis, currency string) string {
	parts := []string{
		benchmarkNormalizeKey(sourceKey),
		benchmarkNormalizeKey(metricKey),
		strings.TrimSpace(valueDate),
		benchmarkNormalizeKey(marketRegion),
		benchmarkNormalizeKey(basis),
		strings.ToUpper(strings.TrimSpace(currency)),
	}
	for _, part := range parts {
		if part == "" {
			return ""
		}
	}
	return strings.Join(parts, "|")
}

func benchmarkSlotKey(sourceKey, metricKey, marketRegion, basis string) string {
	parts := []string{
		benchmarkNormalizeKey(sourceKey),
		benchmarkNormalizeKey(metricKey),
		benchmarkNormalizeKey(marketRegion),
		benchmarkNormalizeKey(basis),
	}
	for _, part := range parts {
		if part == "" {
			return ""
		}
	}
	return strings.Join(parts, "|")
}

func benchmarkNormalizeKey(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	v = strings.ReplaceAll(v, " ", "_")
	v = strings.ReplaceAll(v, "-", "_")
	return v
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
