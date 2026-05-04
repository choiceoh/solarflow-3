package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/response"
)

// PublicHandler — 인증 없이 접근 가능한 read-only 엔드포인트.
// 비유: "건물 로비의 안내판" — 로그인 전 화면(LoginPage)에서 보여주는
// 회사 KPI/환율 정보. 민감한 거래 데이터는 절대 노출하지 않는다.
type PublicHandler struct {
	DB     *supa.Client
	Engine *engine.EngineClient
	HTTP   *http.Client

	fxMu    sync.Mutex
	fxCache map[string]*fxSnapshot // pair → snapshot (usdkrw, cnykrw)

	metalMu     sync.Mutex
	metalCache  map[string]*metalSnapshot
	metalKey    string
	metalSource string

	commoditiesPath string
}

// NewPublicHandler — PublicHandler 생성자.
// engineClient는 nil 가능 — 그 경우 인벤토리 합계는 null로 응답.
func NewPublicHandler(db *supa.Client, engineClient *engine.EngineClient) *PublicHandler {
	h := &PublicHandler{
		DB:          db,
		Engine:      engineClient,
		HTTP:        &http.Client{Timeout: 6 * time.Second},
		fxCache:     make(map[string]*fxSnapshot),
		metalCache:  make(map[string]*metalSnapshot),
		metalKey:    os.Getenv("METAL_PRICE_API_KEY"),
		metalSource: "metalpriceapi.com",

		commoditiesPath: commoditiesFilePath(),
	}
	// 부팅 시 fx_daily 50일 백필 — ECOS 범위 호출이라 페어당 1회 (총 2회).
	// 비동기로 startup 지연 회피, 실패해도 무시.
	go h.backfillFXDaily(50)
	return h
}

func commoditiesFilePath() string {
	if p := os.Getenv("COMMODITIES_FILE"); p != "" {
		return p
	}
	if home, err := os.UserHomeDir(); err == nil {
		return home + "/.config/solarflow/commodities.json"
	}
	return "/etc/solarflow/commodities.json"
}

// === FX (USD/KRW, CNY/KRW) — 한국은행 ECOS 매매기준율 ===
//
// 한국은행 ECOS 통계코드 731Y001 (주요국 통화의 대원화환율, 일별)을 사용한다.
// 페어당 1회 범위 호출이면 30~50일치 시계열 + 최신 spot 까지 모두 받을 수 있어
// metalpriceapi 30회 historical 호출이 페어당 1회 (총 2회) 로 줄어든다.
//
// BOK는 영업일에만 발표 → 응답에 주말/공휴일 행 없음. fx_daily 에도 영업일만 누적.
// L/C 우측 패널 sparkline 용 참고치(매매기준율). 실제 개설 환율은 거래은행
// 전신환매도율로 별도이며, 이 값은 시장 추이 표시 목적.

// ECOS API 키 — 공개 통계 데이터 접근용 (rate-limit 외 악용 가능 표면 없음).
const ecosAPIKey = "AY150WBZGJNTX89286FZ"

// fx_daily.source 컬럼 라벨 — 출처 추적 용도.
const ecosFXSource = "ecos.bok.or.kr"

// ECOS 통계코드 — 주요국 통화의 대원화환율(매매기준율, 일별).
const ecosFXStatCode = "731Y001"

// 페어 → ECOS 항목 코드 (731Y001 통계 안에서 통화 구분).
//   0000001 = 원/미국달러(매매기준율)
//   0000053 = 원/위안(매매기준율)
var fxPairs = map[string]string{
	"usdkrw": "0000001",
	"cnykrw": "0000053",
}

type fxSnapshot struct {
	Rate      float64   `json:"rate"`
	ChangePct *float64  `json:"change_pct"`
	Source    string    `json:"source"`
	FetchedAt time.Time `json:"fetched_at"`
}

// 5분 캐시 — ECOS는 일별 발표라 더 길게도 가능하지만 spot 경로 일관성 유지.
const fxTTL = 5 * time.Minute

// ECOS 응답 row — TIME 은 YYYYMMDD, DATA_VALUE 는 환율 문자열.
type ecosFXRow struct {
	Time      string `json:"TIME"`
	DataValue string `json:"DATA_VALUE"`
}

type ecosFXResponse struct {
	StatisticSearch *struct {
		Row []ecosFXRow `json:"row"`
	} `json:"StatisticSearch"`
	Result *struct {
		Code    string `json:"CODE"`
		Message string `json:"MESSAGE"`
	} `json:"RESULT"`
}

