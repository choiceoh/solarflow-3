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

// CostDetailHandler — 원가 명세(cost_details) 관련 API를 처리하는 핸들러
// 비유: "원가 계산서 관리실" — FOB→CIF→Landed 3단계 원가를 관리
// Rust Landed Cost 계산은 /api/v1/calc/landed-cost 프록시가 담당한다.
// 비유: 이 핸들러는 계산서 보관함, 계산 자체는 Rust 계산실에 맡김.
type CostDetailHandler struct {
	DB *supa.Client
}

// NewCostDetailHandler — CostDetailHandler 생성자
func NewCostDetailHandler(db *supa.Client) *CostDetailHandler {
	return &CostDetailHandler{DB: db}
}

// List — GET /api/v1/cost-details — 원가 명세 목록 조회
// 비유: 특정 면장에 연결된 원가 계산서를 모두 꺼내 보여주는 것
func (h *CostDetailHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("cost_details").
		Select("*", "exact", false)

	// 비유: ?declaration_id=xxx — 특정 면장의 원가만 필터 (필수 권장)
	if declID := r.URL.Query().Get("declaration_id"); declID != "" {
		query = query.Eq("declaration_id", declID)
	}

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[원가 명세 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "원가 명세 목록 조회에 실패했습니다")
		return
	}

	var costs []model.CostDetail
	if err := json.Unmarshal(data, &costs); err != nil {
		log.Printf("[원가 명세 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, costs)
}

// GetByID — GET /api/v1/cost-details/{id} — 원가 명세 상세 조회
// 비유: 특정 원가 계산서를 꺼내 자세히 보는 것
func (h *CostDetailHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("cost_details").
		Select("*", "exact", false).
		Eq("cost_id", id).
		Execute()
	if err != nil {
		log.Printf("[원가 명세 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "원가 명세 조회에 실패했습니다")
		return
	}

	var costs []model.CostDetail
	if err := json.Unmarshal(data, &costs); err != nil {
		log.Printf("[원가 명세 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(costs) == 0 {
		response.RespondError(w, http.StatusNotFound, "원가 명세를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, costs[0])
}

// Create — POST /api/v1/cost-details — 원가 명세 등록
// 비유: 새 원가 계산서를 작성하여 관리실에 보관하는 것
func (h *CostDetailHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateCostDetailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[원가 명세 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("cost_details").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[원가 명세 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "원가 명세 등록에 실패했습니다")
		return
	}

	var created []model.CostDetail
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[원가 명세 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "원가 명세 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/cost-details/{id} — 원가 명세 수정
// 비유: 기존 원가 계산서의 내용을 수정하는 것
func (h *CostDetailHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateCostDetailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[원가 명세 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("cost_details").
		Update(req, "", "").
		Eq("cost_id", id).
		Execute()
	if err != nil {
		log.Printf("[원가 명세 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "원가 명세 수정에 실패했습니다")
		return
	}

	var updated []model.CostDetail
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[원가 명세 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 원가 명세를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/cost-details/{id} — 원가 명세 삭제
// 비유: 원가 계산서 한 줄을 파기하는 것
func (h *CostDetailHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("cost_details").
		Delete("", "").
		Eq("cost_id", id).
		Execute()
	if err != nil {
		log.Printf("[원가 명세 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "원가 명세 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
