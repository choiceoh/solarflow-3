package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

const (
	wmsAutoPickingNote = "자동 생성: 출고 등록 시 WMS 피킹 명세 생성"
	wmsCycleSeedLimit  = 5000
)

type wmsProductSnapshot struct {
	ProductID   string   `json:"product_id"`
	ProductCode *string  `json:"product_code"`
	ProductName *string  `json:"product_name"`
	SpecWP      *float64 `json:"spec_wp"`
}

type wmsLocationSnapshot struct {
	LocationID   string `json:"location_id"`
	WarehouseID  string `json:"warehouse_id"`
	LocationCode string `json:"location_code"`
	LocationType string `json:"location_type"`
	IsActive     bool   `json:"is_active"`
}

type wmsMovementRow struct {
	ProductID    string  `json:"product_id"`
	LocationCode *string `json:"location_code"`
	EndingQty    *int    `json:"ending_qty"`
	MovementDate string  `json:"movement_date"`
}

type wmsAllocationRow struct {
	AllocID    string  `json:"alloc_id"`
	ProductID  string  `json:"product_id"`
	Quantity   int     `json:"quantity"`
	Status     string  `json:"status"`
	SourceType string  `json:"source_type"`
	LocationID *string `json:"location_id,omitempty"`
	OutboundID *string `json:"outbound_id,omitempty"`
	OrderID    *string `json:"order_id,omitempty"`
}

type wmsPickingListRow struct {
	PickingListID string `json:"picking_list_id"`
}

type wmsIntercompanyRequestRow struct {
	RequestID  string  `json:"request_id"`
	ProductID  string  `json:"product_id"`
	Quantity   int     `json:"quantity"`
	OutboundID *string `json:"outbound_id,omitempty"`
}

type wmsPickingPlanItem struct {
	ProductID       string
	ProductCode     *string
	ProductName     *string
	SpecWP          *int
	LocationID      *string
	LocationCode    *string
	QuantityPlanned int
}

func specWPFromProduct(p wmsProductSnapshot) *int {
	if p.SpecWP == nil {
		return nil
	}
	spec := int(*p.SpecWP)
	return &spec
}

func (h *OutboundHandler) ensurePickingListForOutbound(ob model.Outbound) error {
	if ob.Status != "active" || ob.OutboundID == "" || ob.WarehouseID == "" || ob.ProductID == "" || ob.Quantity <= 0 {
		return nil
	}

	data, count, err := h.DB.From("picking_lists").
		Select("picking_list_id", "exact", false).
		Eq("outbound_id", ob.OutboundID).
		Range(0, 0, "").
		Execute()
	if err != nil {
		return fmt.Errorf("기존 피킹 명세 확인 실패: %w", err)
	}
	var existing []wmsPickingListRow
	if count > 0 {
		if err := json.Unmarshal(data, &existing); err != nil || len(existing) == 0 || existing[0].PickingListID == "" {
			return fmt.Errorf("기존 피킹 명세 응답 처리 실패")
		}
		hasItems, err := h.pickingListHasItems(existing[0].PickingListID)
		if err != nil {
			return err
		}
		if hasItems {
			return nil
		}
	}

	plan, err := h.buildPickingPlan(ob)
	if err != nil {
		return err
	}
	if len(plan) == 0 {
		product, _ := h.productSnapshot(ob.ProductID)
		plan = []wmsPickingPlanItem{{
			ProductID:       ob.ProductID,
			ProductCode:     product.ProductCode,
			ProductName:     product.ProductName,
			SpecWP:          specWPFromProduct(product),
			QuantityPlanned: ob.Quantity,
		}}
	}

	partnerName := ob.CustomerName
	if partnerName == nil || *partnerName == "" {
		partnerName = ob.SiteName
	}
	hdrInsert := map[string]any{
		"outbound_id":  ob.OutboundID,
		"warehouse_id": ob.WarehouseID,
		"status":       "pending",
		"notes":        wmsAutoPickingNote,
	}
	if partnerName != nil && *partnerName != "" {
		hdrInsert["partner_name_snapshot"] = *partnerName
	}
	if ob.CustomerID != nil && *ob.CustomerID != "" {
		hdrInsert["partner_id"] = *ob.CustomerID
	}

	pickingListID := ""
	if len(existing) > 0 {
		pickingListID = existing[0].PickingListID
	} else {
		hdrData, _, err := h.DB.From("picking_lists").
			Insert(hdrInsert, false, "", "", "").Execute()
		if err != nil {
			return fmt.Errorf("피킹 명세 헤더 자동 생성 실패: %w", err)
		}
		var created []model.PickingList
		if err := json.Unmarshal(hdrData, &created); err != nil || len(created) == 0 {
			return fmt.Errorf("피킹 명세 헤더 응답 처리 실패")
		}
		pickingListID = created[0].PickingListID
	}

	rows := make([]map[string]any, 0, len(plan))
	for i, item := range plan {
		row := map[string]any{
			"picking_list_id":  pickingListID,
			"line_no":          i + 1,
			"product_id":       item.ProductID,
			"quantity_planned": item.QuantityPlanned,
		}
		if item.ProductCode != nil && *item.ProductCode != "" {
			row["product_code_snapshot"] = *item.ProductCode
		}
		if item.ProductName != nil && *item.ProductName != "" {
			row["product_name_snapshot"] = *item.ProductName
		}
		if item.SpecWP != nil {
			row["spec_wp_snapshot"] = *item.SpecWP
		}
		if item.LocationID != nil && *item.LocationID != "" {
			row["location_id"] = *item.LocationID
		}
		if item.LocationCode != nil && *item.LocationCode != "" {
			row["location_code_snapshot"] = *item.LocationCode
		}
		rows = append(rows, row)
	}
	if _, _, err := h.DB.From("picking_list_items").
		Insert(rows, false, "", "", "").Execute(); err != nil {
		return fmt.Errorf("피킹 명세 라인 자동 생성 실패: %w", err)
	}
	return nil
}

