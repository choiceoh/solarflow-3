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

// CompanyHandler — 법인(companies) 관련 API를 처리하는 핸들러
// 비유: "법인 관리실" — 탑솔라, 디원, 화신 정보를 관리하는 방
type CompanyHandler struct {
	DB *supa.Client
}

// NewCompanyHandler — CompanyHandler 생성자
func NewCompanyHandler(db *supa.Client) *CompanyHandler {
	return &CompanyHandler{DB: db}
}

// List — GET /api/v1/companies — 법인 목록 조회
// 비유: 법인 관리실에서 전체 명함첩을 꺼내 보여주는 것
func (h *CompanyHandler) List(w http.ResponseWriter, r *http.Request) {
	data, _, err := h.DB.From("companies").
		Select("*", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[법인 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "법인 목록 조회에 실패했습니다")
		return
	}

	var companies []model.Company
	if err := json.Unmarshal(data, &companies); err != nil {
		log.Printf("[법인 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, companies)
}

// GetByID — GET /api/v1/companies/{id} — 법인 상세 조회
// 비유: 명함첩에서 특정 법인 카드를 찾아 보여주는 것
func (h *CompanyHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("companies").
		Select("*", "exact", false).
		Eq("company_id", id).
		Execute()
	if err != nil {
		log.Printf("[법인 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 조회에 실패했습니다")
		return
	}

	var companies []model.Company
	if err := json.Unmarshal(data, &companies); err != nil {
		log.Printf("[법인 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(companies) == 0 {
		response.RespondError(w, http.StatusNotFound, "법인을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, companies[0])
}

// Create — POST /api/v1/companies — 법인 등록
// 비유: 새 법인 명함을 만들어 명함첩에 추가하는 것
func (h *CompanyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateCompanyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[법인 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("companies").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[법인 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "법인 등록에 실패했습니다")
		return
	}

	var created []model.Company
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[법인 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "법인 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/companies/{id} — 법인 수정
// 비유: 기존 명함의 정보를 수정하는 것
func (h *CompanyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateCompanyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[법인 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("companies").
		Update(req, "", "").
		Eq("company_id", id).
		Execute()
	if err != nil {
		log.Printf("[법인 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 수정에 실패했습니다")
		return
	}

	var updated []model.Company
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[법인 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 법인을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// ToggleStatus — PATCH /api/v1/companies/{id}/status — 법인 활성/비활성 토글
// 비유: 명함에 "활동중/휴면" 도장을 찍는 것
func (h *CompanyHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 비유: 공통 토글 구조체로 요청을 받음
	var req model.ToggleStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[법인 상태 변경 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("companies").
		Update(req, "", "").
		Eq("company_id", id).
		Execute()
	if err != nil {
		log.Printf("[법인 상태 변경 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "법인 상태 변경에 실패했습니다")
		return
	}

	var toggled []model.Company
	if err := json.Unmarshal(data, &toggled); err != nil {
		log.Printf("[법인 상태 변경 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(toggled) == 0 {
		response.RespondError(w, http.StatusNotFound, "상태를 변경할 법인을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, toggled[0])
}
