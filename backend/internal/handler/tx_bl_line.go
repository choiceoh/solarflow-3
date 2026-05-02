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

// BLLineHandler — B/L 라인아이템(bl_line_items) 관련 API를 처리하는 핸들러
// 비유: "화물 명세 관리 담당" — 선적 서류에 붙는 개별 화물 정보를 관리
type BLLineHandler struct {
	DB *supa.Client
}

// NewBLLineHandler — BLLineHandler 생성자
func NewBLLineHandler(db *supa.Client) *BLLineHandler {
	return &BLLineHandler{DB: db}
}

// ListByBL — GET /api/v1/bls/{blId}/lines — 특정 B/L의 라인아이템 목록 조회
// 비유: 특정 선적 서류에 붙은 화물 명세서를 모두 꺼내 보여주는 것
func (h *BLLineHandler) ListByBL(w http.ResponseWriter, r *http.Request) {
	blID := chi.URLParam(r, "blId")

	data, _, err := h.DB.From("bl_line_items").
		Select("*, products(product_code, product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		Eq("bl_id", blID).
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 목록 조회 실패] bl_id=%s, err=%v", blID, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 목록 조회에 실패했습니다")
		return
	}

	var lines []model.BLLineWithProduct
	if err := json.Unmarshal(data, &lines); err != nil {
		log.Printf("[B/L 라인아이템 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, lines)
}

// Create — POST /api/v1/bls/{blId}/lines — B/L 라인아이템 등록
// 비유: 선적 서류에 새 화물 품목을 추가하는 것
func (h *BLLineHandler) Create(w http.ResponseWriter, r *http.Request) {
	blID := chi.URLParam(r, "blId")

	var req model.CreateBLLineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[B/L 라인아이템 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: URL의 blId를 요청 데이터에 덮어씀 — 라우트 경로가 권위 있는 출처
	req.BLID = blID

	// 비유: usage_category 기본값 (재고 집계용)
	if req.UsageCategory == "" {
		req.UsageCategory = "sale"
	}

	// 안전장치 (재고 0kW 근본 수정): capacity_kw가 0/누락이면 products.spec_wp로 자동 계산
	// quantity × spec_wp / 1000 = capacity_kw
	if req.CapacityKW <= 0 && req.ProductID != "" && req.Quantity > 0 {
		prodData, _, perr := h.DB.From("products").
			Select("spec_wp", "exact", false).
			Eq("product_id", req.ProductID).
			Execute()
		if perr == nil {
			var prods []struct {
				SpecWP int `json:"spec_wp"`
			}
			if err := json.Unmarshal(prodData, &prods); err == nil && len(prods) > 0 && prods[0].SpecWP > 0 {
				req.CapacityKW = float64(req.Quantity) * float64(prods[0].SpecWP) / 1000.0
				log.Printf("[B/L 라인 capacity_kw 자동계산] product=%s qty=%d spec_wp=%d → %.3f kW",
					req.ProductID, req.Quantity, prods[0].SpecWP, req.CapacityKW)
			}
		}
	}

	// 비유: 접수 창구에서 화물 품목 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("bl_line_items").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 등록 실패] req=%+v err=%v", req, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 등록 실패: "+err.Error())
		return
	}

	var created []model.BLLineItem
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[B/L 라인아이템 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/bls/{blId}/lines/{id} — B/L 라인아이템 수정
// 비유: 기존 화물 명세의 수량이나 용도를 수정하는 것
func (h *BLLineHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateBLLineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[B/L 라인아이템 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("bl_line_items").
		Update(req, "", "").
		Eq("bl_line_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 수정에 실패했습니다")
		return
	}

	var updated []model.BLLineItem
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[B/L 라인아이템 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 라인아이템을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/bls/{blId}/lines/{id} — B/L 라인아이템 삭제
// 비유: 선적 서류에서 특정 화물 품목을 제거하는 것
func (h *BLLineHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("bl_line_items").
		Delete("", "").
		Eq("bl_line_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 삭제에 실패했습니다")
		return
	}

	// 비유: 삭제 완료 응답을 구조체로 전송
	result := struct {
		Status string `json:"status"`
	}{
		Status: "deleted",
	}

	response.RespondJSON(w, http.StatusOK, result)
}