func (h *OutboundHandler) pickingListHasItems(pickingListID string) (bool, error) {
	_, count, err := h.DB.From("picking_list_items").
		Select("item_id", "exact", true).
		Eq("picking_list_id", pickingListID).
		Range(0, 0, "").
		Execute()
	if err != nil {
		return false, fmt.Errorf("기존 피킹 명세 라인 확인 실패: %w", err)
	}
	return count > 0, nil
}

func (h *OutboundHandler) buildPickingPlan(ob model.Outbound) ([]wmsPickingPlanItem, error) {
	product, err := h.productSnapshot(ob.ProductID)
	if err != nil {
		return nil, err
	}
	locationByCode, locationByID := h.locationMaps(ob.WarehouseID)

	if items, err := h.planFromInventoryMovements(ob, product, locationByCode); err == nil && len(items) > 0 {
		return items, nil
	} else if err != nil {
		log.Printf("[WMS 피킹 자동 생성] ERP 수불 기반 위치 추출 실패 outbound=%s err=%v", ob.OutboundID, err)
	}

	if items, err := h.planFromAllocations(ob, product, locationByID); err == nil && len(items) > 0 {
		return items, nil
	} else if err != nil {
		log.Printf("[WMS 피킹 자동 생성] 배정 기반 위치 추출 실패 outbound=%s err=%v", ob.OutboundID, err)
	}
	return nil, nil
}

func (h *OutboundHandler) productSnapshot(productID string) (wmsProductSnapshot, error) {
	data, _, err := h.DB.From("products").
		Select("product_id, product_code, product_name, spec_wp", "exact", false).
		Eq("product_id", productID).
		Execute()
	if err != nil {
		return wmsProductSnapshot{}, err
	}
	var rows []wmsProductSnapshot
	if err := json.Unmarshal(data, &rows); err != nil {
		return wmsProductSnapshot{}, err
	}
	if len(rows) == 0 {
		return wmsProductSnapshot{ProductID: productID}, nil
	}
	return rows[0], nil
}

func (h *OutboundHandler) locationMaps(warehouseID string) (map[string]wmsLocationSnapshot, map[string]wmsLocationSnapshot) {
	data, _, err := h.DB.From("warehouse_locations").
		Select("location_id, warehouse_id, location_code, location_type, is_active", "exact", false).
		Eq("warehouse_id", warehouseID).
		Eq("is_active", "true").
		Execute()
	if err != nil {
		return map[string]wmsLocationSnapshot{}, map[string]wmsLocationSnapshot{}
	}
	var rows []wmsLocationSnapshot
	if err := json.Unmarshal(data, &rows); err != nil {
		return map[string]wmsLocationSnapshot{}, map[string]wmsLocationSnapshot{}
	}
	byCode := make(map[string]wmsLocationSnapshot, len(rows))
	byID := make(map[string]wmsLocationSnapshot, len(rows))
	for _, row := range rows {
		byCode[row.LocationCode] = row
		byID[row.LocationID] = row
	}
	return byCode, byID
}