// fetchECOSRange — 페어를 ECOS에서 [startYMD, endYMD] 범위로 한 번에 조회.
// 영업일만 응답에 포함 → 캘린더 N일이면 영업일은 약 N*5/7 행. 날짜는 YYYYMMDD.
// 결과는 date ASC 정렬. 빈 응답(INFO-200)은 nil, nil 로 반환.
func (h *PublicHandler) fetchECOSRange(pair, startYMD, endYMD string) ([]fxPoint, error) {
	item, ok := fxPairs[pair]
	if !ok {
		return nil, fmt.Errorf("페어 미지원: %s", pair)
	}
	url := fmt.Sprintf("https://ecos.bok.or.kr/api/StatisticSearch/%s/json/kr/1/200/%s/D/%s/%s/%s",
		ecosAPIKey, ecosFXStatCode, startYMD, endYMD, item)
	body, err := h.httpGet(url)
	if err != nil {
		return nil, err
	}
	var parsed ecosFXResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("ECOS 응답 파싱: %w", err)
	}
	if parsed.StatisticSearch == nil {
		// INFO-200 = 데이터 없음 (미래 날짜·키 직후 등). 호출 자체는 정상.
		if parsed.Result != nil && parsed.Result.Code == "INFO-200" {
			return nil, nil
		}
		if parsed.Result != nil {
			return nil, fmt.Errorf("ECOS error %s: %s", parsed.Result.Code, parsed.Result.Message)
		}
		return nil, fmt.Errorf("ECOS 응답 구조 비정상")
	}
	rows := parsed.StatisticSearch.Row
	out := make([]fxPoint, 0, len(rows))
	for _, r := range rows {
		if len(r.Time) != 8 {
			continue
		}
		rate, err := strconv.ParseFloat(r.DataValue, 64)
		if err != nil || rate <= 0 {
			continue
		}
		// 20260401 → 2026-04-01
		iso := r.Time[:4] + "-" + r.Time[4:6] + "-" + r.Time[6:]
		out = append(out, fxPoint{Date: iso, Rate: rate})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out, nil
}

// FXSpot — GET /api/v1/public/fx/{pair}
// 단일 페어 최신 매매기준율 + 직전 영업일 대비 %.
func (h *PublicHandler) FXSpot(w http.ResponseWriter, r *http.Request) {
	pair := chi.URLParam(r, "pair")
	if _, ok := fxPairs[pair]; !ok {
		response.RespondError(w, http.StatusBadRequest, "지원하지 않는 페어")
		return
	}

	h.fxMu.Lock()
	if cached, hit := h.fxCache[pair]; hit && time.Since(cached.FetchedAt) < fxTTL {
		snap := *cached
		h.fxMu.Unlock()
		response.RespondJSON(w, http.StatusOK, snap)
		return
	}
	h.fxMu.Unlock()

	if err := h.refreshFXAll(); err != nil {
		log.Printf("[FX 조회 실패] %v", err)
		// 캐시 stale 라도 있으면 응답.
		h.fxMu.Lock()
		if cached, hit := h.fxCache[pair]; hit {
			snap := *cached
			h.fxMu.Unlock()
			response.RespondJSON(w, http.StatusOK, snap)
			return
		}
		h.fxMu.Unlock()
		response.RespondError(w, http.StatusBadGateway, "환율 조회에 실패했습니다")
		return
	}

	h.fxMu.Lock()
	cached, ok := h.fxCache[pair]
	h.fxMu.Unlock()
	if !ok {
		response.RespondError(w, http.StatusBadGateway, "페어 시세 없음")
		return
	}
	response.RespondJSON(w, http.StatusOK, *cached)
}

