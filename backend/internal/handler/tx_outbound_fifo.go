package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	postgrest "github.com/supabase-community/postgrest-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// FifoMatches — GET /api/v1/outbounds/{id}/fifo-matches
// 비유: "출고 한 건의 원가 영수증" — 어느 입고 LOT 으로부터 얼마나 배분돼서
// 원가/매출/이익이 어떻게 계산됐는지 라인별로 보여준다 (D-064 PR 26 결과 활용).
func (h *OutboundHandler) FifoMatches(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("fifo_matches").
		Select("*", "exact", false).
		Eq("outbound_id", id).
		Order("inbound_date", &postgrest.OrderOpts{Ascending: true}).
		Order("erp_inbound_no", &postgrest.OrderOpts{Ascending: true}).
		Order("erp_inbound_line_no", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	if err != nil {
		log.Printf("[FIFO 매칭 조회 실패] outbound_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "FIFO 매칭 조회에 실패했습니다")
		return
	}

	var matches []model.FifoMatch
	if err := json.Unmarshal(data, &matches); err != nil {
		log.Printf("[FIFO 매칭 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	// 합계 — 출고 상세 카드 하단 요약
	summary := model.FifoMatchSummary{MatchCount: len(matches)}
	for _, m := range matches {
		if m.AllocatedQty != nil {
			summary.TotalAllocatedQty += *m.AllocatedQty
		}
		if m.CostAmount != nil {
			summary.TotalCostAmount += *m.CostAmount
		}
		if m.SalesAmount != nil {
			summary.TotalSalesAmount += *m.SalesAmount
		}
		if m.ProfitAmount != nil {
			summary.TotalProfitAmount += *m.ProfitAmount
		}
	}
	// 가중평균 이익률 — sales 합계 기준 (단순 % 산출이 0 매출 행을 회피)
	if summary.TotalSalesAmount > 0 {
		summary.AvgProfitRatio = (summary.TotalProfitAmount / summary.TotalSalesAmount) * 100
	}

	response.RespondJSON(w, http.StatusOK, model.OutboundFifoMatchesResponse{
		Matches: matches,
		Summary: summary,
	})
}