func (h *OutboundHandler) planFromInventoryMovements(ob model.Outbound, product wmsProductSnapshot, locationByCode map[string]wmsLocationSnapshot) ([]wmsPickingPlanItem, error) {
	data, _, err := h.DB.From("inventory_movements").
		Select("product_id, location_code, ending_qty, movement_date", "exact", false).
		Eq("warehouse_id", ob.WarehouseID).
		Eq("product_id", ob.ProductID).
		Not("location_code", "is", "null").
		Order("movement_date", &postgrest.OrderOpts{Ascending: false, NullsFirst: false}).
		Limit(200, "").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []wmsMovementRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}

	remaining := ob.Quantity
	seen := map[string]bool{}
	items := []wmsPickingPlanItem{}
	for _, row := range rows {
		if remaining <= 0 {
			break
		}
		if row.LocationCode == nil || *row.LocationCode == "" || seen[*row.LocationCode] {
			continue
		}
		seen[*row.LocationCode] = true
		if row.EndingQty == nil || *row.EndingQty <= 0 {
			continue
		}
		qty := *row.EndingQty
		if qty > remaining {
			qty = remaining
		}
		locationCode := *row.LocationCode
		var locationID *string
		if loc, ok := locationByCode[locationCode]; ok {
			locationID = &loc.LocationID
		}
		items = append(items, wmsPickingPlanItem{
			ProductID:       ob.ProductID,
			ProductCode:     product.ProductCode,
			ProductName:     product.ProductName,
			SpecWP:          specWPFromProduct(product),
			LocationID:      locationID,
			LocationCode:    &locationCode,
			QuantityPlanned: qty,
		})
		remaining -= qty
	}
	if remaining > 0 && len(items) > 0 {
		items = append(items, wmsPickingPlanItem{
			ProductID:       ob.ProductID,
			ProductCode:     product.ProductCode,
			ProductName:     product.ProductName,
			SpecWP:          specWPFromProduct(product),
			QuantityPlanned: remaining,
		})
	}
	return items, nil
}

func (h *OutboundHandler) planFromAllocations(ob model.Outbound, product wmsProductSnapshot, locationByID map[string]wmsLocationSnapshot) ([]wmsPickingPlanItem, error) {
	query := h.DB.From("inventory_allocations").
		Select("alloc_id, product_id, quantity, status, source_type, location_id, outbound_id, order_id", "exact", false).
		Eq("company_id", ob.CompanyID).
		Eq("product_id", ob.ProductID).
		Eq("source_type", "stock").
		Not("location_id", "is", "null")
	if ob.OrderID != nil && *ob.OrderID != "" {
		query = query.Eq("order_id", *ob.OrderID)
	} else {
		query = query.Not("status", "in", "(cancelled,hold)")
	}
	data, _, err := query.Limit(200, "").Execute()
	if err != nil {
		return nil, err
	}
	var rows []wmsAllocationRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}

	remaining := ob.Quantity
	items := []wmsPickingPlanItem{}
	for _, row := range rows {
		if remaining <= 0 {
			break
		}
		if row.LocationID == nil || *row.LocationID == "" || row.Quantity <= 0 {
			continue
		}
		qty := row.Quantity
		if qty > remaining {
			qty = remaining
		}
		var locationCode *string
		if loc, ok := locationByID[*row.LocationID]; ok {
			locationCode = &loc.LocationCode
		}
		items = append(items, wmsPickingPlanItem{
			ProductID:       ob.ProductID,
			ProductCode:     product.ProductCode,
			ProductName:     product.ProductName,
			SpecWP:          specWPFromProduct(product),
			LocationID:      row.LocationID,
			LocationCode:    locationCode,
			QuantityPlanned: qty,
		})
		remaining -= qty
	}
	if remaining > 0 && len(items) > 0 {
		items = append(items, wmsPickingPlanItem{
			ProductID:       ob.ProductID,
			ProductCode:     product.ProductCode,
			ProductName:     product.ProductName,
			SpecWP:          specWPFromProduct(product),
			QuantityPlanned: remaining,
		})
	}
	return items, nil
}

