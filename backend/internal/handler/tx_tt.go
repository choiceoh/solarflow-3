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

// TTHandler — TT(전신송금) 관련 API를 처리하는 핸들러
// 비유: "TT 송금 관리실" — 각 PO에 연결된 선급금/잔금 송금 내역을 관리
type TTHandler struct {
	DB *supa.Client
}

// NewTTHandler — TTHandler 생성자
func NewTTHandler(db *supa.Client) *TTHandler {
	return &TTHandler{DB: db}
}

// List — GET /api/v1/tts — TT 목록 조회 (PO/제조사 정보 포함)
// 비유: 송금 관리실에서 전체 송금 전표를 꺼내 보여주는 것
func (h *TTHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("tt_remittances").
		Select("*, purchase_orders(po_number, manufacturers(name_kr))", "exact", false)

	// 비유: ?po_id=xxx — 특정 PO의 송금만 필터
	if poID := r.URL.Query().Get("po_id"); poID != "" {
		query = query.Eq("po_id", poID)
	}

	// 비유: ?status=completed — 특정 상태의 송금만 필터
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[TT 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 목록 조회에 실패했습니다")
		return
	}

	var remittances []model.TTWithRelations
	if err := json.Unmarshal(data, &remittances); err != nil {
		log.Printf("[TT 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, remittances)
}

// GetByID — GET /api/v1/tts/{id} — TT 상세 조회
// 비유: 특정 송금 전표를 꺼내 자세히 보는 것
func (h *TTHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("tt_remittances").
		Select("*, purchase_orders(po_number, manufacturers(name_kr))", "exact", false).
		Eq("tt_id", id).
		Execute()
	if err != nil {
		log.Printf("[TT 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "TT 조회에 실패했습니다")
		return
	}

	var remittances []model.TTWithRelations
	if err := json.Unmarshal(data, &remittances); err != nil {
		log.Printf("[TT 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(remittances) == 0 {
		response.RespondError(w, http.StatusNotFound, "TT를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, remittances[0])
}

// Create — POST /api/v1/tts — TT 등록
// 비유: 새 송금 전표를 작성하여 관리실에 보관하는 것
func (h *TTHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateTTRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[TT 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 송금 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("tt_remittances").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[TT 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 등록에 실패했습니다")
		return
	}

	var created []model.TTRemittance
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[TT 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "TT 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/tts/{id} — TT 수정
// 비유: 기존 송금 전표의 내용을 수정하는 것
func (h *TTHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateTTRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[TT 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("tt_remittances").
		Update(req, "", "").
		Eq("tt_id", id).
		Execute()
	if err != nil {
		log.Printf("[TT 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "TT 수정에 실패했습니다")
		return
	}

	var updated []model.TTRemittance
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[TT 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 TT를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/tts/{id} — TT 송금 삭제
func (h *TTHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("tt_remittances").
		Delete("", "").
		Eq("tt_id", id).
		Execute()
	if err != nil {
		log.Printf("[TT 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "TT 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
