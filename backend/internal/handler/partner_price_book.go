package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// PartnerPriceBookHandler — BARO Phase 1: 거래처별 단가표 핸들러
// 비유: "거래처 단가 보관함" — 같은 패널이라도 거래처마다 가격이 다를 때 단가를 한 줄로 잠금
type PartnerPriceBookHandler struct {
	DB *supa.Client
}

// NewPartnerPriceBookHandler — 생성자
func NewPartnerPriceBookHandler(db *supa.Client) *PartnerPriceBookHandler {
	return &PartnerPriceBookHandler{DB: db}
}

// List — GET /api/v1/partner-prices?partner_id=&product_id= — 단가 목록 조회
// 비유: 단가표 보관함을 펼쳐 조건에 맞는 행만 보여주는 것
func (h *PartnerPriceBookHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("partner_price_book").
		Select("*", "exact", false)

	if partnerID := r.URL.Query().Get("partner_id"); partnerID != "" {
		query = query.Eq("partner_id", partnerID)
	}
	if productID := r.URL.Query().Get("product_id"); productID != "" {
		query = query.Eq("product_id", productID)
	}

	data, _, err := query.
		Order("partner_id", &postgrest.OrderOpts{Ascending: true}).
		Order("product_id", &postgrest.OrderOpts{Ascending: true}).
		Order("effective_from", &postgrest.OrderOpts{Ascending: false}).
		Execute()
	if err != nil {
		log.Printf("[거래처 단가표 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 단가표 조회에 실패했습니다")
		return
	}

	var prices []model.PartnerPrice
	if err := json.Unmarshal(data, &prices); err != nil {
		log.Printf("[거래처 단가표 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, prices)
}

// Lookup — GET /api/v1/partner-prices/lookup?partner_id=&product_id=&on=YYYY-MM-DD
// 특정 시점에 유효한 단가 1건을 반환. on이 없으면 오늘 기준.
// 비유: 거래처×품번에 대해 "오늘 단가" 한 줄을 즉시 꺼내는 것 — 수주 입력 시 prefill
func (h *PartnerPriceBookHandler) Lookup(w http.ResponseWriter, r *http.Request) {
	partnerID := r.URL.Query().Get("partner_id")
	productID := r.URL.Query().Get("product_id")
	if partnerID == "" || productID == "" {
		response.RespondError(w, http.StatusBadRequest, "partner_id와 product_id는 필수 항목입니다")
		return
	}
	on := r.URL.Query().Get("on")
	if on == "" {
		on = time.Now().Format("2006-01-02")
	}

	// 유효 단가: effective_from <= on AND (effective_to IS NULL OR effective_to >= on)
	// 가장 최근 effective_from 1건 반환.
	data, _, err := h.DB.From("partner_price_book").
		Select("*", "exact", false).
		Eq("partner_id", partnerID).
		Eq("product_id", productID).
		Lte("effective_from", on).
		Or("effective_to.is.null,effective_to.gte."+on, "").
		Order("effective_from", &postgrest.OrderOpts{Ascending: false}).
		Limit(1, "").
		Execute()
	if err != nil {
		log.Printf("[거래처 단가 lookup 실패] partner=%s product=%s on=%s err=%v", partnerID, productID, on, err)
		response.RespondError(w, http.StatusInternalServerError, "단가 조회에 실패했습니다")
		return
	}

	var prices []model.PartnerPrice
	if err := json.Unmarshal(data, &prices); err != nil {
		log.Printf("[거래처 단가 lookup 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(prices) == 0 {
		response.RespondError(w, http.StatusNotFound, "해당 거래처/품번의 유효 단가가 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, prices[0])
}

// GetByID — GET /api/v1/partner-prices/{id}
func (h *PartnerPriceBookHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	data, _, err := h.DB.From("partner_price_book").
		Select("*", "exact", false).
		Eq("price_id", id).
		Execute()
	if err != nil {
		log.Printf("[거래처 단가 상세 조회 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 단가 조회에 실패했습니다")
		return
	}
	var prices []model.PartnerPrice
	if err := json.Unmarshal(data, &prices); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(prices) == 0 {
		response.RespondError(w, http.StatusNotFound, "거래처 단가를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, prices[0])
}

// Create — POST /api/v1/partner-prices
func (h *PartnerPriceBookHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePartnerPriceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("partner_price_book").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[거래처 단가 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 단가 등록에 실패했습니다 (동일 거래처/품번/시작일 중복 가능)")
		return
	}
	var created []model.PartnerPrice
	if err := json.Unmarshal(data, &created); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "거래처 단가 등록 결과를 확인할 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/partner-prices/{id}
func (h *PartnerPriceBookHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdatePartnerPriceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("partner_price_book").
		Update(req, "", "").
		Eq("price_id", id).
		Execute()
	if err != nil {
		log.Printf("[거래처 단가 수정 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 단가 수정에 실패했습니다")
		return
	}
	var updated []model.PartnerPrice
	if err := json.Unmarshal(data, &updated); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 거래처 단가를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/partner-prices/{id}
func (h *PartnerPriceBookHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("partner_price_book").
		Delete("", "").
		Eq("price_id", id).
		Execute()
	if err != nil {
		log.Printf("[거래처 단가 삭제 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 단가 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