// CreateFromOutbound — POST /api/v1/picking-lists/from-outbound/{outbound_id}
// 기존 출고 건에 대해 누락된 피킹 명세를 즉시 생성한다.
func (h *PickingListHandler) CreateFromOutbound(w http.ResponseWriter, r *http.Request) {
	outboundID := chi.URLParam(r, "outbound_id")
	outboundH := NewOutboundHandler(h.DB)
	ob, err := outboundH.fetchOutboundByID(outboundID)
	if err != nil {
		if err == errOutboundNotFound {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 조회에 실패했습니다")
		return
	}
	if err := outboundH.ensurePickingListForOutbound(ob); err != nil {
		log.Printf("[WMS 피킹 수동 생성 실패] outbound=%s err=%v", outboundID, err)
		response.RespondError(w, http.StatusInternalServerError, "피킹 명세 자동 생성에 실패했습니다: "+err.Error())
		return
	}
	data, _, err := h.DB.From("picking_lists").
		Select("*", "exact", false).
		Eq("outbound_id", outboundID).
		Order("created_at", &postgrest.OrderOpts{Ascending: false, NullsFirst: false}).
		Limit(1, "").
		Execute()
	if err != nil {
		response.RespondJSON(w, http.StatusCreated, map[string]string{"status": "created"})
		return
	}
	var rows []model.PickingList
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		response.RespondJSON(w, http.StatusCreated, map[string]string{"status": "created"})
		return
	}
	response.RespondJSON(w, http.StatusCreated, rows[0])
}

type UpdateCycleCountRequest struct {
	Status *string `json:"status,omitempty"`
	Notes  *string `json:"notes,omitempty"`
}

// UpdateHeader — PATCH /api/v1/cycle-counts/{id}
// 실사 시작/취소 같은 헤더 상태 변경.
func (h *CycleCountHandler) UpdateHeader(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateCycleCountRequest
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
			response.RespondError(w, http.StatusBadRequest, "status는 pending/in_progress/completed/cancelled 중 하나여야 합니다")
			return
		}
	}
	if req.Notes != nil {
		upd["notes"] = *req.Notes
	}
	if len(upd) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수정할 필드가 없습니다")
		return
	}
	_, _, err := h.DB.From("cycle_counts").
		Update(upd, "", "").Eq("cycle_count_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "실사 세션 수정 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// SeedItems — POST /api/v1/cycle-counts/{id}/seed?replace=true
// 창고 위치와 재고 자료를 스냅샷해 실사 라인을 자동 생성한다.
func (h *CycleCountHandler) SeedItems(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	replace := r.URL.Query().Get("replace") == "true"

	session, ok := h.loadCycleCount(id, w)
	if !ok {
		return
	}
	if session.Status == "completed" {
		response.RespondError(w, http.StatusConflict, "완료된 실사는 seed할 수 없습니다")
		return
	}
	_, existing, err := h.DB.From("cycle_count_items").
		Select("item_id", "exact", true).
		Eq("cycle_count_id", id).
		Range(0, 0, "").
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "기존 실사 라인 확인 실패")
		return
	}
	if existing > 0 && !replace {
		response.RespondError(w, http.StatusConflict, "이미 실사 라인이 있습니다. replace=true로 다시 생성하세요")
		return
	}
	if existing > 0 && replace {
		if _, _, err := h.DB.From("cycle_count_items").Delete("", "").Eq("cycle_count_id", id).Execute(); err != nil {
			response.RespondError(w, http.StatusInternalServerError, "기존 실사 라인 삭제 실패")
			return
		}
	}

	rows, source, err := h.buildCycleSeedRows(id, session.WarehouseID)
	if err != nil {
		log.Printf("[cycle count seed 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "실사 라인 자동 생성 실패: "+err.Error())
		return
	}
	if len(rows) > 0 {
		if _, _, err := h.DB.From("cycle_count_items").Insert(rows, false, "", "", "").Execute(); err != nil {
			response.RespondError(w, http.StatusInternalServerError, "실사 라인 저장 실패: "+err.Error())
			return
		}
	}
	response.RespondJSON(w, http.StatusCreated, map[string]any{
		"status":   "seeded",
		"source":   source,
		"inserted": len(rows),
	})
}

