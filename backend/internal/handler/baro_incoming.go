package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BaroIncomingHandler — BARO 전용 입고예정 읽기 API
// 비유: 탑솔라 선적 서류에서 금액·환율·원가 칸을 가리고, 영업이 답변에 쓸 일정표만 복사해 주는 창구
type BaroIncomingHandler struct {
	DB *supa.Client
}

func NewBaroIncomingHandler(db *supa.Client) *BaroIncomingHandler {
	return &BaroIncomingHandler{DB: db}
}

type baroIncomingShipmentRow struct {
	BLID           string  `json:"bl_id"`
	BLNumber       string  `json:"bl_number"`
	CompanyID      string  `json:"company_id"`
	ManufacturerID *string `json:"manufacturer_id"`
	InboundType    string  `json:"inbound_type"`
	ETD            *string `json:"etd"`
	ETA            *string `json:"eta"`
	ActualArrival  *string `json:"actual_arrival"`
	Port           *string `json:"port"`
	WarehouseID    *string `json:"warehouse_id"`
	Status         string  `json:"status"`
}

type baroIncomingLineRow struct {
	BLLineID   string                         `json:"bl_line_id"`
	BLID       string                         `json:"bl_id"`
	ProductID  string                         `json:"product_id"`
	Quantity   int                            `json:"quantity"`
	CapacityKW float64                        `json:"capacity_kw"`
	Products   *model.ProductSummaryForBLLine `json:"products"`
}

type baroIncomingCompanyRow struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
}

type baroIncomingManufacturerRow struct {
	ManufacturerID string  `json:"manufacturer_id"`
	NameKR         string  `json:"name_kr"`
	ShortName      *string `json:"short_name"`
}

type baroIncomingWarehouseRow struct {
	WarehouseID   string `json:"warehouse_id"`
	WarehouseName string `json:"warehouse_name"`
}

