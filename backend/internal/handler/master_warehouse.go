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

// WarehouseHandler — 창고/장소(warehouses) 관련 API를 처리하는 핸들러
// 비유: "물류센터 안내도" — 광양항, 부산항, 광주공장 등 장소 관리
type WarehouseHandler struct {
	DB *supa.Client
}

// NewWarehouseHandler — WarehouseHandler 생성자
func NewWarehouseHandler(db *supa.Client) *WarehouseHandler {
	return &WarehouseHandler{DB: db}
}

// List — GET /api/v1/warehouses — 창고 목록 조회
// 비유: 물류센터 안내도에서 전체 장소를 보여주는 것
func (h *WarehouseHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("warehouses").
		Select("*", "exact", false)

	// 비유: ?type=port — 항구만 필터
	if wType := r.URL.Query().Get("type"); wType != "" {
		query = query.Eq("warehouse_type", wType)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[창고 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "창고 목록 조회에 실패했습니다")
		return
	}

	var warehouses []model.Warehouse
	if err := json.Unmarshal(data, &warehouses); err != nil {
		log.Printf("[창고 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, warehouses)
}

// GetByID — GET /api/v1/warehouses/{id} — 창고 상세 조회
// 비유: 안내도에서 특정 장소 카드를 찾아 보여주는 것
func (h *WarehouseHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("warehouses").
		Select("*", "exact", false).
		Eq("warehouse_id", id).
		Execute()
	if err != nil {
		log.Printf("[창고 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "창고 조회에 실패했습니다")
		return
	}

	var warehouses []model.Warehouse
	if err := json.Unmarshal(data, &warehouses); err != nil {
		log.Printf("[창고 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(warehouses) == 0 {
		response.RespondError(w, http.StatusNotFound, "창고를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, warehouses[0])
}

// Create — POST /api/v1/warehouses — 창고 등록
// 비유: 새 장소 카드를 만들어 안내도에 추가하는 것
func (h *WarehouseHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateWarehouseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[창고 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 접수 창구에서 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("warehouses").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[창고 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "창고 등록에 실패했습니다")
		return
	}

	var created []model.Warehouse
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[창고 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "창고 등록 결과를 확인할 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/warehouses/{id} — 창고 수정
// 비유: 기존 장소 카드의 정보를 수정하는 것
func (h *WarehouseHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateWarehouseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[창고 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	// 비유: 변경 신청서 검증
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("warehouses").
		Update(req, "", "").
		Eq("warehouse_id", id).
		Execute()
	if err != nil {
		log.Printf("[창고 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "창고 수정에 실패했습니다")
		return
	}

	var updated []model.Warehouse
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[창고 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 창고를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/warehouses/{id} — 창고 삭제
// 비유: 물류센터 안내도에서 장소 카드를 완전히 제거하는 것
func (h *WarehouseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("warehouses").
		Delete("", "").
		Eq("warehouse_id", id).
		Execute()
	if err != nil {
		log.Printf("[창고 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "창고 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "deleted"})
}

// ToggleStatus — PATCH /api/v1/warehouses/{id}/status — 창고 활성/비활성
func (h *WarehouseHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
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
	_, _, err := h.DB.From("warehouses").Update(req, "", "").Eq("warehouse_id", id).Execute()
	if err != nil {
		log.Printf("[창고 상태 변경 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "창고 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "ok"})
}