// refreshFXAll — 모든 페어를 ECOS 최근 10일 범위로 한 번씩 조회.
// 캘린더 10일이면 연휴 끼어도 영업일 2개 이상 보장 → 전일대비 % 계산 가능.
// fx_daily UPSERT 도 같이 수행하여 spot 호출이 backfill 보조 역할도 겸함.
func (h *PublicHandler) refreshFXAll() error {
	now := time.Now()
	start := now.AddDate(0, 0, -10).Format("20060102")
	end := now.Format("20060102")
	fetchedAt := now.UTC()

	var firstErr error
	for pair := range fxPairs {
		points, err := h.fetchECOSRange(pair, start, end)
		if err != nil {
			log.Printf("[ECOS %s 조회 실패] %v", pair, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if len(points) == 0 {
			continue
		}
		for _, p := range points {
			_ = h.upsertFXDaily(pair, p.Date, p.Rate)
		}
		latest := points[len(points)-1]
		var changePct *float64
		if len(points) >= 2 {
			prev := points[len(points)-2].Rate
			if prev > 0 {
				pct := (latest.Rate - prev) / prev * 100
				changePct = &pct
			}
		}
		snap := fxSnapshot{
			Rate:      latest.Rate,
			ChangePct: changePct,
			Source:    ecosFXSource,
			FetchedAt: fetchedAt,
		}
		h.fxMu.Lock()
		h.fxCache[pair] = &snap
		h.fxMu.Unlock()
	}
	return firstErr
}

// upsertFXDaily — fx_daily(pair, date) UPSERT.
func (h *PublicHandler) upsertFXDaily(pair, date string, rate float64) error {
	row := map[string]any{
		"pair":       pair,
		"date":       date,
		"rate":       rate,
		"source":     ecosFXSource,
		"fetched_at": time.Now().UTC().Format(time.RFC3339),
	}
	_, _, err := h.DB.From("fx_daily").Upsert(row, "pair,date", "", "").Execute()
	return err
}

// backfillFXDaily — 부팅 시 1회 비동기 실행. 페어당 ECOS 범위 호출 1회로 N일치 채움.
func (h *PublicHandler) backfillFXDaily(days int) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[fx_daily backfill panic] %v", r)
		}
	}()

	now := time.Now()
	start := now.AddDate(0, 0, -days).Format("20060102")
	end := now.Format("20060102")

	upserted := 0
	for pair := range fxPairs {
		points, err := h.fetchECOSRange(pair, start, end)
		if err != nil {
			log.Printf("[fx_daily backfill %s] %v", pair, err)
			continue
		}
		for _, p := range points {
			if err := h.upsertFXDaily(pair, p.Date, p.Rate); err != nil {
				log.Printf("[fx_daily backfill %s/%s upsert] %v", pair, p.Date, err)
				continue
			}
			upserted++
		}
	}
	if upserted > 0 {
		log.Printf("[fx_daily backfill] %d행 (페어 %d, 캘린더 %d일)", upserted, len(fxPairs), days)
	}
}

// === FX timeseries ===

type fxPoint struct {
	Date string  `json:"date"`
	Rate float64 `json:"rate"`
}

type fxTimeseries struct {
	Series    []fxPoint `json:"series"`
	Latest    *float64  `json:"latest"`
	ChangePct *float64  `json:"change_pct"`
	Source    string    `json:"source"`
	FetchedAt time.Time `json:"fetched_at"`
}

