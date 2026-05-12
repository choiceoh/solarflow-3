package handler

import (
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// CalcProxyHandler — Rust 계산엔진 프록시 핸들러
// 비유: "우편물 중계소" — 프론트에서 온 요청을 그대로 Rust에 전달하고 응답도 그대로 돌려줌
// 기존 타입 안전 메서드와 별도로, 바이트 단위 중계만 담당
type CalcProxyHandler struct {
	Engine *engine.EngineClient
}

// NewCalcProxyHandler — CalcProxyHandler 생성자
func NewCalcProxyHandler(ec *engine.EngineClient) *CalcProxyHandler {
	return &CalcProxyHandler{Engine: ec}
}

// init — D-20260512-090000 feature self-mounting.
// CalcProxy 는 /api/v1/calc, /api/v1/engine 를 main /api/v1 그룹과 *별도* 트리로 마운트한다
// (StudyTenantFence 미적용 + 자체 authMW). 그래서 AuthRoot Spec 으로 등록하고 Mount 클로저가
// 직접 r.Route + r.Use(d.AuthMW) 를 수행한다. d.HasEngine() 가 false 면 라우트 자체를
// mount 하지 않아 NoEngine snapshot 테스트와 호환.
//
// catalog.Paths 가 calc.*/engine.* feature 별로 등재돼 coverage_test 가 검증한다.
func init() {
	mount.Register(mount.Spec{
		Auth: mount.AuthRoot,
		Mount: func(d *mount.Deps, root chi.Router) {
			if !d.HasEngine() {
				return
			}
			h := NewCalcProxyHandler(d.Engine)
			g := d.Gates
			authMW := d.AuthMW
			root.Route("/api/v1/calc", func(r chi.Router) {
				r.Use(authMW)
				r.With(g.Feature(feature.IDCalcInventory)).Post("/inventory", h.Inventory)
				r.With(g.Feature(feature.IDCalcLandedCost)).Post("/landed-cost", h.LandedCost)
				r.With(g.Feature(feature.IDCalcExchangeCompare)).Post("/exchange-compare", h.ExchangeCompare)
				r.With(g.Feature(feature.IDCalcLCFee)).Post("/lc-fee", h.LcFee)
				r.With(g.Feature(feature.IDCalcLCLimitTimeline)).Post("/lc-limit-timeline", h.LcLimitTimeline)
				r.With(g.Feature(feature.IDCalcLCMaturityAlert)).Post("/lc-maturity-alert", h.LcMaturityAlert)
				r.With(g.Feature(feature.IDCalcMarginAnalysis)).Post("/margin-analysis", h.MarginAnalysis)
				r.With(g.Feature(feature.IDCalcCustomerAnalysis)).Post("/customer-analysis", h.CustomerAnalysis)
				r.With(g.Feature(feature.IDCalcPriceTrend)).Post("/price-trend", h.PriceTrend)
				r.With(g.Feature(feature.IDCalcPriceForecastStrategy)).Post("/price-forecast-strategy", h.PriceForecastStrategy)
				r.With(g.Feature(feature.IDCalcSupplyForecast)).Post("/supply-forecast", h.SupplyForecast)
				r.With(g.Feature(feature.IDCalcOrderFulfillmentRisk)).Post("/order-fulfillment-risk", h.OrderFulfillmentRisk)
				r.With(g.Feature(feature.IDCalcOutstandingList)).Post("/outstanding-list", h.OutstandingList)
				r.With(g.Feature(feature.IDCalcReceiptMatchSugges)).Post("/receipt-match-suggest", h.ReceiptMatchSuggest)
				r.With(g.Feature(feature.IDCalcSearch)).Post("/search", h.Search)
				r.With(g.Feature(feature.IDCalcInventoryTurnover)).Post("/inventory-turnover", h.InventoryTurnover)
			})
			root.Route("/api/v1/engine", func(r chi.Router) {
				r.Use(authMW)
				r.With(g.Feature(feature.IDEngineHealth)).Get("/health", h.EngineHealth)
				r.With(g.Feature(feature.IDEngineHealth)).Get("/ready", h.EngineReady)
			})
		},
	})
}

// EngineUnavailableResponse — Rust 엔진 다운 시 503 응답 구조체
// 비유: "계산실 전화 안 받음" 안내 메시지
type EngineUnavailableResponse struct {
	Error        string `json:"error"`
	EngineStatus string `json:"engine_status"`
}

// engineUnavailableResponse — Rust 엔진 다운 시 503 응답 전송
func engineUnavailableResponse(w http.ResponseWriter) {
	response.RespondJSON(w, http.StatusServiceUnavailable, EngineUnavailableResponse{
		Error:        "계산 엔진이 일시적으로 사용할 수 없습니다",
		EngineStatus: "unavailable",
	})
}

// proxyPost — POST 프록시 공통 패턴
// 비유: "우편물 접수 → 계산실 전달 → 답변 회신" 표준 절차
func (h *CalcProxyHandler) proxyPost(w http.ResponseWriter, r *http.Request, path string) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		response.RespondError(w, http.StatusBadRequest, "요청 본문을 읽을 수 없습니다")
		return
	}
	defer r.Body.Close()

	result, statusCode, err := h.Engine.CallCalcRaw(path, body)
	if err != nil {
		engineUnavailableResponse(w)
		return
	}

	// 비유: Rust 응답을 그대로 전달 (바이트 중계)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write(result)
}

