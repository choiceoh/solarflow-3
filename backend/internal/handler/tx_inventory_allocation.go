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

// InventoryAllocationHandler — 가용재고 배정 (inventory_allocations) API
// 비유: "가용재고 예약 데스크" — 판매예정/공사예정으로 재고를 미리 확보
type InventoryAllocationHandler struct {
	DB *supa.Client
}

func NewInventoryAllocationHandler(db *supa.Client) *InventoryAllocationHandler {
	return &InventoryAllocationHandler{DB: db}
}

// List — GET /api/v1/inventory/allocations
func (h *InventoryAllocationHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("inventory_allocations").
		Select("*", "exact", false)

	if cid := r.URL.Query().Get("company_id"); cid != "" && cid != "all" {
		query = query.Eq("company_id", cid)
	}
	if pid := r.URL.Query().Get("product_id"); pid != "" {
		query = query.Eq("product_id", pid)
	}
	if st := r.URL.Query().Get("status"); st != "" {
		query = query.Eq("status", st)
	}
	if gid := r.URL.Query().Get("group_id"); gid != "" {
		query = query.Eq("group_id", gid)
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[배정 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "배정 목록 조회에 실패했습니다")
		return
	}

	var items []model.InventoryAllocation
	if err := json.Unmarshal(data, &items); err != nil {
		log.Printf("[배정 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, items)
}

// GetByID — GET /api/v1/inventory/allocations/{id}
func (h *InventoryAllocationHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("inventory_allocations").
		Select("*", "exact", false).
		Eq("alloc_id", id).
		Execute()
	if err != nil {
		log.Printf("[배정 상세 조회 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "배정 조회에 실패했습니다")
		return
	}

	var items []model.InventoryAllocation
	if err := json.Unmarshal(data, &items); err != nil {
		log.Printf("[배정 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(items) == 0 {
		response.RespondError(w, http.StatusNotFound, "배정을 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, items[0])
}

// Create — POST /api/v1/inventory/allocations
func (h *InventoryAllocationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateInventoryAllocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	if req.Status == "" {
		req.Status = "pending"
	}

	// "representation" → PostgREST가 Prefer: return=representation 헤더를 보내 삽입된 행을 응답
	data, _, err := h.DB.From("inventory_allocations").
		Insert(req, false, "", "representation", "").
		Execute()
	if err != nil {
		log.Printf("[배정 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "배정 등록에 실패했습니다")
		return
	}

	var created []model.InventoryAllocation
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		// 삽입 자체는 성공했으나 응답 파싱 불가 시 성공으로 처리
		log.Printf("[배정 등록 응답 파싱 주의] data=%s err=%v", string(data), err)
		response.RespondJSON(w, http.StatusCreated, struct {
			Status string `json:"status"`
		}{Status: "created"})
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/inventory/allocations/{id}
func (h *InventoryAllocationHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateInventoryAllocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("inventory_allocations").
		Update(req, "", "").
		Eq("alloc_id", id).
		Execute()
	if err != nil {
		log.Printf("[배정 수정 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "배정 수정에 실패했습니다")
		return
	}

	var updated []model.InventoryAllocation
	if err := json.Unmarshal(data, &updated); err != nil || len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 배정을 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/inventory/allocations/{id}
func (h *InventoryAllocationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, _, err := h.DB.From("inventory_allocations").
		Delete("", "").
		Eq("alloc_id", id).
		Execute()
	if err != nil {
		log.Printf("[배정 삭제 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "배정 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
