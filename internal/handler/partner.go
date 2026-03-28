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

// PartnerHandler — 거래처(partners) 관련 API를 처리하는 핸들러
// 비유: "거래처 명함 보관함" — 바로(주), 신명엔지니어링 등 공급사/고객 관리
type PartnerHandler struct {
	DB *supa.Client
}

// NewPartnerHandler — PartnerHandler 생성자
func NewPartnerHandler(db *supa.Client) *PartnerHandler {
	return &PartnerHandler{DB: db}
}

// List — GET /api/v1/partners — 거래처 목록 조회
// 비유: 명함 보관함에서 전체 거래처를 꺼내 보여주는 것
func (h *PartnerHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("partners").
		Select("*", "exact", false)

	// 비유: ?type=supplier — 공급사만 필터
	if pType := r.URL.Query().Get("type"); pType != "" {
		query = query.Eq("partner_type", pType)
	}

	// 비유: ?active=true — 활성 거래처만 필터
	if active := r.URL.Query().Get("active"); active != "" {
		query = query.Eq("is_active", active)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[거래처 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 목록 조회에 실패했습니다")
		return
	}

	var partners []model.Partner
	if err := json.Unmarshal(data, &partners); err != nil {
		log.Printf("[거래처 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, partners)
}

// GetByID — GET /api/v1/partners/{id} — 거래처 상세 조회
// 비유: 보관함에서 특정 거래처 명함을 찾아 보여주는 것
func (h *PartnerHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("partners").
		Select("*", "exact", false).
		Eq("partner_id", id).
		Execute()
	if err != nil {
		log.Printf("[거래처 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 조회에 실패했습니다")
		return
	}

	var partners []model.Partner
	if err := json.Unmarshal(data, &partners); err != nil {
		log.Printf("[거래처 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(partners) == 0 {
		response.RespondError(w, http.StatusNotFound, "거래처를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, partners[0])
}

// Create — POST /api/v1/partners — 거래처 등록
// 비유: 새 거래처 명함을 만들어 보관함에 추가하는 것
func (h *PartnerHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePartnerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[거래처 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("partners").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[거래처 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 등록에 실패했습니다")
		return
	}

	var created []model.Partner
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[거래처 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "거래처 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/partners/{id} — 거래처 수정
// 비유: 기존 거래처 명함의 정보를 수정하는 것
func (h *PartnerHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdatePartnerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[거래처 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("partners").
		Update(req, "", "").
		Eq("partner_id", id).
		Execute()
	if err != nil {
		log.Printf("[거래처 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 수정에 실패했습니다")
		return
	}

	var updated []model.Partner
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[거래처 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 거래처를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}
