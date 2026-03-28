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

// LCHandler — LC(신용장) 관련 API를 처리하는 핸들러
// 비유: "LC 서류함" — 각 PO에 연결된 LC 개설/결제 서류를 관리
// TODO: Rust 계산엔진 연동 — LC 만기일 계산 + 한도 복원 타임라인
// TODO: Rust 계산엔진 연동 — LC 수수료 계산 (Invoice Value x 수수료율 x 일수/360 x 환율)
type LCHandler struct {
	DB *supa.Client
}

// NewLCHandler — LCHandler 생성자
func NewLCHandler(db *supa.Client) *LCHandler {
	return &LCHandler{DB: db}
}

// List — GET /api/v1/lcs — LC 목록 조회 (은행/법인/PO 정보 포함)
// 비유: LC 서류함에서 전체 개설 현황을 꺼내 보여주는 것
// TODO: maturity_date 범위 필터 추가 (대시보드 "LC 만기 임박" 알림용)
func (h *LCHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("lc_records").
		Select("*, banks(bank_name), companies(company_name, company_code), purchase_orders(po_number)", "exact", false)

	// 비유: ?po_id=xxx — 특정 PO의 LC만 필터
	if poID := r.URL.Query().Get("po_id"); poID != "" {
		query = query.Eq("po_id", poID)
	}

	// 비유: ?bank_id=xxx — 특정 은행의 LC만 필터
	if bankID := r.URL.Query().Get("bank_id"); bankID != "" {
		query = query.Eq("bank_id", bankID)
	}

	// 비유: ?company_id=xxx — 특정 법인의 LC만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" {
		query = query.Eq("company_id", compID)
	}

	// 비유: ?status=opened — 특정 상태의 LC만 필터
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[LC 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "LC 목록 조회에 실패했습니다")
		return
	}

	var records []model.LCWithRelations
	if err := json.Unmarshal(data, &records); err != nil {
		log.Printf("[LC 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, records)
}

// GetByID — GET /api/v1/lcs/{id} — LC 상세 조회 (은행 한도/수수료율 포함)
// 비유: LC 서류를 펼쳐서 은행 한도, 수수료율까지 모두 보여주는 것
func (h *LCHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("lc_records").
		Select("*, banks(bank_name, lc_limit_usd, opening_fee_rate, acceptance_fee_rate), companies(company_name, company_code), purchase_orders(po_number, manufacturer_id)", "exact", false).
		Eq("lc_id", id).
		Execute()
	if err != nil {
		log.Printf("[LC 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "LC 조회에 실패했습니다")
		return
	}

	var records []model.LCDetail
	if err := json.Unmarshal(data, &records); err != nil {
		log.Printf("[LC 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(records) == 0 {
		response.RespondError(w, http.StatusNotFound, "LC를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, records[0])
}

// Create — POST /api/v1/lcs — LC 등록
// 비유: 새 LC 개설 서류를 작성하여 서류함에 보관하는 것
func (h *LCHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateLCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[LC 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 LC 신청서 필수 항목 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("lc_records").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[LC 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "LC 등록에 실패했습니다")
		return
	}

	var created []model.LCRecord
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[LC 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "LC 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/lcs/{id} — LC 수정
// 비유: 기존 LC 서류의 내용을 수정하는 것
func (h *LCHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateLCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[LC 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("lc_records").
		Update(req, "", "").
		Eq("lc_id", id).
		Execute()
	if err != nil {
		log.Printf("[LC 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "LC 수정에 실패했습니다")
		return
	}

	var updated []model.LCRecord
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[LC 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 LC를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}