// proxyGet — GET 프록시 공통 패턴
// 비유: "계산실 상태 확인하고 결과 전달" 절차
func (h *CalcProxyHandler) proxyGet(w http.ResponseWriter, r *http.Request, path string) {
	result, statusCode, err := h.Engine.CallCalcRawGet(path)
	if err != nil {
		engineUnavailableResponse(w)
		return
	}

	// 비유: Rust 응답을 그대로 전달 (바이트 중계)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write(result)
}

// === POST 핸들러 13개 ===

// Inventory — 재고 집계 프록시
func (h *CalcProxyHandler) Inventory(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "inventory")
}

// LandedCost — Landed Cost 계산 프록시
func (h *CalcProxyHandler) LandedCost(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "landed-cost")
}

// ExchangeCompare — 환율 비교 프록시
func (h *CalcProxyHandler) ExchangeCompare(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "exchange-compare")
}

// LcFee — LC 수수료 프록시
func (h *CalcProxyHandler) LcFee(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "lc-fee")
}

// LcLimitTimeline — 한도 복원 타임라인 프록시
func (h *CalcProxyHandler) LcLimitTimeline(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "lc-limit-timeline")
}

// LcMaturityAlert — 만기 알림 프록시
func (h *CalcProxyHandler) LcMaturityAlert(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "lc-maturity-alert")
}

// MarginAnalysis — 마진 분석 프록시
func (h *CalcProxyHandler) MarginAnalysis(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "margin-analysis")
}

// CustomerAnalysis — 거래처 분석 프록시
func (h *CalcProxyHandler) CustomerAnalysis(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "customer-analysis")
}

// PriceTrend — 단가 추이 프록시
func (h *CalcProxyHandler) PriceTrend(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "price-trend")
}

// PriceForecastStrategy — 가격예측 구매전략 프록시
func (h *CalcProxyHandler) PriceForecastStrategy(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "price-forecast-strategy")
}

// SupplyForecast — 수급 전망 프록시
func (h *CalcProxyHandler) SupplyForecast(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "supply-forecast")
}

// OrderFulfillmentRisk — 수주 충당 위험도 프록시
func (h *CalcProxyHandler) OrderFulfillmentRisk(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "order-fulfillment-risk")
}

// OutstandingList — 미수금 목록 프록시
func (h *CalcProxyHandler) OutstandingList(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "outstanding-list")
}

// ReceiptMatchSuggest — 수금 매칭 추천 프록시
func (h *CalcProxyHandler) ReceiptMatchSuggest(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "receipt-match-suggest")
}

// Search — 자연어 검색 프록시
func (h *CalcProxyHandler) Search(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "search")
}

// InventoryTurnover — 재고 회전율 프록시
func (h *CalcProxyHandler) InventoryTurnover(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "inventory-turnover")
}

// === GET 핸들러 2개 ===

// EngineHealth — Rust 엔진 헬스체크 프록시
func (h *CalcProxyHandler) EngineHealth(w http.ResponseWriter, r *http.Request) {
	h.proxyGet(w, r, "/health")
}

// EngineReady — Rust 엔진 레디체크 프록시 (DB 연결 포함)
func (h *CalcProxyHandler) EngineReady(w http.ResponseWriter, r *http.Request) {
	h.proxyGet(w, r, "/health/ready")
}
