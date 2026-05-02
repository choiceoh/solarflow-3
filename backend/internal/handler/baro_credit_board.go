package handler

import (
	"log"
	"net/http"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/dbrpc"
	"solarflow-backend/internal/response"
)

// CreditBoardHandler — BARO Phase 3: 거래처별 미수금/한도 보드 핸들러
// 비유: "외상 장부 요약" — 거래처마다 매출 누적, 입금 누적, 잔여 한도, 가장 오래된 미수일자를 한 줄로
type CreditBoardHandler struct {
	DB *supa.Client
}

func NewCreditBoardHandler(db *supa.Client) *CreditBoardHandler {
	return &CreditBoardHandler{DB: db}
}

// List — GET /api/v1/baro/credit-board
// 활성 customer/both 거래처의 미수금/한도/연체일수 집계.
func (h *CreditBoardHandler) List(w http.ResponseWriter, r *http.Request) {
	body, err := dbrpc.Call(r.Context(), "baro_credit_board", map[string]interface{}{})
	if err != nil {
		log.Printf("[BARO 미수금/한도 보드 RPC 실패] %v", err)
		response.RespondError(w, dbrpc.StatusCode(err, http.StatusInternalServerError),
			"미수금/한도 보드 조회에 실패했습니다")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}
