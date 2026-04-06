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

// OutboundHandler — 출고(outbounds) 관련 API를 처리하는 핸들러
// 비유: "출고 관리실" — 창고에서 현장/고객으로 나가는 모듈 출고를 관리
// TODO: Rust 계산엔진 연동 — 재고 차감 검증 (가용재고 >= 출고수량)
// TODO: 그룹 내 거래 — 출고 시 상대 법인 입고 자동 생성
type OutboundHandler struct {
	DB *supa.Client
}

// NewOutboundHandler — OutboundHandler 생성자
func NewOutboundHandler(db *supa.Client) *OutboundHandler {
	return &OutboundHandler{DB: db}
}

// List — GET /api/v1/outbounds — 출고 목록 조회
// 비유: 출고 관리실에서 전체 출고 전표를 꺼내 보여주는 것
func (h *OutboundHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("outbounds").
		Select("*", "exact", false)

	// 비유: ?company_id=xxx — 특정 법인의 출고만 필터
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}

	// 비유: ?warehouse_id=xxx — 특정 창고의 출고만 필터
	if whID := r.URL.Query().Get("warehouse_id"); whID != "" {
		query = query.Eq("warehouse_id", whID)
	}

	// 비유: ?usage_category=sale — 특정 용도의 출고만 필터
	if usage := r.URL.Query().Get("usage_category"); usage != "" {
		query = query.Eq("usage_category", usage)
	}

	// 비유: ?order_id=xxx — 특정 수주의 출고만 필터
	if orderID := r.URL.Query().Get("order_id"); orderID != "" {
		query = query.Eq("order_id", orderID)
	}

	// 비유: ?status=active — 특정 상태의 출고만 필터
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[출고 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 목록 조회에 실패했습니다")
		return
	}

	var outbounds []model.Outbound
	if err := json.Unmarshal(data, &outbounds); err != nil {
		log.Printf("[출고 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, outbounds)
}

// GetByID — GET /api/v1/outbounds/{id} — 출고 상세 조회
// 비유: 특정 출고 전표를 꺼내 자세히 보는 것
func (h *OutboundHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("outbounds").
		Select("*", "exact", false).
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		log.Printf("[출고 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 조회에 실패했습니다")
		return
	}

	var outbounds []model.Outbound
	if err := json.Unmarshal(data, &outbounds); err != nil {
		log.Printf("[출고 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(outbounds) == 0 {
		response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, outbounds[0])
}

// Create — POST /api/v1/outbounds — 출고 등록
// 비유: 새 출고 전표를 작성하여 관리실에 보관하는 것
func (h *OutboundHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateOutboundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[출고 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: status 미입력이면 기본값 "active" 설정
	if req.Status == "" {
		req.Status = "active"
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("outbounds").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[출고 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 등록에 실패했습니다")
		return
	}

	var created []model.Outbound
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[출고 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "출고 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/outbounds/{id} — 출고 수정
// 비유: 기존 출고 전표의 내용을 수정하는 것
func (h *OutboundHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateOutboundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[출고 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("outbounds").
		Update(req, "", "").
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		log.Printf("[출고 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 수정에 실패했습니다")
		return
	}

	var updated []model.Outbound
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[출고 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 출고를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/outbounds/{id} — 출고 삭제
// 비유: 출고 서류를 파기하는 것 — 연결된 매출 정보도 함께 삭제
func (h *OutboundHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 연결된 매출 먼저 삭제 (FK 제약)
	_, _, _ = h.DB.From("sales").
		Delete("", "").
		Eq("outbound_id", id).
		Execute()

	// 출고 본체 삭제
	_, _, err := h.DB.From("outbounds").
		Delete("", "").
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		log.Printf("[출고 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 삭제에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
