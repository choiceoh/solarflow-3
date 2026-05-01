package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"

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

	fxMu     sync.Mutex
	fxCache  *fxSnapshot
	fxKey    string
	fxSource string
}

// NewPublicHandler — PublicHandler 생성자.
// engineClient는 nil 가능 — 그 경우 인벤토리 합계는 null로 응답.
func NewPublicHandler(db *supa.Client, engineClient *engine.EngineClient) *PublicHandler {
	return &PublicHandler{
		DB:       db,
		Engine:   engineClient,
		HTTP:     &http.Client{Timeout: 6 * time.Second},
		fxKey:    os.Getenv("EXCHANGERATE_HOST_KEY"),
		fxSource: "exchangerate.host",
	}
}

// === FX (USD/KRW) ===

type fxSnapshot struct {
	Rate      float64   `json:"rate"`
	ChangePct *float64  `json:"change_pct"`
	Source    string    `json:"source"`
	FetchedAt time.Time `json:"fetched_at"`
}

// 5분 캐시 — 로그인 페이지가 매 새로고침마다 외부 호출 못 하게 차단.
const fxTTL = 5 * time.Minute

// FXUsdKrw — GET /api/v1/public/fx/usdkrw
// 환율 단일 페어 (USD→KRW) + 전일 대비 변동률.
// API key가 비어있으면 503 반환 (프론트는 mockup 값으로 fallback).
func (h *PublicHandler) FXUsdKrw(w http.ResponseWriter, r *http.Request) {
	h.fxMu.Lock()
	if h.fxCache != nil && time.Since(h.fxCache.FetchedAt) < fxTTL {
		snap := *h.fxCache
		h.fxMu.Unlock()
		response.RespondJSON(w, http.StatusOK, snap)
		return
	}
	h.fxMu.Unlock()

	if h.fxKey == "" {
		response.RespondError(w, http.StatusServiceUnavailable, "EXCHANGERATE_HOST_KEY 미설정")
		return
	}

	snap, err := h.fetchFX()
	if err != nil {
		log.Printf("[FX 조회 실패] %v", err)
		// 캐시가 있으면 stale 이라도 응답 (외부 API 일시 장애 대비)
		h.fxMu.Lock()
		if h.fxCache != nil {
			cached := *h.fxCache
			h.fxMu.Unlock()
			response.RespondJSON(w, http.StatusOK, cached)
			return
		}
		h.fxMu.Unlock()
		response.RespondError(w, http.StatusBadGateway, "환율 조회에 실패했습니다")
		return
	}

	h.fxMu.Lock()
	h.fxCache = &snap
	h.fxMu.Unlock()
	response.RespondJSON(w, http.StatusOK, snap)
}

// exchangerate.host live + 전일 종가로 변동률 계산.
// 무료 플랜은 EUR base만 허용 — USD→KRW는 (KRW/EUR) ÷ (USD/EUR) 로 산출.
func (h *PublicHandler) fetchFX() (fxSnapshot, error) {
	today, err := h.fetchExchangerateLive()
	if err != nil {
		return fxSnapshot{}, fmt.Errorf("today: %w", err)
	}

	// 전일 종가 — 변동률 계산용. 실패해도 rate는 반환.
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	var changePct *float64
	if prev, err := h.fetchExchangerateHistorical(yesterday); err == nil && prev > 0 {
		pct := (today - prev) / prev * 100
		changePct = &pct
	}

	return fxSnapshot{
		Rate:      today,
		ChangePct: changePct,
		Source:    h.fxSource,
		FetchedAt: time.Now().UTC(),
	}, nil
}

type exchangerateLiveResponse struct {
	Success bool               `json:"success"`
	Source  string             `json:"source"`
	Quotes  map[string]float64 `json:"quotes"`
	Error   *struct {
		Info string `json:"info"`
	} `json:"error"`
}

func (h *PublicHandler) fetchExchangerateLive() (float64, error) {
	url := fmt.Sprintf("https://api.exchangerate.host/live?access_key=%s&source=USD&currencies=KRW", h.fxKey)
	body, err := h.httpGet(url)
	if err != nil {
		return 0, err
	}
	var parsed exchangerateLiveResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return 0, fmt.Errorf("파싱 실패: %w", err)
	}
	if !parsed.Success {
		msg := "unknown"
		if parsed.Error != nil {
			msg = parsed.Error.Info
		}
		return 0, fmt.Errorf("exchangerate.host error: %s", msg)
	}
	rate, ok := parsed.Quotes["USDKRW"]
	if !ok || rate <= 0 {
		return 0, fmt.Errorf("USDKRW 시세 없음")
	}
	return rate, nil
}

type exchangerateHistoricalResponse struct {
	Success    bool               `json:"success"`
	Historical bool               `json:"historical"`
	Quotes     map[string]float64 `json:"quotes"`
}

