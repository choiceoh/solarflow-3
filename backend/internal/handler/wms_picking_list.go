package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// PickingListHandler — D-140 WMS Phase 2 피킹 명세 CRUD + picked 토글.
//
// 비유: "창고 작업 지시서 발급/관리". 출고/배차에 묶여 위치별 수량을 명세 + 작업자가
// 폰/태블릿으로 toggle 하면 picked_at 자동 기록.
type PickingListHandler struct {
	DB *supa.Client
}

func NewPickingListHandler(db *supa.Client) *PickingListHandler {
	return &PickingListHandler{DB: db}
}

// PickingListWithItems — 응답 합본.
type PickingListWithItems struct {
	model.PickingList
	Items []model.PickingListItem `json:"items"`
}

// List — GET /api/v1/picking-lists?status=pending&warehouse_id=&mine=true
func (h *PickingListHandler) List(w http.ResponseWriter, r *http.Request) {
	q := h.DB.From("picking_lists").Select("*", "exact", false)
	if st := r.URL.Query().Get("status"); st != "" {
		q = q.Eq("status", st)
	}
	if wid := r.URL.Query().Get("warehouse_id"); wid != "" {
		q = q.Eq("warehouse_id", wid)
	}
	if r.URL.Query().Get("mine") == "true" {
		uid := middleware.GetUserID(r.Context())
		if uid != "" {
			q = q.Eq("picker_user_id", uid)
		}
	}
	data, _, err := q.
		Order("created_at", &postgrest.OrderOpts{Ascending: false, NullsFirst: false}).
		Limit(200, "").
		Execute()
	if err != nil {
		log.Printf("[picking 목록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "피킹 명세 목록 조회 실패")
		return
	}
	var rows []model.PickingList
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, rows)
}

