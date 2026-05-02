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

// POLineHandler — 발주 라인아이템(po_line_items) 관련 API를 처리하는 핸들러
// 비유: "품목 명세 관리 담당" — 계약서에 붙는 개별 품목 정보를 관리
type POLineHandler struct {
	DB *supa.Client
}

// NewPOLineHandler — POLineHandler 생성자
func NewPOLineHandler(db *supa.Client) *POLineHandler {
	return &POLineHandler{DB: db}
}

// ListByPO — GET /api/v1/pos/{poId}/lines — 특정 PO의 라인아이템 목록 조회
// 비유: 특정 계약서에 붙은 품목 명세서를 모두 꺼내 보여주는 것
func (h *POLineHandler) ListByPO(w http.ResponseWriter, r *http.Request) {
	poID := chi.URLParam(r, "poId")

	data, _, err := h.DB.From("po_line_items").
		Select("*, products(product_code, product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		Eq("po_id", poID).
		Execute()
	if err != nil {
		log.Printf("[PO 라인아이템 목록 조회 실패] po_id=%s, err=%v", poID, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 목록 조회에 실패했습니다")
		return
	}

	var lines []model.POLineWithProduct
	if err := json.Unmarshal(data, &lines); err != nil {
		log.Printf("[PO 라인아이템 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, lines)
}

// Create — POST /api/v1/pos/{poId}/lines — 라인아이템 등록
// 비유: 계약서에 새 품목 명세를 추가하는 것
func (h *POLineHandler) Create(w http.ResponseWriter, r *http.Request) {
	poID := chi.URLParam(r, "poId")

	var req model.CreatePOLineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[PO 라인아이템 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: URL의 poId를 요청 데이터에 덮어씀 — 라우트 경로가 권위 있는 출처
	req.POID = poID

	// 비유: 접수 창구에서 품목 명세 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("po_line_items").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[PO 라인아이템 등록 실패] req=%+v err=%v", req, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 등록 실패: "+err.Error())
		return
	}

	var created []model.POLineItem
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[PO 라인아이템 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/pos/{poId}/lines/{id} — 라인아이템 수정
// 비유: 기존 품목 명세의 수량이나 단가를 수정하는 것
func (h *POLineHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdatePOLineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[PO 라인아이템 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("po_line_items").
		Update(req, "", "").
		Eq("po_line_id", id).
		Execute()
	if err != nil {
		log.Printf("[PO 라인아이템 수정 실패] id=%s req=%+v err=%v", id, req, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 수정 실패: "+err.Error())
		return
	}

	var updated []model.POLineItem
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[PO 라인아이템 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 라인아이템을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/pos/{poId}/lines/{id} — 라인아이템 삭제
// 비유: 계약서에서 특정 품목 명세를 제거하는 것
func (h *POLineHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("po_line_items").
		Delete("", "").
		Eq("po_line_id", id).
		Execute()
	if err != nil {
		log.Printf("[PO 라인아이템 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "라인아이템 삭제 실패: "+err.Error())
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