func (h *CycleCountHandler) loadCycleCount(id string, w http.ResponseWriter) (CycleCount, bool) {
	data, _, err := h.DB.From("cycle_counts").
		Select("*", "exact", false).
		Eq("cycle_count_id", id).
		Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "실사 세션 조회 실패")
		return CycleCount{}, false
	}
	var rows []CycleCount
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		response.RespondError(w, http.StatusNotFound, "실사 세션을 찾을 수 없습니다")
		return CycleCount{}, false
	}
	return rows[0], true
}

func (h *CycleCountHandler) buildCycleSeedRows(cycleCountID, warehouseID string) ([]map[string]any, string, error) {
	locations, err := h.loadActiveLocations(warehouseID)
	if err != nil {
		return nil, "", err
	}
	locationByCode := map[string]wmsLocationSnapshot{}
	locationByID := map[string]wmsLocationSnapshot{}
	locationIDs := make([]string, 0, len(locations))
	for _, loc := range locations {
		locationByCode[loc.LocationCode] = loc
		locationByID[loc.LocationID] = loc
		locationIDs = append(locationIDs, loc.LocationID)
	}
	if len(locations) == 0 {
		return []map[string]any{}, "warehouse_locations", nil
	}

	if rows, err := h.seedRowsFromMovements(cycleCountID, warehouseID, locationByCode); err == nil && len(rows) > 0 {
		return rows, "inventory_movements", nil
	} else if err != nil {
		log.Printf("[cycle count seed] inventory_movements fallback: %v", err)
	}
	rows, err := h.seedRowsFromAllocations(cycleCountID, locationIDs, locationByID)
	if err != nil {
		return nil, "", err
	}
	return rows, "inventory_allocations", nil
}

func (h *CycleCountHandler) loadActiveLocations(warehouseID string) ([]wmsLocationSnapshot, error) {
	data, _, err := h.DB.From("warehouse_locations").
		Select("location_id, warehouse_id, location_code, location_type, is_active", "exact", false).
		Eq("warehouse_id", warehouseID).
		Eq("is_active", "true").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []wmsLocationSnapshot
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func (h *CycleCountHandler) seedRowsFromMovements(cycleCountID, warehouseID string, locationByCode map[string]wmsLocationSnapshot) ([]map[string]any, error) {
	data, _, err := h.DB.From("inventory_movements").
		Select("product_id, location_code, ending_qty, movement_date", "exact", false).
		Eq("warehouse_id", warehouseID).
		Not("location_code", "is", "null").
		Order("movement_date", &postgrest.OrderOpts{Ascending: false, NullsFirst: false}).
		Limit(wmsCycleSeedLimit, "").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []wmsMovementRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	productIDs := []string{}
	seenProducts := map[string]bool{}
	for _, row := range rows {
		if row.ProductID != "" && !seenProducts[row.ProductID] {
			productIDs = append(productIDs, row.ProductID)
			seenProducts[row.ProductID] = true
		}
	}
	products := h.productSnapshots(productIDs)

	seen := map[string]bool{}
	out := []map[string]any{}
	for _, row := range rows {
		if row.LocationCode == nil || *row.LocationCode == "" || row.EndingQty == nil || *row.EndingQty <= 0 {
			continue
		}
		loc, ok := locationByCode[*row.LocationCode]
		if !ok {
			continue
		}
		key := row.ProductID + ":" + loc.LocationID
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, cycleSeedRow(cycleCountID, loc, productSnapshotOrID(products, row.ProductID), *row.EndingQty))
	}
	return out, nil
}

func (h *CycleCountHandler) seedRowsFromAllocations(cycleCountID string, locationIDs []string, locationByID map[string]wmsLocationSnapshot) ([]map[string]any, error) {
	if len(locationIDs) == 0 {
		return []map[string]any{}, nil
	}
	data, _, err := h.DB.From("inventory_allocations").
		Select("product_id, quantity, status, source_type, location_id", "exact", false).
		In("location_id", locationIDs).
		Eq("source_type", "stock").
		Not("status", "in", "(cancelled,hold)").
		Limit(wmsCycleSeedLimit, "").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []wmsAllocationRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	productIDs := []string{}
	seenProducts := map[string]bool{}
	type key struct{ productID, locationID string }
	qtyByKey := map[key]int{}
	for _, row := range rows {
		if row.LocationID == nil || *row.LocationID == "" || row.Quantity <= 0 {
			continue
		}
		k := key{productID: row.ProductID, locationID: *row.LocationID}
		qtyByKey[k] += row.Quantity
		if row.ProductID != "" && !seenProducts[row.ProductID] {
			productIDs = append(productIDs, row.ProductID)
			seenProducts[row.ProductID] = true
		}
	}
	products := h.productSnapshots(productIDs)
	out := []map[string]any{}
	for k, qty := range qtyByKey {
		loc, ok := locationByID[k.locationID]
		if !ok {
			continue
		}
		out = append(out, cycleSeedRow(cycleCountID, loc, productSnapshotOrID(products, k.productID), qty))
	}
	return out, nil
}

