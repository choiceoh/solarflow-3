package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// WarehouseLocationHandler — D-139 WMS Phase 1: 창고 내 위치 CRUD.
//
// 비유: "창고 안 우편번호 발급/관리 창구".
// Zone > Aisle > Rack > Bin 4단계 트리. unique(warehouse_id, location_code).
type WarehouseLocationHandler struct {
	DB *supa.Client
}

func NewWarehouseLocationHandler(db *supa.Client) *WarehouseLocationHandler {
	return &WarehouseLocationHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDMasterWarehouseLocation,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewWarehouseLocationHandler(d.DB)
			g := d.Gates
			r.Route("/warehouse-locations", func(r chi.Router) {
				r.Use(g.Feature(feature.IDMasterWarehouseLocation))
				r.Get("/", h.List)
				r.Get("/{id}", h.GetByID)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Put("/{id}", h.Update)
				r.With(g.Write).Patch("/{id}", h.Update)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
		},
	})
}

// List — GET /api/v1/warehouse-locations?warehouse_id=&active_only=true
func (h *WarehouseLocationHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("warehouse_locations").Select("*", "exact", false)
	if wid := r.URL.Query().Get("warehouse_id"); wid != "" {
		q = q.Eq("warehouse_id", wid)
	}
	if r.URL.Query().Get("active_only") == "true" {
		q = q.Eq("is_active", "true")
	}
	data, _, err := q.
		Order("warehouse_id", &postgrest.OrderOpts{Ascending: true}).
		Order("location_code", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	if err != nil {
		log.Printf("[location 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "위치 목록 조회 실패")
		return
	}
	var rows []model.WarehouseLocation
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// GetByID — GET /api/v1/warehouse-locations/{id}
func (h *WarehouseLocationHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	data, _, err := h.DB.From("warehouse_locations").
		Select("*", "exact", false).
		Eq("location_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "위치 조회 실패")
		return
	}
	var rows []model.WarehouseLocation
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "위치를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows[0])
}

// Create — POST /api/v1/warehouse-locations
func (h *WarehouseLocationHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateWarehouseLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	insert := map[string]any{
		"warehouse_id":  req.WarehouseID,
		"location_code": req.LocationCode,
	}
	if req.Zone != nil {
		insert["zone"] = *req.Zone
	}
	if req.Aisle != nil {
		insert["aisle"] = *req.Aisle
	}
	if req.Rack != nil {
		insert["rack"] = *req.Rack
	}
	if req.Bin != nil {
		insert["bin"] = *req.Bin
	}
	if req.CapacityQty != nil {
		insert["capacity_qty"] = *req.CapacityQty
	}
	if req.WeightCapacityKg != nil {
		insert["weight_capacity_kg"] = *req.WeightCapacityKg
	}
	if req.LocationType != nil {
		insert["location_type"] = *req.LocationType
	}
	if req.Notes != nil {
		insert["notes"] = *req.Notes
	}
	data, _, err := h.DB.From("warehouse_locations").
		Insert(insert, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[location 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError,
			"위치 등록 실패 — 같은 창고에 동일 location_code 가 이미 있거나 마이그 085 미적용")
		return
	}
	var created []model.WarehouseLocation
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT/PATCH /api/v1/warehouse-locations/{id}
func (h *WarehouseLocationHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdateWarehouseLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	upd := map[string]any{}
	if req.LocationCode != nil {
		upd["location_code"] = *req.LocationCode
	}
	if req.Zone != nil {
		upd["zone"] = *req.Zone
	}
	if req.Aisle != nil {
		upd["aisle"] = *req.Aisle
	}
	if req.Rack != nil {
		upd["rack"] = *req.Rack
	}
	if req.Bin != nil {
		upd["bin"] = *req.Bin
	}
	if req.CapacityQty != nil {
		upd["capacity_qty"] = *req.CapacityQty
	}
	if req.WeightCapacityKg != nil {
		upd["weight_capacity_kg"] = *req.WeightCapacityKg
	}
	if req.LocationType != nil {
		switch *req.LocationType {
		case "storage", "staging", "receiving", "shipping", "damaged", "reserved":
			upd["location_type"] = *req.LocationType
		default:
			response.RespondError(w, http.StatusBadRequest, "location_type 값이 잘못됐습니다")
			return
		}
	}
	if req.Notes != nil {
		upd["notes"] = *req.Notes
	}
	if req.IsActive != nil {
		upd["is_active"] = *req.IsActive
	}
	if len(upd) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수정할 필드가 없습니다")
		return
	}
	data, _, err := h.DB.From("warehouse_locations").
		Update(upd, "", "").Eq("location_id", id).Execute()
	if err != nil {
		log.Printf("[location 수정 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "위치 수정 실패")
		return
	}
	var updated []model.WarehouseLocation
	if err := json.Unmarshal(data, &updated); err != nil || len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 위치를 찾을 수 없습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/warehouse-locations/{id}
func (h *WarehouseLocationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("warehouse_locations").
		Delete("", "").Eq("location_id", id).Execute()
	if err != nil {
		log.Printf("[location 삭제 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError,
			"위치 삭제 실패 — 재고 배정에 사용 중일 수 있음 (FK 제약). is_active=false 로 비활성화 권장")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
