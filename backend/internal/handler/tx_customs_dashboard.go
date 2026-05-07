package handler

import (
	"log"
	"net/http"

	"solarflow-backend/internal/response"
)

// CustomsDashboard — GET /api/v1/customs/dashboard.
// customs_dashboard() RPC (migration 082) 만 사용. 4개 CustomsPage insight
// (TypeCount/AvgExpense/BlLinked/ExpenseTotal) 의 client-side 집계를 SQL 한 round-trip 으로 대체.
func (h *ExpenseHandler) CustomsDashboard(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}

	data, _, err := h.DB.From("rpc/customs_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[Customs 대시보드 RPC 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "Customs 대시보드 조회에 실패했습니다")
		return
	}
	body := unwrapRPCJSON(data, "customs_dashboard")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