// FXTimeseries — GET /api/v1/public/fx/{pair}/timeseries?days=30
// fx_daily에서 최근 N일 ASC 정렬 반환. days 기본 30, 최대 90.
func (h *PublicHandler) FXTimeseries(w http.ResponseWriter, r *http.Request) {
	pair := chi.URLParam(r, "pair")
	if _, ok := fxPairs[pair]; !ok {
		response.RespondError(w, http.StatusBadRequest, "지원하지 않는 페어")
		return
	}

	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconvAtoiClamp(v, 1, 90); err == nil {
			days = n
		}
	}

	data, _, err := h.DB.From("fx_daily").
		Select("date,rate", "exact", false).
		Eq("pair", pair).
		Order("date", &postgrest.OrderOpts{Ascending: false}).
		Limit(days, "").
		Execute()
	if err != nil {
		log.Printf("[fx_daily 시계열 조회 %s] %v", pair, err)
		response.RespondError(w, http.StatusBadGateway, "환율 시계열 조회 실패")
		return
	}
	var rows []struct {
		Date string  `json:"date"`
		Rate float64 `json:"rate"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "환율 시계열 파싱 실패")
		return
	}

	// DESC로 받았으니 ASC로 뒤집어 sparkline 친화적 순서로.
	series := make([]fxPoint, len(rows))
	for i, r := range rows {
		series[len(rows)-1-i] = fxPoint{Date: r.Date, Rate: r.Rate}
	}

	resp := fxTimeseries{
		Series:    series,
		Source:    ecosFXSource,
		FetchedAt: time.Now().UTC(),
	}
	if n := len(series); n > 0 {
		latest := series[n-1].Rate
		resp.Latest = &latest
		if n >= 2 {
			prev := series[n-2].Rate
			if prev > 0 {
				pct := (latest - prev) / prev * 100
				resp.ChangePct = &pct
			}
		}
	}
	response.RespondJSON(w, http.StatusOK, resp)
}

func strconvAtoiClamp(s string, min, max int) (int, error) {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("invalid")
		}
		n = n*10 + int(c-'0')
		if n > max {
			return max, nil
		}
	}
	if n < min {
		return min, nil
	}
	return n, nil
}

func (h *PublicHandler) httpGet(url string) ([]byte, error) {
	resp, err := h.HTTP.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// === Login Stats ===

type loginStats struct {
	InventoryAvailableMW *float64       `json:"inventory_available_mw"`
	ReservationsPending  *int           `json:"reservations_pending"`
	LCActiveCount        *int           `json:"lc_active_count"`
	LCActiveTotalUSD     *float64       `json:"lc_active_total_usd"`
	InboundShipsToday    int            `json:"inbound_ships_today"`
	WorkQueue            []workItem     `json:"work_queue"`
	// PendingCounts — 로그인 화면 헤드라인용 카테고리별 처리 대기 건수.
	// 키: "예약" / "출고" / "만기" / "그룹요청". 프론트가 desc 정렬하여 상위 2개 표시.
	PendingCounts        map[string]int `json:"pending_counts"`
	Health               *healthInfo    `json:"health,omitempty"`
	GeneratedAt          time.Time      `json:"generated_at"`
}

type workItem struct {
	Time  string `json:"time"`
	Tag   string `json:"tag"`
	Title string `json:"title"`
	Meta  string `json:"meta"`
}

// healthInfo — 로그인 stats를 만들 때 측정한 백엔드 내부 지연.
// 비유: "오늘 안내판을 만든 직원의 작업 일지" — DB 조회/엔진 호출에 각각
// 몇 ms 걸렸는지. 프론트는 이 값을 받아 라이브 상태바에 표시한다.
type healthInfo struct {
	DBms     float64 `json:"db_ms"`
	EngineMs float64 `json:"engine_ms"`
}

// msSince — time.Since를 ms(소수 1자리) float로 환산.
func msSince(start time.Time) float64 {
	return float64(time.Since(start).Microseconds()) / 1000.0
}

// LoginStats — GET /api/v1/public/login-stats
// 비유: "건물 로비의 오늘자 요약 안내판" — 로그인 전 화면 KPI 4종.
// 각 필드는 best-effort: 한 쿼리가 실패해도 다른 필드는 정상 반환.
func (h *PublicHandler) LoginStats(w http.ResponseWriter, r *http.Request) {
	stats := loginStats{
		WorkQueue:     []workItem{},
		PendingCounts: map[string]int{},
	}

	var dbMs, engineMs float64

	// 인벤토리: 회사 ID 조회(DB) + 엔진 호출(Rust). 분리해서 각각 측정.
	t := time.Now()
	companyIDs, idsErr := h.fetchActiveCompanyIDs()
	dbMs += msSince(t)
	if idsErr != nil {
		log.Printf("[login-stats companies] %v", idsErr)
	} else if len(companyIDs) > 0 && h.Engine != nil {
		t = time.Now()
		mw, err := h.fetchInventoryFromEngine(companyIDs)
		engineMs += msSince(t)
		if err == nil {
			stats.InventoryAvailableMW = &mw
		} else {
			log.Printf("[login-stats inventory] %v", err)
		}
	}

	t = time.Now()
	if n, err := h.fetchReservationsPending(); err == nil {
		stats.ReservationsPending = &n
		stats.PendingCounts["예약"] = n
	} else {
		log.Printf("[login-stats reservations] %v", err)
	}
	dbMs += msSince(t)

	t = time.Now()
	if cnt, total, err := h.fetchActiveLCs(); err == nil {
		stats.LCActiveCount = &cnt
		stats.LCActiveTotalUSD = &total
	} else {
		log.Printf("[login-stats lcs] %v", err)
	}
	dbMs += msSince(t)

	t = time.Now()
	if n, err := h.fetchInboundShipsToday(); err == nil {
		stats.InboundShipsToday = n
	} else {
		log.Printf("[login-stats inbound] %v", err)
	}
	dbMs += msSince(t)

	t = time.Now()
	if n, err := h.fetchOutboundsScheduled(); err == nil {
		stats.PendingCounts["출고"] = n
	} else {
		log.Printf("[login-stats outbounds] %v", err)
	}
	dbMs += msSince(t)

	t = time.Now()
	if n, err := h.fetchLCMaturingCount(); err == nil {
		stats.PendingCounts["만기"] = n
	} else {
		log.Printf("[login-stats lc_maturing] %v", err)
	}
	dbMs += msSince(t)

	t = time.Now()
	if n, err := h.fetchIntercompanyPending(); err == nil {
		stats.PendingCounts["그룹요청"] = n
	} else {
		log.Printf("[login-stats intercompany] %v", err)
	}
	dbMs += msSince(t)

	t = time.Now()
	stats.WorkQueue = h.buildWorkQueue()
	dbMs += msSince(t)

	stats.Health = &healthInfo{
		DBms:     roundMs(dbMs),
		EngineMs: roundMs(engineMs),
	}
	stats.GeneratedAt = time.Now().UTC()

	response.RespondJSON(w, http.StatusOK, stats)
}

// roundMs — 0.1ms 단위로 반올림. 라이브 라인 표시용.
func roundMs(v float64) float64 {
	return float64(int64(v*10+0.5)) / 10.0
}

// fetchInventoryFromEngine — 활성 법인 ID 목록을 받아 Rust 엔진에서 가용재고(MW) 합산.
// 비유: "법인 명부를 들고 계산실에 가서 전체 재고를 합산해 받아오는 것".
// LoginStats는 DB(법인 조회)와 엔진(합산) 시간을 따로 측정해야 해서 둘로 나뉘어 있다.
func (h *PublicHandler) fetchInventoryFromEngine(companyIDs []string) (float64, error) {
	if h.Engine == nil {
		return 0, fmt.Errorf("engine 미연결")
	}
	if len(companyIDs) == 0 {
		return 0, nil
	}

	body, err := h.Engine.CallCalc("inventory", map[string]any{"company_ids": companyIDs})
	if err != nil {
		return 0, err
	}

	var resp struct {
		Summary struct {
			TotalAvailableKW float64 `json:"total_available_kw"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return 0, fmt.Errorf("inventory 응답 파싱: %w", err)
	}
	return resp.Summary.TotalAvailableKW / 1000.0, nil
}

