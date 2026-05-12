package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BankAccountHandler — 은행 계좌 마스터 API
// 비유: "통장 카드 캐비넷" — 회사별 수금/지급 계좌 정보 관리.
// 기존 BankHandler(LC 한도 카드) 와는 별개의 마스터.
type BankAccountHandler struct {
	DB *supa.Client
}

// NewBankAccountHandler — BankAccountHandler 생성자
func NewBankAccountHandler(db *supa.Client) *BankAccountHandler {
	return &BankAccountHandler{DB: db}
}

// List — GET /api/v1/bank-accounts — 계좌 목록 (법인 정보 포함)
func (h *BankAccountHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("bank_accounts").
		Select("*, companies(company_name, company_code)", "exact", false)

	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}
	if currency := r.URL.Query().Get("currency"); currency != "" {
		query = query.Eq("currency", currency)
	}
	if onlyActive := r.URL.Query().Get("active"); onlyActive == "true" {
		query = query.Eq("is_active", "true")
	}

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[계좌 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "계좌 목록 조회에 실패했습니다")
		return
	}

	var accounts []model.BankAccountWithCompany
	if err := json.Unmarshal(data, &accounts); err != nil {
		log.Printf("[계좌 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, accounts)
}

// GetByID — GET /api/v1/bank-accounts/{id}
func (h *BankAccountHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("bank_accounts").
		Select("*, companies(company_name, company_code)", "exact", false).
		Eq("account_id", id).
		Execute()
	if err != nil {
		log.Printf("[계좌 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "계좌 조회에 실패했습니다")
		return
	}

	var accounts []model.BankAccountWithCompany
	if err := json.Unmarshal(data, &accounts); err != nil {
		log.Printf("[계좌 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(accounts) == 0 {
		response.RespondError(w, http.StatusNotFound, "계좌를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, accounts[0])
}

// Create — POST /api/v1/bank-accounts
func (h *BankAccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateBankAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[계좌 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("bank_accounts").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[계좌 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "계좌 등록에 실패했습니다")
		return
	}

	var created []model.BankAccount
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[계좌 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "계좌 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT/PATCH /api/v1/bank-accounts/{id}
func (h *BankAccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateBankAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[계좌 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("bank_accounts").
		Update(req, "", "").
		Eq("account_id", id).
		Execute()
	if err != nil {
		log.Printf("[계좌 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "계좌 수정에 실패했습니다")
		return
	}

	var updated []model.BankAccount
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[계좌 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 계좌를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/bank-accounts/{id}
func (h *BankAccountHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("bank_accounts").
		Delete("", "").
		Eq("account_id", id).
		Execute()
	if err != nil {
		log.Printf("[계좌 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "계좌 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}

// ToggleStatus — PATCH /api/v1/bank-accounts/{id}/status — 활성/비활성 토글
func (h *BankAccountHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.ToggleStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	_, _, err := h.DB.From("bank_accounts").Update(req, "", "").Eq("account_id", id).Execute()
	if err != nil {
		log.Printf("[계좌 상태 변경 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "계좌 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "ok"})
}
