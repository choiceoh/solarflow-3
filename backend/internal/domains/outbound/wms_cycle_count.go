package outbound

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

// CycleCountHandler — D-142 WMS Phase 4 정기 재고실사 (cycle counting).
//
// 비유: "분기 재고실사 일지" — 위치 단위 실측 → 시스템 vs 실재고 차이 추적.
// status: pending → in_progress → completed (또는 cancelled).
type CycleCountHandler struct {
	DB *supa.Client
}

func NewCycleCountHandler(db *supa.Client) *CycleCountHandler {
	return &CycleCountHandler{DB: db}
}

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDTxCycleCount,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewCycleCountHandler(d.DB)
			g := d.Gates
			r.Route("/cycle-counts", func(r chi.Router) {
				r.Use(g.Feature(feature.IDTxCycleCount))
				r.Get("/", h.List)
				r.Get("/{id}", h.GetByID)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Patch("/{id}", h.UpdateHeader)
				r.With(g.Write).Post("/{id}/seed", h.SeedItems)
				r.With(g.Write).Post("/{id}/complete", h.Complete)
				r.With(g.Write).Patch("/{id}/items/{item_id}", h.UpdateItem)
			})
		},
	})
}

type CycleCount struct {
	CycleCountID      string     `json:"cycle_count_id"`
	WarehouseID       string     `json:"warehouse_id"`
	ScheduledDate     string     `json:"scheduled_date"`
	Status            string     `json:"status"`
	StartedAt         *time.Time `json:"started_at,omitempty"`
	CompletedAt       *time.Time `json:"completed_at,omitempty"`
	TotalLocations    *int       `json:"total_locations,omitempty"`
	MatchedLocations  *int       `json:"matched_locations,omitempty"`
	VarianceLocations *int       `json:"variance_locations,omitempty"`
	AccuracyPct       *float64   `json:"accuracy_pct,omitempty"`
	CreatedBy         *string    `json:"created_by,omitempty"`
	CreatedAt         *time.Time `json:"created_at,omitempty"`
	Notes             *string    `json:"notes,omitempty"`
}

type CycleCountItem struct {
	ItemID               string     `json:"item_id"`
	CycleCountID         string     `json:"cycle_count_id"`
	LocationID           *string    `json:"location_id,omitempty"`
	LocationCodeSnapshot *string    `json:"location_code_snapshot,omitempty"`
	ProductID            *string    `json:"product_id,omitempty"`
	ProductCodeSnapshot  *string    `json:"product_code_snapshot,omitempty"`
	ProductNameSnapshot  *string    `json:"product_name_snapshot,omitempty"`
	ExpectedQty          int        `json:"expected_qty"`
	CountedQty           *int       `json:"counted_qty,omitempty"`
	VarianceQty          int        `json:"variance_qty"` // GENERATED
	VarianceReason       *string    `json:"variance_reason,omitempty"`
	VarianceNote         *string    `json:"variance_note,omitempty"`
	CountedBy            *string    `json:"counted_by,omitempty"`
	CountedAt            *time.Time `json:"counted_at,omitempty"`
	PhotoAttachmentIDs   []string   `json:"photo_attachment_ids,omitempty"`
}

type CreateCycleCountRequest struct {
	WarehouseID   string  `json:"warehouse_id"`
	ScheduledDate string  `json:"scheduled_date"`
	Notes         *string `json:"notes,omitempty"`
}

func (req *CreateCycleCountRequest) Validate() string {
	if req.WarehouseID == "" {
		return "warehouse_id는 필수입니다"
	}
	if req.ScheduledDate == "" {
		return "scheduled_date는 필수입니다"
	}
	return ""
}

type UpdateCycleCountItemRequest struct {
	CountedQty         *int     `json:"counted_qty,omitempty"`
	VarianceReason     *string  `json:"variance_reason,omitempty"`
	VarianceNote       *string  `json:"variance_note,omitempty"`
	PhotoAttachmentIDs []string `json:"photo_attachment_ids,omitempty"`
}

