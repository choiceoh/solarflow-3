package handler

import (
	"log"
	"net/http"

	"solarflow-backend/internal/response"
)

// PurchaseDashboard — GET /api/v1/purchase/dashboard.
// purchase_dashboard() RPC (migration 083) 만 사용. 4개 PurchaseHistoryPage insight
// (Chains/Variants/PriceChanges/RecentEvents) 의 client-side 집계 (5개 테이블
// fetchAllPaginated → buildChains 메모리 집계) 를 SQL 한 round-trip 으로 대체.
func (h *PriceHistoryHandler) PurchaseDashboard(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}

	data, _, err := h.DB.From("rpc/purchase_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[Purchase 대시보드 RPC 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "Purchase 대시보드 조회에 실패했습니다")
		return
	}
	body := unwrapRPCJSON(data, "purchase_dashboard")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