// GetByID — GET /api/v1/picking-lists/{id} (헤더 + 라인 묶음)
func (h *PickingListHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	hdrData, _, err := h.DB.From("picking_lists").
		Select("*", "exact", false).
		Eq("picking_list_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "조회 실패")
		return
	}
	var hdrs []model.PickingList
	if err := json.Unmarshal(hdrData, &hdrs); err != nil || len(hdrs) == 0 {
		response.RespondError(w, http.StatusNotFound, "피킹 명세를 찾을 수 없습니다")
		return
	}
	itemsData, _, _ := h.DB.From("picking_list_items").
		Select("*", "exact", false).
		Eq("picking_list_id", id).
		Order("line_no", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	var items []model.PickingListItem
	_ = json.Unmarshal(itemsData, &items)
	if items == nil {
		items = []model.PickingListItem{}
	}
	response.RespondJSON(w, http.StatusOK, PickingListWithItems{PickingList: hdrs[0], Items: items})
}

// Create — POST /api/v1/picking-lists
func (h *PickingListHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreatePickingListRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	uid := middleware.GetUserID(r.Context())

	hdrInsert := map[string]any{
		"warehouse_id": req.WarehouseID,
		"created_by":   uid,
		"status":       "pending",
	}
	if req.OutboundID != nil {
		hdrInsert["outbound_id"] = *req.OutboundID
	}
	if req.DispatchRouteID != nil {
		hdrInsert["dispatch_route_id"] = *req.DispatchRouteID
	}
	if req.PartnerID != nil {
		hdrInsert["partner_id"] = *req.PartnerID
	}
	if req.PartnerNameSnapshot != nil {
		hdrInsert["partner_name_snapshot"] = *req.PartnerNameSnapshot
	}
	if req.PickerUserID != nil {
		hdrInsert["picker_user_id"] = *req.PickerUserID
	}
	if req.Notes != nil {
		hdrInsert["notes"] = *req.Notes
	}

	hdrData, _, err := h.DB.From("picking_lists").
		Insert(hdrInsert, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[picking 헤더 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "피킹 명세 등록 실패 (마이그 086 미적용?)")
		return
	}
	var created []model.PickingList
	if err := json.Unmarshal(hdrData, &created); err != nil || len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	listID := created[0].PickingListID

	// 라인 일괄 INSERT
	itemRows := make([]map[string]any, 0, len(req.Items))
	for i, it := range req.Items {
		row := map[string]any{
			"picking_list_id":  listID,
			"line_no":          i + 1,
			"quantity_planned": it.QuantityPlanned,
		}
		if it.ProductID != nil {
			row["product_id"] = *it.ProductID
		}
		if it.ProductCodeSnapshot != nil {
			row["product_code_snapshot"] = *it.ProductCodeSnapshot
		}
		if it.ProductNameSnapshot != nil {
			row["product_name_snapshot"] = *it.ProductNameSnapshot
		}
		if it.SpecWpSnapshot != nil {
			row["spec_wp_snapshot"] = *it.SpecWpSnapshot
		}
		if it.LocationID != nil {
			row["location_id"] = *it.LocationID
		}
		if it.LocationCodeSnapshot != nil {
			row["location_code_snapshot"] = *it.LocationCodeSnapshot
		}
		itemRows = append(itemRows, row)
	}
	if _, _, ierr := h.DB.From("picking_list_items").
		Insert(itemRows, false, "", "", "").Execute(); ierr != nil {
		log.Printf("[picking 라인 등록 실패] list=%s err=%v", listID, ierr)
		response.RespondError(w, http.StatusPartialContent,
			"헤더는 저장됐으나 라인 저장 실패: "+ierr.Error())
		return
	}
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// UpdateHeader — PATCH /api/v1/picking-lists/{id}
func (h *PickingListHandler) UpdateHeader(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req model.UpdatePickingListRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	upd := map[string]any{}
	if req.Status != nil {
		switch *req.Status {
		case "pending", "in_progress", "completed", "cancelled":
			upd["status"] = *req.Status
			now := time.Now().UTC().Format(time.RFC3339)
			if *req.Status == "in_progress" {
				upd["started_at"] = now
			}
			if *req.Status == "completed" {
				upd["completed_at"] = now
			}
		default:
			response.RespondError(w, http.StatusBadRequest,
				"status는 pending/in_progress/completed/cancelled 중 하나여야 합니다")
			return
		}
	}
	if req.PickerUserID != nil {
		upd["picker_user_id"] = *req.PickerUserID
	}
	if req.Notes != nil {
		upd["notes"] = *req.Notes
	}
	if len(upd) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수정할 필드가 없습니다")
		return
	}
	_, _, err := h.DB.From("picking_lists").
		Update(upd, "", "").Eq("picking_list_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "수정 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// UpdateItem — PATCH /api/v1/picking-lists/{id}/items/{item_id}
//
// 작업자가 라인 picked 토글 + picked_qty + 차이 사유 입력. picked_at 자동 기록.
func (h *PickingListHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "item_id")
	var req model.UpdatePickingListItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	upd := map[string]any{}
	if req.QuantityPicked != nil {
		if *req.QuantityPicked < 0 {
			response.RespondError(w, http.StatusBadRequest, "quantity_picked는 0 이상이어야 합니다")
			return
		}
		upd["quantity_picked"] = *req.QuantityPicked
	}
	if req.IsPicked != nil {
		upd["is_picked"] = *req.IsPicked
		if *req.IsPicked {
			now := time.Now().UTC().Format(time.RFC3339)
			upd["picked_at"] = now
			uid := middleware.GetUserID(r.Context())
			if uid != "" {
				upd["picked_by"] = uid
			}
		} else {
			upd["picked_at"] = nil
			upd["picked_by"] = nil
		}
	}
	if req.VarianceNote != nil {
		upd["variance_note"] = *req.VarianceNote
	}
	if len(upd) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수정할 필드가 없습니다")
		return
	}
	_, _, err := h.DB.From("picking_list_items").
		Update(upd, "", "").Eq("item_id", itemID).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "라인 수정 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Summary — GET /api/v1/picking-lists/summary
//
// 사이드바 메뉴 카운트 / 운영 KPI 용 status 별 집계.
// 응답: { pending_count, in_progress_count, open_count } — open_count = pending + in_progress.
//
// 단순 list 후 client 가 세는 대신 별도 endpoint 로 분리한 이유:
//   - list 는 최근 200 건 limit + 라인 묶음용이라 카운트 용도로 부정확
//   - 사이드바가 5분마다 호출하는 hot path 라 가벼운 SELECT 가 좋음
func (h *PickingListHandler) Summary(w http.ResponseWriter, r *http.Request) {
	type row struct {
		Status string `json:"status"`
	}
	data, _, err := h.DB.From("picking_lists").
		Select("status", "exact", false).
		In("status", []string{"pending", "in_progress"}).
		Execute()
	if err != nil {
		log.Printf("[picking summary 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "피킹 카운트 조회 실패")
		return
	}
	var rows []row
	if err := json.Unmarshal(data, &rows); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	pending, inProgress := 0, 0
	for _, r := range rows {
		switch r.Status {
		case "pending":
			pending++
		case "in_progress":
			inProgress++
		}
	}
	response.RespondJSON(w, http.StatusOK, map[string]int{
		"pending_count":     pending,
		"in_progress_count": inProgress,
		"open_count":        pending + inProgress,
	})
}

// Delete — DELETE /api/v1/picking-lists/{id} (cancelled 처리 권장 — soft)
func (h *PickingListHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	_, _, err := h.DB.From("picking_lists").
		Delete("", "").Eq("picking_list_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "삭제 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