// List — GET /api/v1/cycle-counts?status=&warehouse_id=
func (h *CycleCountHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("cycle_counts").Select("*", "exact", false)
	if st := r.URL.Query().Get("status"); st != "" {
		q = q.Eq("status", st)
	}
	if wid := r.URL.Query().Get("warehouse_id"); wid != "" {
		q = q.Eq("warehouse_id", wid)
	}
	data, _, err := q.
		Order("scheduled_date", &postgrest.OrderOpts{Ascending: false}).
		Limit(50, "").
		Execute()
	if err != nil {
		log.Printf("[cycle count 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "재고실사 목록 조회 실패")
		return
	}
	var rows []CycleCount
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// GetByID — GET /api/v1/cycle-counts/{id} (헤더 + 라인)
func (h *CycleCountHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	hdrData, _, err := h.DB.From("cycle_counts").
		Select("*", "exact", false).
		Eq("cycle_count_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "조회 실패")
		return
	}
	var hdrs []CycleCount
	if err := json.Unmarshal(hdrData, &hdrs); err != nil || len(hdrs) == 0 {
		response.RespondError(w, http.StatusNotFound, "재고실사 세션을 찾을 수 없습니다")
		return
	}
	itemsData, _, _ := h.DB.From("cycle_count_items").
		Select("*", "exact", false).
		Eq("cycle_count_id", id).
		Order("location_code_snapshot", &postgrest.OrderOpts{Ascending: true, NullsFirst: false}).
		Execute()
	var items []CycleCountItem
	_ = json.Unmarshal(itemsData, &items)
	if items == nil {
		items = []CycleCountItem{}
	}
	response.RespondJSON(w, http.StatusOK, map[string]any{
		"cycle_count": hdrs[0],
		"items":       items,
	})
}

// Create — POST /api/v1/cycle-counts
//
// 세션 생성. 라인은 별도 endpoint (`/seed`) 또는 수동 POST /items 로 채움 — 본 PR 은 헤더만.
// PR8.7b 분리: inventory_allocations 스냅샷 자동 → cycle_count_items 자동 생성.
func (h *CycleCountHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateCycleCountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	uid := middleware.GetUserID(r.Context())
	insert := map[string]any{
		"warehouse_id":   req.WarehouseID,
		"scheduled_date": req.ScheduledDate,
		"status":         "pending",
		"created_by":     uid,
	}
	if req.Notes != nil {
		insert["notes"] = *req.Notes
	}
	data, _, err := h.DB.From("cycle_counts").
		Insert(insert, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[cycle count 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "재고실사 등록 실패 (마이그 088 미적용?)")
		return
	}
	var created []CycleCount
	if err := json.Unmarshal(data, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Complete — POST /api/v1/cycle-counts/{id}/complete
//
// 세션 종료 — 정확도 자동 집계. PR8.7c 에서 inventory_allocations 자동 보정 (variance 큰 라인만).
func (h *CycleCountHandler) Complete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	// 라인 집계
	itemsData, _, ierr := h.DB.From("cycle_count_items").
		Select("counted_qty,variance_qty", "exact", false).
		Eq("cycle_count_id", id).
		Execute()
	if ierr != nil {
		response.RespondError(w, http.StatusInternalServerError, "라인 조회 실패")
		return
	}
	var items []struct {
		CountedQty  *int `json:"counted_qty"`
		VarianceQty int  `json:"variance_qty"`
	}
	if err := json.Unmarshal(itemsData, &items); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	total := len(items)
	matched := 0
	variance := 0
	for _, it := range items {
		if it.CountedQty == nil {
			continue
		}
		if it.VarianceQty == 0 {
			matched++
		} else {
			variance++
		}
	}
	accuracy := 0.0
	if total > 0 {
		accuracy = float64(matched) / float64(total) * 100
	}
	now := time.Now().UTC().Format(time.RFC3339)
	upd := map[string]any{
		"status":             "completed",
		"completed_at":       now,
		"total_locations":    total,
		"matched_locations":  matched,
		"variance_locations": variance,
		"accuracy_pct":       accuracy,
	}
	_, _, err := h.DB.From("cycle_counts").
		Update(upd, "", "").Eq("cycle_count_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "완료 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]any{
		"status":             "completed",
		"total_locations":    total,
		"matched_locations":  matched,
		"variance_locations": variance,
		"accuracy_pct":       accuracy,
	})
}

// UpdateItem — PATCH /api/v1/cycle-counts/{id}/items/{item_id}
func (h *CycleCountHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "item_id")
	var req UpdateCycleCountItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	upd := map[string]any{}
	if req.CountedQty != nil {
		if *req.CountedQty < 0 {
			response.RespondError(w, http.StatusBadRequest, "counted_qty는 0 이상이어야 합니다")
			return
		}
		upd["counted_qty"] = *req.CountedQty
		now := time.Now().UTC().Format(time.RFC3339)
		upd["counted_at"] = now
		uid := middleware.GetUserID(r.Context())
		if uid != "" {
			upd["counted_by"] = uid
		}
	}
	if req.VarianceReason != nil {
		switch *req.VarianceReason {
		case "shrinkage", "damage", "wrong_location", "system_error", "other":
			upd["variance_reason"] = *req.VarianceReason
		default:
			response.RespondError(w, http.StatusBadRequest,
				"variance_reason은 shrinkage/damage/wrong_location/system_error/other 중 하나")
			return
		}
	}
	if req.VarianceNote != nil {
		upd["variance_note"] = *req.VarianceNote
	}
	if len(req.PhotoAttachmentIDs) > 0 {
		upd["photo_attachment_ids"] = req.PhotoAttachmentIDs
	}
	if len(upd) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수정할 필드가 없습니다")
		return
	}
	_, _, err := h.DB.From("cycle_count_items").
		Update(upd, "", "").Eq("item_id", itemID).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "라인 수정 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
