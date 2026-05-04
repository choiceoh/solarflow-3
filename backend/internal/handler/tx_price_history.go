package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// PriceHistoryHandler — 단가이력(price_histories) 관련 API를 처리하는 핸들러
// 비유: "단가 변동 기록부 창구" — 제품별 단가 변동 이력을 관리
type PriceHistoryHandler struct {
	DB *supa.Client
}

// NewPriceHistoryHandler — PriceHistoryHandler 생성자
func NewPriceHistoryHandler(db *supa.Client) *PriceHistoryHandler {
	return &PriceHistoryHandler{DB: db}
}

// List — GET /api/v1/price-histories — 단가이력 목록 조회
// 비유: 기록부에서 전체 단가 변동 이력을 꺼내 보여주는 것
func (h *PriceHistoryHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("price_histories").
		Select("*, manufacturers(name_kr), products(product_code, product_name, spec_wp), purchase_orders(po_number)", "exact", false).
		Order("change_date", &postgrest.OrderOpts{Ascending: false})

	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}
	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		query = query.Eq("manufacturer_id", mfgID)
	}
	if prodID := r.URL.Query().Get("product_id"); prodID != "" {
		query = query.Eq("product_id", prodID)
	}

	limit, offset := parseLimitOffset(r, 100, 1000)
	data, count, err := query.Range(offset, offset+limit-1, "").Execute()
	if err != nil {
		log.Printf("[단가이력 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "단가이력 목록 조회에 실패했습니다")
		return
	}

	var histories []model.PriceHistoryWithRelations
	if err := json.Unmarshal(data, &histories); err != nil {
		log.Printf("[단가이력 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, histories)
}

// GetByID — GET /api/v1/price-histories/{id} — 단가이력 상세 조회
// 비유: 특정 단가 변동 기록을 꺼내 자세히 보는 것
func (h *PriceHistoryHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("price_histories").
		Select("*, manufacturers(name_kr), products(product_code, product_name, spec_wp), purchase_orders(po_number)", "exact", false).
		Eq("price_history_id", id).
		Execute()
	if err != nil {
		log.Printf("[단가이력 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "단가이력 조회에 실패했습니다")
		return
	}

	var histories []model.PriceHistoryWithRelations
	if err := json.Unmarshal(data, &histories); err != nil {
		log.Printf("[단가이력 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(histories) == 0 {
		response.RespondError(w, http.StatusNotFound, "단가이력을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, histories[0])
}

// Create — POST /api/v1/price-histories — 단가이력 등록
// 비유: 새 단가 변동 기록을 작성하여 기록부에 보관하는 것
func (h *PriceHistoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePriceHistoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[단가이력 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("price_histories").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[단가이력 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "단가이력 등록에 실패했습니다")
		return
	}

	var created []model.PriceHistory
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[단가이력 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "단가이력 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/price-histories/{id} — 단가이력 수정
// 비유: 기존 단가 변동 기록의 내용을 수정하는 것
func (h *PriceHistoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdatePriceHistoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[단가이력 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("price_histories").
		Update(req, "", "").
		Eq("price_history_id", id).
		Execute()
	if err != nil {
		log.Printf("[단가이력 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "단가이력 수정에 실패했습니다")
		return
	}

	var updated []model.PriceHistory
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[단가이력 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 단가이력을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}