func (h *CycleCountHandler) productSnapshots(productIDs []string) map[string]wmsProductSnapshot {
	result := map[string]wmsProductSnapshot{}
	if len(productIDs) == 0 {
		return result
	}
	data, _, err := h.DB.From("products").
		Select("product_id, product_code, product_name, spec_wp", "exact", false).
		In("product_id", productIDs).
		Execute()
	if err != nil {
		return result
	}
	var rows []wmsProductSnapshot
	if err := json.Unmarshal(data, &rows); err != nil {
		return result
	}
	for _, row := range rows {
		result[row.ProductID] = row
	}
	return result
}

func productSnapshotOrID(products map[string]wmsProductSnapshot, productID string) wmsProductSnapshot {
	product := products[productID]
	if product.ProductID == "" {
		product.ProductID = productID
	}
	return product
}

func cycleSeedRow(cycleCountID string, loc wmsLocationSnapshot, product wmsProductSnapshot, expectedQty int) map[string]any {
	row := map[string]any{
		"cycle_count_id":         cycleCountID,
		"location_id":            loc.LocationID,
		"location_code_snapshot": loc.LocationCode,
		"expected_qty":           expectedQty,
	}
	if product.ProductID != "" {
		row["product_id"] = product.ProductID
	}
	if product.ProductCode != nil {
		row["product_code_snapshot"] = *product.ProductCode
	}
	if product.ProductName != nil {
		row["product_name_snapshot"] = *product.ProductName
	}
	return row
}

type UpdateReceivingLogRequest struct {
	QuantityReceived     *int     `json:"quantity_received,omitempty"`
	LocationID           *string  `json:"location_id,omitempty"`
	LocationCodeSnapshot *string  `json:"location_code_snapshot,omitempty"`
	VarianceReason       *string  `json:"variance_reason,omitempty"`
	VarianceNote         *string  `json:"variance_note,omitempty"`
	PhotoAttachmentIDs   []string `json:"photo_attachment_ids,omitempty"`
	Notes                *string  `json:"notes,omitempty"`
}

// Update — PATCH /api/v1/receiving-logs/{id}
// 입고 후 위치 배정, 실수량 정정, 사진/사유 보강을 한다.
func (h *ReceivingLogHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateReceivingLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	upd := map[string]any{}
	if req.QuantityReceived != nil {
		if *req.QuantityReceived < 0 {
			response.RespondError(w, http.StatusBadRequest, "quantity_received는 0 이상이어야 합니다")
			return
		}
		upd["quantity_received"] = *req.QuantityReceived
	}
	if req.LocationID != nil {
		upd["location_id"] = *req.LocationID
	}
	if req.LocationCodeSnapshot != nil {
		upd["location_code_snapshot"] = *req.LocationCodeSnapshot
	}
	if req.VarianceReason != nil {
		switch *req.VarianceReason {
		case "shortage", "overage", "damaged", "wrong_product", "wrong_spec", "other":
			upd["variance_reason"] = *req.VarianceReason
		default:
			response.RespondError(w, http.StatusBadRequest, "variance_reason은 shortage/overage/damaged/wrong_product/wrong_spec/other 중 하나여야 합니다")
			return
		}
	}
	if req.VarianceNote != nil {
		upd["variance_note"] = *req.VarianceNote
	}
	if len(req.PhotoAttachmentIDs) > 0 {
		upd["photo_attachment_ids"] = req.PhotoAttachmentIDs
	}
	if req.Notes != nil {
		upd["notes"] = *req.Notes
	}
	if len(upd) == 0 {
		response.RespondError(w, http.StatusBadRequest, "수정할 필드가 없습니다")
		return
	}
	_, _, err := h.DB.From("receiving_logs").Update(upd, "", "").Eq("receiving_id", id).Execute()
	if err != nil {
		response.RespondError(w, http.StatusInternalServerError, "검수 로그 수정 실패")
		return
	}
	response.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *IntercompanyRequestHandler) ensureReceivingLogForIntercompanyRequest(requestID, receiverUserID string) error {
	data, _, err := h.DB.From("intercompany_requests").
		Select("request_id, product_id, quantity, outbound_id", "exact", false).
		Eq("request_id", requestID).
		Execute()
	if err != nil {
		return err
	}
	var requests []wmsIntercompanyRequestRow
	if err := json.Unmarshal(data, &requests); err != nil {
		return err
	}
	if len(requests) == 0 || requests[0].Quantity <= 0 || requests[0].OutboundID == nil || *requests[0].OutboundID == "" {
		return nil
	}

	outbound, err := NewOutboundHandler(h.DB).fetchOutboundByID(*requests[0].OutboundID)
	if err != nil {
		return err
	}
	if outbound.WarehouseID == "" {
		return nil
	}

	_, count, err := h.DB.From("receiving_logs").
		Select("receiving_id", "exact", true).
		Eq("source_type", "intercompany").
		Eq("intercompany_request_id", requestID).
		Range(0, 0, "").
		Execute()
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	product, _ := NewOutboundHandler(h.DB).productSnapshot(requests[0].ProductID)
	insert := intercompanyReceivingLogInsert(requests[0], outbound.WarehouseID, product, receiverUserID)
	if _, _, err := h.DB.From("receiving_logs").Insert(insert, false, "", "", "").Execute(); err != nil {
		return err
	}
	return nil
}

