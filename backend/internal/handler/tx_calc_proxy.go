package handler

import (
	"io"
	"net/http"

	"solarflow-backend/internal/engine"
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

// SupplyForecast — 수급 전망 프록시
func (h *CalcProxyHandler) SupplyForecast(w http.ResponseWriter, r *http.Request) {
	h.proxyPost(w, r, "supply-forecast")
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