func (h *PublicHandler) fetchExchangerateHistorical(date string) (float64, error) {
	url := fmt.Sprintf("https://api.exchangerate.host/historical?access_key=%s&date=%s&source=USD&currencies=KRW", h.fxKey, date)
	body, err := h.httpGet(url)
	if err != nil {
		return 0, err
	}
	var parsed exchangerateHistoricalResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return 0, err
	}
	if !parsed.Success {
		return 0, fmt.Errorf("historical fetch failed")
	}
	return parsed.Quotes["USDKRW"], nil
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
	InventoryAvailableMW *float64    `json:"inventory_available_mw"`
	ReservationsPending  *int        `json:"reservations_pending"`
	LCActiveCount        *int        `json:"lc_active_count"`
	LCActiveTotalUSD     *float64    `json:"lc_active_total_usd"`
	WorkQueue            []workItem  `json:"work_queue"`
	GeneratedAt          time.Time   `json:"generated_at"`
}

type workItem struct {
	Time  string `json:"time"`
	Tag   string `json:"tag"`
	Title string `json:"title"`
	Meta  string `json:"meta"`
}

// LoginStats — GET /api/v1/public/login-stats
// 비유: "건물 로비의 오늘자 요약 안내판" — 로그인 전 화면 KPI 4종.
// 각 필드는 best-effort: 한 쿼리가 실패해도 다른 필드는 정상 반환.
func (h *PublicHandler) LoginStats(w http.ResponseWriter, r *http.Request) {
	stats := loginStats{
		WorkQueue:   []workItem{},
		GeneratedAt: time.Now().UTC(),
	}

	if mw, err := h.fetchInventoryAvailableMW(); err == nil {
		stats.InventoryAvailableMW = &mw
	} else {
		log.Printf("[login-stats inventory] %v", err)
	}

	if n, err := h.fetchReservationsPending(); err == nil {
		stats.ReservationsPending = &n
	} else {
		log.Printf("[login-stats reservations] %v", err)
	}

	if cnt, total, err := h.fetchActiveLCs(); err == nil {
		stats.LCActiveCount = &cnt
		stats.LCActiveTotalUSD = &total
	} else {
		log.Printf("[login-stats lcs] %v", err)
	}

	stats.WorkQueue = h.buildWorkQueue()

	response.RespondJSON(w, http.StatusOK, stats)
}

// fetchInventoryAvailableMW — Rust 엔진을 호출하여 전 법인 가용재고(MW) 합산.
// 엔진 클라이언트가 없거나 실패하면 에러 — 호출자가 nil로 처리.
func (h *PublicHandler) fetchInventoryAvailableMW() (float64, error) {
	if h.Engine == nil {
		return 0, fmt.Errorf("engine 미연결")
	}

	// 활성 법인 ID 목록 (status=active만 — 휴면 법인 제외)
	companyIDs, err := h.fetchActiveCompanyIDs()
	if err != nil {
		return 0, err
	}
	if len(companyIDs) == 0 {
		return 0, nil
	}

	// 엔진은 company_ids 배열 지원 — CallCalc raw 사용
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

// buildWorkQueue — 향후 7일 이내 입항(BL) + LC 만기를 시간순 정렬, 상위 4건.
func (h *PublicHandler) buildWorkQueue() []workItem {
	var items []workItem

	now := time.Now()
	weekAhead := now.AddDate(0, 0, 7).Format("2006-01-02")
	today := now.Format("2006-01-02")

	// 입항 예정 BL (eta_date <= +7일, status가 in_transit/arrived)
	if data, _, err := h.DB.From("bls").
		Select("eta_date,bl_number,status,vessel_name,total_quantity", "exact", false).
		Lte("eta_date", weekAhead).
		Gte("eta_date", today).
		In("status", []string{"in_transit", "arrived", "shipping"}).
		Order("eta_date", nil).
		Limit(4, "").
		Execute(); err == nil {
		var rows []struct {
			ETADate       string  `json:"eta_date"`
			BLNumber      string  `json:"bl_number"`
			VesselName    *string `json:"vessel_name"`
			TotalQuantity *int    `json:"total_quantity"`
		}
		if err := json.Unmarshal(data, &rows); err == nil {
			for _, r := range rows {
				vessel := ""
				if r.VesselName != nil {
					vessel = *r.VesselName
				}
				meta := ""
				if r.TotalQuantity != nil {
					meta = fmt.Sprintf("%d장 · %s", *r.TotalQuantity, r.BLNumber)
				} else {
					meta = r.BLNumber
				}
				items = append(items, workItem{
					Time:  fmtETA(r.ETADate),
					Tag:   "입항",
					Title: vessel,
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
