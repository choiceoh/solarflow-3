package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"solarflow-backend/internal/response"
)

// BankingDashboard — GET /api/v1/banking/dashboard.
// banking_dashboard() RPC (migration 081) 만 사용. 4개 BankingPage insight
// (TotalLimit/Used/Available/MaturityAlert) 의 client-side 집계 (전체 banks/lcs/limit_changes
// fetchAllPaginated → 메모리 집계) 를 SQL 한 round-trip 으로 대체.
func (h *BankHandler) BankingDashboard(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}

	data, _, err := h.DB.From("rpc/banking_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[Banking 대시보드 RPC 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "Banking 대시보드 조회에 실패했습니다")
		return
	}
	body := unwrapRPCJSON(data, "banking_dashboard")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

// unwrapRPCJSON — PostgREST 가 jsonb-반환 함수를 array 로 wrap 하는 경우 (예: [{"banking_dashboard": {...}}])
// 와 scalar 로 직접 반환하는 경우 둘 다 처리. 어느 형태든 inner object 만 반환.
func unwrapRPCJSON(data []byte, fnName string) []byte {
	if len(data) == 0 {
		return data
	}
	if data[0] == '[' {
		var arr []json.RawMessage
		if err := json.Unmarshal(data, &arr); err == nil && len(arr) > 0 {
			var wrap map[string]json.RawMessage
			if json.Unmarshal(arr[0], &wrap) == nil {
				if inner, ok := wrap[fnName]; ok {
					return inner
				}
			}
			return arr[0]
		}
	}
	return data
}
