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

// ProductHandler — 품번(products) 관련 API를 처리하는 핸들러
// 비유: "모듈 규격 카탈로그실" — JKM635, TSM-720 같은 모듈 사양을 관리
type ProductHandler struct {
	DB *supa.Client
}

// NewProductHandler — ProductHandler 생성자
func NewProductHandler(db *supa.Client) *ProductHandler {
	return &ProductHandler{DB: db}
}

// List — GET /api/v1/products — 품번 목록 조회 (제조사 정보 포함)
// 비유: 카탈로그실에서 전체 모듈 규격을 꺼내 보여주는 것
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("products").
		Select("*, manufacturers(name_kr, short_name, domestic_foreign)", "exact", false)

	// 비유: ?manufacturer_id=xxx — 특정 제조사 모듈만 필터
	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		query = query.Eq("manufacturer_id", mfgID)
	}

	// 비유: ?active=true — 활성 모듈만 필터
	if active := r.URL.Query().Get("active"); active != "" {
		query = query.Eq("is_active", active)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[품번 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "품번 목록 조회에 실패했습니다")
		return
	}

	var products []model.ProductWithManufacturer
	if err := json.Unmarshal(data, &products); err != nil {
		log.Printf("[품번 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, products)
}

// GetByID — GET /api/v1/products/{id} — 품번 상세 조회
// 비유: 카탈로그에서 특정 모듈 규격 카드를 찾아 보여주는 것
func (h *ProductHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("products").
		Select("*, manufacturers(name_kr, short_name, name_en, domestic_foreign)", "exact", false).
		Eq("product_id", id).
		Execute()
	if err != nil {
		log.Printf("[품번 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "품번 조회에 실패했습니다")
		return
	}

	var products []model.ProductWithManufacturer
	if err := json.Unmarshal(data, &products); err != nil {
		log.Printf("[품번 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(products) == 0 {
		response.RespondError(w, http.StatusNotFound, "품번을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, products[0])
}

// Create — POST /api/v1/products — 품번 등록
// 비유: 새 모듈 규격 카드를 만들어 카탈로그에 추가하는 것
func (h *ProductHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[품번 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 규격 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("products").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[품번 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "품번 등록에 실패했습니다")
		return
	}

	var created []model.Product
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[품번 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "품번 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/products/{id} — 품번 수정
// 비유: 기존 모듈 규격 카드의 사양을 수정하는 것
func (h *ProductHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[품번 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("products").
		Update(req, "", "").
		Eq("product_id", id).
		Execute()
	if err != nil {
		log.Printf("[품번 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "품번 수정에 실패했습니다")
		return
	}

	var updated []model.Product
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[품번 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 품번을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/products/{id} — 품번 삭제
// 비유: 카탈로그에서 모듈 규격 카드를 완전히 제거하는 것
func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("products").
		Delete("", "").
		Eq("product_id", id).
		Execute()
	if err != nil {
		log.Printf("[품번 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "품번 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "deleted"})
}

// ToggleStatus — PATCH /api/v1/products/{id}/status — 품번 활성/비활성
// 비유: 모듈 카드에 활동중/단종 도장
func (h *ProductHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
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
	_, _, err := h.DB.From("products").Update(req, "", "").Eq("product_id", id).Execute()
	if err != nil {
		log.Printf("[품번 상태 변경 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "품번 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "ok"})
}