func intercompanyReceivingLogInsert(row wmsIntercompanyRequestRow, warehouseID string, product wmsProductSnapshot, receiverUserID string) map[string]any {
	insert := map[string]any{
		"source_type":             "intercompany",
		"intercompany_request_id": row.RequestID,
		"warehouse_id":            warehouseID,
		"product_id":              row.ProductID,
		"quantity_expected":       row.Quantity,
		"quantity_received":       row.Quantity,
		"notes":                   "자동 생성: 그룹내 매입 입고확인 시 검수 로그 생성",
	}
	if receiverUserID != "" {
		insert["receiver_user_id"] = receiverUserID
	}
	if product.ProductCode != nil {
		insert["product_code_snapshot"] = *product.ProductCode
	}
	if product.ProductName != nil {
		insert["product_name_snapshot"] = *product.ProductName
	}
	return insert
}

func (h *BLHandler) ensureReceivingLogsForBL(bl model.BLShipment) error {
	if bl.BLID == "" || bl.WarehouseID == nil || *bl.WarehouseID == "" {
		return nil
	}
	data, _, err := h.DB.From("bl_line_items").
		Select("bl_line_id, bl_id, product_id, quantity, products(product_code, product_name)", "exact", false).
		Eq("bl_id", bl.BLID).
		Execute()
	if err != nil {
		return err
	}
	var lines []struct {
		BLLineID  string `json:"bl_line_id"`
		BLID      string `json:"bl_id"`
		ProductID string `json:"product_id"`
		Quantity  int    `json:"quantity"`
		Products  *struct {
			ProductCode *string `json:"product_code"`
			ProductName *string `json:"product_name"`
		} `json:"products"`
	}
	if err := json.Unmarshal(data, &lines); err != nil {
		return err
	}
	if len(lines) == 0 {
		return nil
	}
	for _, line := range lines {
		_, count, err := h.DB.From("receiving_logs").
			Select("receiving_id", "exact", true).
			Eq("source_type", "bl_line").
			Eq("bl_line_id", line.BLLineID).
			Range(0, 0, "").
			Execute()
		if err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		insert := map[string]any{
			"source_type":       "bl_line",
			"bl_line_id":        line.BLLineID,
			"warehouse_id":      *bl.WarehouseID,
			"product_id":        line.ProductID,
			"quantity_expected": line.Quantity,
			"quantity_received": line.Quantity,
			"notes":             "자동 생성: B/L 입고완료 전환 시 검수 로그 생성",
		}
		if line.Products != nil {
			if line.Products.ProductCode != nil {
				insert["product_code_snapshot"] = *line.Products.ProductCode
			}
			if line.Products.ProductName != nil {
				insert["product_name_snapshot"] = *line.Products.ProductName
			}
		}
		if _, _, err := h.DB.From("receiving_logs").Insert(insert, false, "", "", "").Execute(); err != nil {
			return err
		}
	}
	return nil
}
