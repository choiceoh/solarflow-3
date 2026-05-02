package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// ExpenseHandler — 부대비용(incidental_expenses) 관련 API를 처리하는 핸들러
// 비유: "부대비용 전표함" — 접안료, 셔틀, 통관, 운송 등 각종 부대비용을 관리
type ExpenseHandler struct {
	DB *supa.Client
}

// NewExpenseHandler — ExpenseHandler 생성자
func NewExpenseHandler(db *supa.Client) *ExpenseHandler {
	return &ExpenseHandler{DB: db}
}

// List — GET /api/v1/expenses — 부대비용 목록 조회
// 비유: 전표함에서 전체 부대비용을 꺼내 보여주는 것
func (h *ExpenseHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("incidental_expenses").
		Select("*", "exact", false)

	// 비유: ?bl_id=xxx — 특정 B/L의 부대비용만 필터
	if blID := r.URL.Query().Get("bl_id"); blID != "" {
		query = query.Eq("bl_id", blID)
	}

	// 비유: ?outbound_id=xxx — 특정 출고의 운송비만 필터
	if outboundID := r.URL.Query().Get("outbound_id"); outboundID != "" {
		query = query.Eq("outbound_id", outboundID)
	}

	// 비유: ?month=2025-03 — 특정 월의 부대비용만 필터
	if month := r.URL.Query().Get("month"); month != "" {
		query = query.Eq("month", month)
	}

	// 비유: ?company_id=xxx — 특정 법인의 부대비용만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}

	// 비유: ?expense_type=transport — 특정 비용 유형만 필터
	if expType := r.URL.Query().Get("expense_type"); expType != "" {
		query = query.Eq("expense_type", expType)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[부대비용 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "부대비용 목록 조회에 실패했습니다")
		return
	}

	var expenses []model.IncidentalExpense
	if err := json.Unmarshal(data, &expenses); err != nil {
		log.Printf("[부대비용 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, expenses)
}

// GetByID — GET /api/v1/expenses/{id} — 부대비용 상세 조회
// 비유: 특정 부대비용 전표를 꺼내 자세히 보는 것
func (h *ExpenseHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("incidental_expenses").
		Select("*", "exact", false).
		Eq("expense_id", id).
		Execute()
	if err != nil {
		log.Printf("[부대비용 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "부대비용 조회에 실패했습니다")
		return
	}

	var expenses []model.IncidentalExpense
	if err := json.Unmarshal(data, &expenses); err != nil {
		log.Printf("[부대비용 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(expenses) == 0 {
		response.RespondError(w, http.StatusNotFound, "부대비용을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, expenses[0])
}

// Create — POST /api/v1/expenses — 부대비용 등록
// 비유: 새 부대비용 전표를 작성하여 전표함에 보관하는 것
func (h *ExpenseHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateExpenseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[부대비용 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("incidental_expenses").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[부대비용 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "부대비용 등록에 실패했습니다")
		return
	}

	var created []model.IncidentalExpense
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[부대비용 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "부대비용 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/expenses/{id} — 부대비용 수정
// 비유: 기존 부대비용 전표의 내용을 수정하는 것
func (h *ExpenseHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateExpenseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[부대비용 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("incidental_expenses").
		Update(req, "", "").
		Eq("expense_id", id).
		Execute()
	if err != nil {
		log.Printf("[부대비용 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "부대비용 수정에 실패했습니다")
		return
	}

	var updated []model.IncidentalExpense
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[부대비용 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 부대비용을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/expenses/{id} — 부대비용 삭제
// 비유: 부대비용 전표 한 장을 파기하는 것
func (h *ExpenseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("incidental_expenses").
		Delete("", "").
		Eq("expense_id", id).
		Execute()
	if err != nil {
		log.Printf("[부대비용 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "부대비용 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