// fetchInboundShipsToday — 오늘(KST) eta인 BL 척수.
// 비유: "오늘자 입항 예정 선박 명부의 줄 수" — 로그인 화면 카피
// "입항 N척" 표기에 사용. 작업 큐는 7일치라 카운트 용도로 못 씀.
func (h *PublicHandler) fetchInboundShipsToday() (int, error) {
	today := time.Now().Format("2006-01-02")
	data, count, err := h.DB.From("bl_shipments").
		Select("bl_id", "exact", true).
		Eq("eta", today).
		In("status", []string{"shipping", "arrived"}).
		Execute()
	if err != nil {
		return 0, err
	}
	if count > 0 {
		return int(count), nil
	}
	var rows []map[string]any
	_ = json.Unmarshal(data, &rows)
	return len(rows), nil
}

func (h *PublicHandler) fetchActiveCompanyIDs() ([]string, error) {
	data, _, err := h.DB.From("companies").
		Select("id", "exact", false).
		Eq("status", "active").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	return ids, nil
}

// fetchReservationsPending — inventory_allocations 중 status=pending(또는 reserved) 건수.
func (h *PublicHandler) fetchReservationsPending() (int, error) {
	data, count, err := h.DB.From("inventory_allocations").
		Select("id", "exact", true).
		In("status", []string{"pending", "reserved"}).
		Execute()
	if err != nil {
		return 0, err
	}
	if count > 0 {
		return int(count), nil
	}
	// fallback: count exact 미지원 시 row 수 카운트
	var rows []map[string]any
	_ = json.Unmarshal(data, &rows)
	return len(rows), nil
}

