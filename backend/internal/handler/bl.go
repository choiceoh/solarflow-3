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

// BLHandler — B/L(입고/선적) 관련 API를 처리하는 핸들러
// 비유: "선적 서류 관리실" — 수입/국내/그룹 내 입고 서류를 관리
type BLHandler struct {
	DB *supa.Client
}

// NewBLHandler — BLHandler 생성자
func NewBLHandler(db *supa.Client) *BLHandler {
	return &BLHandler{DB: db}
}

// List — GET /api/v1/bls — B/L 목록 조회 (법인/제조사/창고 정보 포함)
// 비유: 선적 서류 관리실에서 전체 입고 현황을 꺼내 보여주는 것
// TODO: eta 범위 필터 추가 (대시보드 "입항 예정" 알림용)
func (h *BLHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("bl_shipments").
		Select("*, companies(company_name, company_code), manufacturers(name_kr), warehouses(warehouse_name, location_name)", "exact", false)

	// 비유: ?po_id=xxx — 특정 PO의 B/L만 필터
	if poID := r.URL.Query().Get("po_id"); poID != "" {
		query = query.Eq("po_id", poID)
	}

	// 비유: ?company_id=xxx — 특정 법인의 B/L만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}

	// 비유: ?manufacturer_id=xxx — 특정 제조사의 B/L만 필터
	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		query = query.Eq("manufacturer_id", mfgID)
	}

	// 비유: ?status=shipping — 특정 상태의 B/L만 필터
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[B/L 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 목록 조회에 실패했습니다")
		return
	}

	var shipments []model.BLWithRelations
	if err := json.Unmarshal(data, &shipments); err != nil {
		log.Printf("[B/L 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, shipments)
}

// GetByID — GET /api/v1/bls/{id} — B/L 상세 조회 (라인아이템 포함)
// 비유: 선적 서류를 펼쳐서 화물 명세까지 모두 보여주는 것
// TODO: Rust 계산엔진 연동 — 재고 집계 (물리적→가용→총확보량)
func (h *BLHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 비유: 선적 서류 본문 조회
	blData, _, err := h.DB.From("bl_shipments").
		Select("*, companies(company_name, company_code), manufacturers(name_kr, name_en), warehouses(warehouse_name, location_name, warehouse_code, location_code)", "exact", false).
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 조회에 실패했습니다")
		return
	}

	var shipments []model.BLDetailBase
	if err := json.Unmarshal(blData, &shipments); err != nil {
		log.Printf("[B/L 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(shipments) == 0 {
		response.RespondError(w, http.StatusNotFound, "B/L을 찾을 수 없습니다")
		return
	}

	// 비유: 선적 서류에 첨부된 화물 명세 조회
	lineData, _, err := h.DB.From("bl_line_items").
		Select("*, products(product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 조회 실패] bl_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 조회에 실패했습니다")
		return
	}

	var lines []model.BLLineWithProduct
	if err := json.Unmarshal(lineData, &lines); err != nil {
		log.Printf("[B/L 라인아이템 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 데이터 처리에 실패했습니다")
		return
	}

	// 비유: 선적 서류 + 화물 명세를 한 묶음으로 포장
	detail := model.BLDetail{
		BLDetailBase: shipments[0],
		LineItems:    lines,
	}

	response.RespondJSON(w, http.StatusOK, detail)
}

// Create — POST /api/v1/bls — B/L 등록
// 비유: 새 선적 서류를 작성하여 관리실에 보관하는 것
func (h *BLHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateBLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[B/L 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 선적 서류 필수 항목 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("bl_shipments").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[B/L 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 등록에 실패했습니다")
		return
	}

	var created []model.BLShipment
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[B/L 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "B/L 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/bls/{id} — B/L 수정
// 비유: 기존 선적 서류의 내용을 수정하는 것
func (h *BLHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateBLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[B/L 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("bl_shipments").
		Update(req, "", "").
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 수정에 실패했습니다")
		return
	}

	var updated []model.BLShipment
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[B/L 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 B/L을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/bls/{id} — B/L 삭제
// 비유: 선적 서류를 파기하는 것 — 연결된 라인아이템도 함께 삭제
func (h *BLHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 라인아이템 먼저 삭제
	_, _, err := h.DB.From("bl_line_items").
		Delete("", "").
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 라인아이템 삭제 실패] bl_id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 삭제에 실패했습니다")
		return
	}

	// B/L 본체 삭제
	data, _, err := h.DB.From("bl_shipments").
		Delete("", "").
		Eq("bl_id", id).
		Execute()
	if err != nil {
		log.Printf("[B/L 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "B/L 삭제에 실패했습니다")
		return
	}

	var deleted []model.BLShipment
	if err := json.Unmarshal(data, &deleted); err != nil || len(deleted) == 0 {
		response.RespondError(w, http.StatusNotFound, "삭제할 B/L을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, map[string]string{"message": "삭제 완료"})
}
