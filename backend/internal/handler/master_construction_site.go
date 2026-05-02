package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// ConstructionSiteHandler — 공사 현장 마스터 API
// 비유: "공사 현장 대장" — 자체/EPC 현장 정보와 공급 이력을 관리
type ConstructionSiteHandler struct {
	DB *supa.Client
}

func NewConstructionSiteHandler(db *supa.Client) *ConstructionSiteHandler {
	return &ConstructionSiteHandler{DB: db}
}

// List — GET /api/v1/construction-sites
// ?company_id=xxx  &site_type=own|epc  &is_active=true  &q=검색어
func (h *ConstructionSiteHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("construction_sites").
		Select("*", "exact", false)

	if cid := r.URL.Query().Get("company_id"); cid != "" && cid != "all" {
		q = q.Eq("company_id", cid)
	}
	if st := r.URL.Query().Get("site_type"); st != "" {
		q = q.Eq("site_type", st)
	}
	if ia := r.URL.Query().Get("is_active"); ia != "" {
		q = q.Eq("is_active", ia)
	}
	if search := r.URL.Query().Get("q"); search != "" {
		// 발전소명 또는 지명에서 대소문자 무시 부분 일치 검색
		q = q.Or(fmt.Sprintf("name.ilike.*%s*,location.ilike.*%s*", search, search), "")
	}

	data, _, err := q.Execute()
	if err != nil {
		log.Printf("[현장 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "현장 목록 조회에 실패했습니다")
		return
	}

	var items []model.ConstructionSite
	if err := json.Unmarshal(data, &items); err != nil {
		log.Printf("[현장 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, items)
}

// GetByID — GET /api/v1/construction-sites/{id}
// 현장 정보 + 해당 현장에 배정된 가용재고 이력 함께 반환
func (h *ConstructionSiteHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 1. 현장 마스터 조회
	siteData, _, err := h.DB.From("construction_sites").
		Select("*", "exact", false).
		Eq("site_id", id).
		Execute()
	if err != nil {
		log.Printf("[현장 상세 조회 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "현장 조회에 실패했습니다")
		return
	}

	var sites []model.ConstructionSite
	if err := json.Unmarshal(siteData, &sites); err != nil || len(sites) == 0 {
		response.RespondError(w, http.StatusNotFound, "현장을 찾을 수 없습니다")
		return
	}

	// 2. 해당 현장에 연결된 배정 이력 조회
	allocData, _, err := h.DB.From("inventory_allocations").
		Select("*", "exact", false).
		Eq("site_id", id).
		Execute()
	if err != nil {
		log.Printf("[현장 배정 이력 조회 실패] site_id=%s, %v", id, err)
		// 이력 조회 실패 시에도 현장 정보는 반환 (부분 응답)
		response.RespondJSON(w, http.StatusOK, struct {
			Site        model.ConstructionSite          `json:"site"`
			Allocations []model.InventoryAllocation     `json:"allocations"`
		}{
			Site:        sites[0],
			Allocations: []model.InventoryAllocation{},
		})
		return
	}

	var allocs []model.InventoryAllocation
	if err := json.Unmarshal(allocData, &allocs); err != nil {
		allocs = []model.InventoryAllocation{}
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Site        model.ConstructionSite          `json:"site"`
		Allocations []model.InventoryAllocation     `json:"allocations"`
	}{
		Site:        sites[0],
		Allocations: allocs,
	})
}

// Create — POST /api/v1/construction-sites
func (h *ConstructionSiteHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateConstructionSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("construction_sites").
		Insert(req, false, "", "representation", "").
		Execute()
	if err != nil {
		log.Printf("[현장 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "현장 등록에 실패했습니다")
		return
	}

	var created []model.ConstructionSite
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		log.Printf("[현장 등록 응답 파싱 주의] data=%s err=%v", string(data), err)
		response.RespondJSON(w, http.StatusCreated, struct{ Status string `json:"status"` }{Status: "created"})
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/construction-sites/{id}
func (h *ConstructionSiteHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req model.UpdateConstructionSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	data, _, err := h.DB.From("construction_sites").
		Update(req, "", "").
		Eq("site_id", id).
		Execute()
	if err != nil {
		log.Printf("[현장 수정 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "현장 수정에 실패했습니다")
		return
	}

	var updated []model.ConstructionSite
	if err := json.Unmarshal(data, &updated); err != nil || len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 현장을 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/construction-sites/{id} — 현장 삭제
// 비유: 공사 현장 대장에서 현장을 완전히 제거하는 것
func (h *ConstructionSiteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("construction_sites").
		Delete("", "").
		Eq("site_id", id).
		Execute()
	if err != nil {
		log.Printf("[현장 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "현장 삭제에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "deleted"})
}

// ToggleActive — PATCH /api/v1/construction-sites/{id}/status
func (h *ConstructionSiteHandler) ToggleActive(w http.ResponseWriter, r *http.Request) {
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

	_, _, err := h.DB.From("construction_sites").
		Update(req, "", "").
		Eq("site_id", id).
		Execute()
	if err != nil {
		log.Printf("[현장 상태 변경 실패] id=%s, %v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "현장 상태 변경에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, struct{ Status string `json:"status"` }{Status: "ok"})
}