// fetchActiveLCs — 활성 LC(status != closed/cancelled) 건수와 USD 합계.
func (h *PublicHandler) fetchActiveLCs() (int, float64, error) {
	data, _, err := h.DB.From("lc_records").
		Select("amount_usd,status", "exact", false).
		Not("status", "in", "(closed,cancelled)").
		Execute()
	if err != nil {
		return 0, 0, err
	}
	var rows []struct {
		AmountUSD float64 `json:"amount_usd"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return 0, 0, err
	}
	total := 0.0
	for _, r := range rows {
		total += r.AmountUSD
	}
	return len(rows), total, nil
}

// fetchOutboundsScheduled — 오늘 이후 예정된 활성(status=active) 출고 건수.
// 비유: "이번 주 출고 일정표에 적힌 줄 개수" — 취소/취소대기는 제외.
func (h *PublicHandler) fetchOutboundsScheduled() (int, error) {
	today := time.Now().Format("2006-01-02")
	data, count, err := h.DB.From("outbounds").
		Select("outbound_id", "exact", true).
		Eq("status", "active").
		Gte("outbound_date", today).
		Execute()
	if err != nil {
		return 0, err
	}
	if count > 0 {
		return int(count), nil
	}
	var rows []map[string]any
	_ = json.Unmarshal(data, &rows)
	return len(rows), nil
}

// fetchLCMaturingCount — 향후 7일 이내 만기 임박 L/C 건수 (closed/cancelled 제외).
func (h *PublicHandler) fetchLCMaturingCount() (int, error) {
	today := time.Now().Format("2006-01-02")
	weekAhead := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
	data, count, err := h.DB.From("lc_records").
		Select("lc_id", "exact", true).
		Gte("maturity_date", today).
		Lte("maturity_date", weekAhead).
		Not("status", "in", "(closed,cancelled)").
		Execute()
	if err != nil {
		return 0, err
	}
	if count > 0 {
		return int(count), nil
	}
	var rows []map[string]any
	_ = json.Unmarshal(data, &rows)
	return len(rows), nil
}

// fetchIntercompanyPending — 처리 대기 중(status=pending) 그룹내 매입 요청 건수.
func (h *PublicHandler) fetchIntercompanyPending() (int, error) {
	data, count, err := h.DB.From("intercompany_requests").
		Select("request_id", "exact", true).
		Eq("status", "pending").
		Execute()
	if err != nil {
		return 0, err
	}
	if count > 0 {
		return int(count), nil
	}
	var rows []map[string]any
	_ = json.Unmarshal(data, &rows)
	return len(rows), nil
}

// buildWorkQueue — 향후 7일 이내 입항(BL) + LC 만기를 시간순 정렬, 상위 4건.
func (h *PublicHandler) buildWorkQueue() []workItem {
	var items []workItem

	now := time.Now()
	weekAhead := now.AddDate(0, 0, 7).Format("2006-01-02")
	today := now.Format("2006-01-02")

	// 입항 예정 BL (eta <= +7일, status가 shipping/arrived)
	// vessel_name/total_quantity 컬럼은 스키마에 없으므로 bl_number/port/forwarder로 대체.
	if data, _, err := h.DB.From("bl_shipments").
		Select("eta,bl_number,status,port,forwarder", "exact", false).
		Lte("eta", weekAhead).
		Gte("eta", today).
		In("status", []string{"shipping", "arrived"}).
		Order("eta", nil).
		Limit(4, "").
		Execute(); err == nil {
		var rows []struct {
			ETA       string  `json:"eta"`
			BLNumber  string  `json:"bl_number"`
			Port      *string `json:"port"`
			Forwarder *string `json:"forwarder"`
		}
		if err := json.Unmarshal(data, &rows); err == nil {
			for _, r := range rows {
				meta := r.BLNumber
				if r.Port != nil && *r.Port != "" {
					meta = fmt.Sprintf("%s · %s", r.BLNumber, *r.Port)
				}
				if r.Forwarder != nil && *r.Forwarder != "" {
					meta = fmt.Sprintf("%s · %s", meta, *r.Forwarder)
				}
				items = append(items, workItem{
					Time:  fmtETA(r.ETA),
					Tag:   "입항",
					Title: r.BLNumber,
					Meta:  meta,
				})
			}
		}
	}

	// LC 만기 임박 (maturity_date <= +7일, status active)
	if data, _, err := h.DB.From("lc_records").
		Select("maturity_date,lc_number,amount_usd,status", "exact", false).
		Lte("maturity_date", weekAhead).
		Gte("maturity_date", today).
		Not("status", "in", "(closed,cancelled)").
		Order("maturity_date", nil).
		Limit(4, "").
		Execute(); err == nil {
		var rows []struct {
			MaturityDate string  `json:"maturity_date"`
			LCNumber     *string `json:"lc_number"`
			AmountUSD    float64 `json:"amount_usd"`
		}
		if err := json.Unmarshal(data, &rows); err == nil {
			for _, r := range rows {
				num := "-"
				if r.LCNumber != nil {
					num = *r.LCNumber
				}
				items = append(items, workItem{
					Time:  fmtETA(r.MaturityDate),
					Tag:   "L/C 만기",
					Title: num,
					Meta:  fmt.Sprintf("USD %.2fM", r.AmountUSD/1_000_000),
				})
			}
		}
	}

	sort.SliceStable(items, func(i, j int) bool { return items[i].Time < items[j].Time })
	if len(items) > 4 {
		items = items[:4]
	}
	if items == nil {
		items = []workItem{}
	}
	return items
}

// fmtETA — "2026-05-02" → "05/02" (간단한 일자만 표시)
func fmtETA(date string) string {
	t, err := time.Parse("2006-01-02", date)
	if err != nil {
		return date
	}
	return t.Format("01/02")
}

// === Metals (silver, gold, ...) ===

type metalSnapshot struct {
	PriceUSD  float64   `json:"price_usd"`
	ChangeUSD *float64  `json:"change_usd"`
	Symbol    string    `json:"symbol"`
	Source    string    `json:"source"`
	FetchedAt time.Time `json:"fetched_at"`
}

// 30분 캐시 — metalpriceapi 무료/저가 플랜은 월간 호출 한도가 빡빡함.
// 로그인 페이지 ticker 용도로는 30분이면 충분.
const metalTTL = 30 * time.Minute

// 지원 심볼: 클라이언트가 임의 문자열을 보낼 수 없게 화이트리스트.
// (X)코드는 metalpriceapi 표준 — XAG=은, XAU=금, XPT=백금, XPD=팔라듐.
var metalSymbols = map[string]string{
	"silver":    "XAG",
	"gold":      "XAU",
	"platinum":  "XPT",
	"palladium": "XPD",
	"copper":    "XCU",
}

// MetalPrice — GET /api/v1/public/metals/{symbol}
// 비유: "오늘의 금속 시세판" — 로그인 화면 하단 ticker용. 단가는 USD/oz.
// API key 없으면 503 → 프론트가 mockup으로 fallback.
func (h *PublicHandler) MetalPrice(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "symbol")
	code, ok := metalSymbols[name]
	if !ok {
		response.RespondError(w, http.StatusBadRequest, "지원하지 않는 금속 심볼")
		return
	}

	h.metalMu.Lock()
	if cached, hit := h.metalCache[code]; hit && time.Since(cached.FetchedAt) < metalTTL {
		snap := *cached
		h.metalMu.Unlock()
		response.RespondJSON(w, http.StatusOK, snap)
		return
	}
	h.metalMu.Unlock()

	if h.metalKey == "" {
		response.RespondError(w, http.StatusServiceUnavailable, "METAL_PRICE_API_KEY 미설정")
		return
	}

	snap, err := h.fetchMetal(code)
	if err != nil {
		log.Printf("[금속 시세 조회 실패 %s] %v", code, err)
		h.metalMu.Lock()
		if cached, hit := h.metalCache[code]; hit {
			stale := *cached
			h.metalMu.Unlock()
			response.RespondJSON(w, http.StatusOK, stale)
			return
		}
		h.metalMu.Unlock()
		response.RespondError(w, http.StatusBadGateway, "금속 시세 조회에 실패했습니다")
		return
	}

	h.metalMu.Lock()
	h.metalCache[code] = &snap
	h.metalMu.Unlock()
	response.RespondJSON(w, http.StatusOK, snap)
}

// metalpriceapi 응답: USD base에서 1 USD = N oz 형태로 quote.
// USD/oz는 1/N로 변환.
type metalpriceResponse struct {
	Success   bool               `json:"success"`
	Base      string             `json:"base"`
	Timestamp int64              `json:"timestamp"`
	Rates     map[string]float64 `json:"rates"`
	Error     *struct {
		Code int    `json:"code"`
		Info string `json:"info"`
	} `json:"error"`
}

func (h *PublicHandler) fetchMetal(code string) (metalSnapshot, error) {
	today, err := h.fetchMetalLatest(code)
	if err != nil {
		return metalSnapshot{}, fmt.Errorf("today: %w", err)
	}

	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	var changeUSD *float64
	if prev, err := h.fetchMetalHistorical(code, yesterday); err == nil && prev > 0 {
		diff := today - prev
		changeUSD = &diff
	}

	return metalSnapshot{
		PriceUSD:  today,
		ChangeUSD: changeUSD,
		Symbol:    code,
		Source:    h.metalSource,
		FetchedAt: time.Now().UTC(),
	}, nil
}

func (h *PublicHandler) fetchMetalLatest(code string) (float64, error) {
	url := fmt.Sprintf("https://api.metalpriceapi.com/v1/latest?api_key=%s&base=USD&currencies=%s", h.metalKey, code)
	return h.fetchMetalURL(url, code)
}

func (h *PublicHandler) fetchMetalHistorical(code, date string) (float64, error) {
	url := fmt.Sprintf("https://api.metalpriceapi.com/v1/%s?api_key=%s&base=USD&currencies=%s", date, h.metalKey, code)
	return h.fetchMetalURL(url, code)
}

func (h *PublicHandler) fetchMetalURL(url, code string) (float64, error) {
	body, err := h.httpGet(url)
	if err != nil {
		return 0, err
	}
	var parsed metalpriceResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return 0, fmt.Errorf("파싱 실패: %w", err)
	}
	if !parsed.Success {
		msg := "unknown"
		if parsed.Error != nil {
			msg = parsed.Error.Info
		}
		return 0, fmt.Errorf("metalpriceapi error: %s", msg)
	}
	// metalpriceapi는 두 가지 키를 같이 보냄:
	//   USDXAG: 71.99      → 이미 USD/oz (즉 oz당 달러)
	//   XAG:    0.01389    → 1 USD = N oz (역수)
	// USDXAG가 있으면 그대로, 없으면 역수.
	if rate, ok := parsed.Rates["USD"+code]; ok && rate > 0 {
		return rate, nil
	}
	if rate, ok := parsed.Rates[code]; ok && rate > 0 {
		return 1.0 / rate, nil
	}
	return 0, fmt.Errorf("%s quote 없음", code)
}

// === Commodities (polysilicon, SCFI) ===
//
// 폴리실리콘과 SCFI는 무료 실시간 API가 없으므로 운영자가 주간으로 갱신하는
// JSON 파일을 읽어 그대로 반환한다. 경로는 COMMODITIES_FILE 환경변수 또는
// $HOME/.config/solarflow/commodities.json. 파일 없거나 항목 누락이면 503 →
// 프론트가 mockup 값으로 fallback.
//
// 파일 스키마 예:
//   {
//     "polysilicon": {"value": 34.20, "change": 0.40, "unit": "USD/kg",
//                     "source": "PVInsights weekly", "fetched_at": "2026-04-29"},
//     "scfi":        {"value": 1284,  "change": -2.10, "unit": "index",
//                     "source": "Shanghai Shipping Exchange", "fetched_at": "2026-04-26"}
//   }

type commoditySnapshot struct {
	Value     float64 `json:"value"`
	Change    float64 `json:"change"`
	Unit      string  `json:"unit"`
	Source    string  `json:"source"`
	FetchedAt string  `json:"fetched_at"`
}

type commoditiesFile struct {
	Polysilicon *commoditySnapshot `json:"polysilicon"`
	SCFI        *commoditySnapshot `json:"scfi"`
}

func (h *PublicHandler) loadCommodities() (*commoditiesFile, error) {
	body, err := os.ReadFile(h.commoditiesPath)
	if err != nil {
		return nil, err
	}
	var parsed commoditiesFile
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("파싱 실패: %w", err)
	}
	return &parsed, nil
}

func (h *PublicHandler) respondCommodity(w http.ResponseWriter, name string, snap *commoditySnapshot, err error) {
	if err != nil {
		log.Printf("[commodities %s] %v", name, err)
		response.RespondError(w, http.StatusServiceUnavailable, fmt.Sprintf("%s 시세 미설정", name))
		return
	}
	if snap == nil {
		response.RespondError(w, http.StatusServiceUnavailable, fmt.Sprintf("%s 시세 미설정", name))
		return
	}
	response.RespondJSON(w, http.StatusOK, snap)
}

// Polysilicon — GET /api/v1/public/polysilicon
// 비유: "이번 주 폴리실리콘 시세판" — 운영자가 commodities.json에 적은 값을 그대로 노출.
func (h *PublicHandler) Polysilicon(w http.ResponseWriter, r *http.Request) {
	c, err := h.loadCommodities()
	if err != nil {
		h.respondCommodity(w, "폴리실리콘", nil, err)
		return
	}
	h.respondCommodity(w, "폴리실리콘", c.Polysilicon, nil)
}

// SCFI — GET /api/v1/public/scfi
// 비유: "이번 주 상해 컨테이너 운임지수" — 매주 금요일 갱신, 운영자가 손으로 입력.
func (h *PublicHandler) SCFI(w http.ResponseWriter, r *http.Request) {
	c, err := h.loadCommodities()
	if err != nil {
		h.respondCommodity(w, "SCFI", nil, err)
		return
	}
	h.respondCommodity(w, "SCFI", c.SCFI, nil)
}