// List — GET /api/v1/baro/incoming — BARO가 직접 보는 입고예정/ETA 보드
func (h *BaroIncomingHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("bl_shipments").
		Select("bl_id, bl_number, company_id, manufacturer_id, inbound_type, etd, eta, actual_arrival, port, warehouse_id, status", "exact", false)

	if r.URL.Query().Get("include_sandbox") != "true" {
		query = query.Eq("is_sandbox", "false")
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	} else if r.URL.Query().Get("scope") != "all" {
		query = query.In("status", []string{"scheduled", "shipping", "arrived", "customs"})
	}
	if companyID := r.URL.Query().Get("company_id"); companyID != "" && companyID != "all" {
		query = query.Eq("company_id", companyID)
	}

	shipData, _, err := query.
		Order("eta", &postgrest.OrderOpts{Ascending: true}).
		Execute()
	if err != nil {
		log.Printf("[BARO 입고예정 B/L 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "입고예정 조회에 실패했습니다")
		return
	}
	var shipments []baroIncomingShipmentRow
	if err := json.Unmarshal(shipData, &shipments); err != nil {
		log.Printf("[BARO 입고예정 B/L 디코딩 실패] %v / raw=%s", err, string(shipData))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(shipments) == 0 {
		response.RespondJSON(w, http.StatusOK, []model.BaroIncomingItem{})
		return
	}

	blIDs := make([]string, 0, len(shipments))
	shipByID := make(map[string]baroIncomingShipmentRow, len(shipments))
	for _, ship := range shipments {
		blIDs = append(blIDs, ship.BLID)
		shipByID[ship.BLID] = ship
	}

	lineData, _, err := h.DB.From("bl_line_items").
		Select("bl_line_id, bl_id, product_id, quantity, capacity_kw, products(product_code, product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		In("bl_id", blIDs).
		Execute()
	if err != nil {
		log.Printf("[BARO 입고예정 라인 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "입고예정 품목 조회에 실패했습니다")
		return
	}
	var lines []baroIncomingLineRow
	if err := json.Unmarshal(lineData, &lines); err != nil {
		log.Printf("[BARO 입고예정 라인 디코딩 실패] %v / raw=%s", err, string(lineData))
		response.RespondError(w, http.StatusInternalServerError, "입고예정 품목 처리에 실패했습니다")
		return
	}

	companyNames := h.baroIncomingCompanyNames()
	manufacturerNames := h.baroIncomingManufacturerNames()
	warehouseNames := h.baroIncomingWarehouseNames()

	items := make([]model.BaroIncomingItem, 0, len(lines))
	for _, line := range lines {
		ship, ok := shipByID[line.BLID]
		if !ok {
			continue
		}
		manufacturerID := ""
		var manufacturerName *string
		if ship.ManufacturerID != nil {
			manufacturerID = *ship.ManufacturerID
			manufacturerName = stringPtrFromMap(manufacturerNames, manufacturerID)
		}
		item := model.BaroIncomingItem{
			ID:                 line.BLLineID,
			BLID:               ship.BLID,
			BLNumber:           ship.BLNumber,
			CompanyID:          ship.CompanyID,
			CompanyName:        stringPtrFromMap(companyNames, ship.CompanyID),
			ManufacturerID:     manufacturerID,
			ManufacturerName:   manufacturerName,
			InboundType:        ship.InboundType,
			Status:             ship.Status,
			ETD:                ship.ETD,
			ETA:                ship.ETA,
			ActualArrival:      ship.ActualArrival,
			SalesAvailableDate: salesAvailableDate(ship),
			Port:               ship.Port,
			WarehouseID:        ship.WarehouseID,
			ProductID:          line.ProductID,
			Quantity:           line.Quantity,
			CapacityKW:         line.CapacityKW,
		}
		if ship.WarehouseID != nil {
			item.WarehouseName = stringPtrFromMap(warehouseNames, *ship.WarehouseID)
		}
		if line.Products != nil {
			item.ProductCode = &line.Products.ProductCode
			item.ProductName = &line.Products.ProductName
			item.SpecWP = &line.Products.SpecWP
			item.ModuleWidthMM = &line.Products.ModuleWidthMM
			item.ModuleHeightMM = &line.Products.ModuleHeightMM
		}
		items = append(items, item)
	}

	response.RespondJSON(w, http.StatusOK, items)
}

func salesAvailableDate(ship baroIncomingShipmentRow) *string {
	if ship.ActualArrival != nil && *ship.ActualArrival != "" {
		return ship.ActualArrival
	}
	if ship.ETA != nil && *ship.ETA != "" {
		return ship.ETA
	}
	return nil
}

func stringPtrFromMap(values map[string]string, key string) *string {
	if v, ok := values[key]; ok {
		return &v
	}
	return nil
}

func (h *BaroIncomingHandler) baroIncomingCompanyNames() map[string]string {
	data, _, err := h.DB.From("companies").
		Select("company_id, company_name", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[BARO 입고예정 법인 룩업 실패] %v", err)
		return map[string]string{}
	}
	var rows []baroIncomingCompanyRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 입고예정 법인 룩업 디코딩 실패] %v", err)
		return map[string]string{}
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.CompanyID] = row.CompanyName
	}
	return out
}

func (h *BaroIncomingHandler) baroIncomingManufacturerNames() map[string]string {
	data, _, err := h.DB.From("manufacturers").
		Select("manufacturer_id, name_kr, short_name", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[BARO 입고예정 제조사 룩업 실패] %v", err)
		return map[string]string{}
	}
	var rows []baroIncomingManufacturerRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 입고예정 제조사 룩업 디코딩 실패] %v", err)
		return map[string]string{}
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		if row.ShortName != nil && *row.ShortName != "" {
			out[row.ManufacturerID] = *row.ShortName
			continue
		}
		out[row.ManufacturerID] = row.NameKR
	}
	return out
}

func (h *BaroIncomingHandler) baroIncomingWarehouseNames() map[string]string {
	data, _, err := h.DB.From("warehouses").
		Select("warehouse_id, warehouse_name", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[BARO 입고예정 창고 룩업 실패] %v", err)
		return map[string]string{}
	}
	var rows []baroIncomingWarehouseRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 입고예정 창고 룩업 디코딩 실패] %v", err)
		return map[string]string{}
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.WarehouseID] = row.WarehouseName
	}
	return out
}
