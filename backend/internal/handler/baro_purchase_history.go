package handler

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"

	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BaroPurchaseHistoryHandler — BARO 전용 자체 구매이력 읽기 API
type BaroPurchaseHistoryHandler struct {
	DB *supa.Client
}

func NewBaroPurchaseHistoryHandler(db *supa.Client) *BaroPurchaseHistoryHandler {
	return &BaroPurchaseHistoryHandler{DB: db}
}

type baroPurchaseCompanyRow struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
	CompanyCode string `json:"company_code"`
}

type baroPurchaseShipmentRow struct {
	BLID                 string   `json:"bl_id"`
	BLNumber             string   `json:"bl_number"`
	POID                 *string  `json:"po_id"`
	CompanyID            string   `json:"company_id"`
	ManufacturerID       string   `json:"manufacturer_id"`
	InboundType          string   `json:"inbound_type"`
	Currency             string   `json:"currency"`
	ExchangeRate         *float64 `json:"exchange_rate"`
	ETD                  *string  `json:"etd"`
	ETA                  *string  `json:"eta"`
	ActualArrival        *string  `json:"actual_arrival"`
	Port                 *string  `json:"port"`
	WarehouseID          *string  `json:"warehouse_id"`
	Status               string   `json:"status"`
	PaymentTerms         *string  `json:"payment_terms"`
	Incoterms            *string  `json:"incoterms"`
	CounterpartCompanyID *string  `json:"counterpart_company_id"`
}

type baroPurchaseLineProductRow struct {
	ProductCode    *string `json:"product_code"`
	ProductName    *string `json:"product_name"`
	SpecWP         *int    `json:"spec_wp"`
	ModuleWidthMM  *int    `json:"module_width_mm"`
	ModuleHeightMM *int    `json:"module_height_mm"`
}

type baroPurchaseLineRow struct {
	BLLineID         string                      `json:"bl_line_id"`
	BLID             string                      `json:"bl_id"`
	ProductID        string                      `json:"product_id"`
	Quantity         int                         `json:"quantity"`
	CapacityKW       float64                     `json:"capacity_kw"`
	ItemType         string                      `json:"item_type"`
	PaymentType      string                      `json:"payment_type"`
	InvoiceAmountUSD *float64                    `json:"invoice_amount_usd"`
	UnitPriceUSDWp   *float64                    `json:"unit_price_usd_wp"`
	UnitPriceKRWWp   *float64                    `json:"unit_price_krw_wp"`
	UsageCategory    string                      `json:"usage_category"`
	Products         *baroPurchaseLineProductRow `json:"products"`
}

type baroPurchasePOrow struct {
	POID     string  `json:"po_id"`
	PONumber *string `json:"po_number"`
}

type baroPurchaseManufacturerRow struct {
	ManufacturerID string `json:"manufacturer_id"`
	NameKR         string `json:"name_kr"`
}

type baroPurchaseWarehouseRow struct {
	WarehouseID   string `json:"warehouse_id"`
	WarehouseName string `json:"warehouse_name"`
}

// List — GET /api/v1/baro/purchase-history — BARO 자체 매입 원가/구매이력
func (h *BaroPurchaseHistoryHandler) List(w http.ResponseWriter, r *http.Request) {
	baroCompany, ok := h.baroPurchaseCompany()
	if !ok {
		response.RespondJSON(w, http.StatusOK, []model.BaroPurchaseHistoryItem{})
		return
	}

	limit := baroPurchaseLimit(r)
	q := h.DB.From("bl_shipments").
		Select("bl_id, bl_number, po_id, company_id, manufacturer_id, inbound_type, currency, exchange_rate, etd, eta, actual_arrival, port, warehouse_id, status, payment_terms, incoterms, counterpart_company_id", "exact", false).
		Eq("company_id", baroCompany.CompanyID).
		Order("actual_arrival", &postgrest.OrderOpts{Ascending: false}).
		Limit(limit, "")
	if status := r.URL.Query().Get("status"); status != "" {
		q = q.Eq("status", status)
	}
	if inboundType := r.URL.Query().Get("inbound_type"); inboundType != "" {
		q = q.Eq("inbound_type", inboundType)
	}
	if from := r.URL.Query().Get("from"); from != "" {
		q = q.Gte("actual_arrival", from)
	}
	if to := r.URL.Query().Get("to"); to != "" {
		q = q.Lte("actual_arrival", to)
	}

	shipData, _, err := q.Execute()
	if err != nil {
		log.Printf("[BARO 구매이력 B/L 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "BARO 구매이력 조회에 실패했습니다")
		return
	}
	var shipments []baroPurchaseShipmentRow
	if err := json.Unmarshal(shipData, &shipments); err != nil {
		log.Printf("[BARO 구매이력 B/L 디코딩 실패] %v / raw=%s", err, string(shipData))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(shipments) == 0 {
		response.RespondJSON(w, http.StatusOK, []model.BaroPurchaseHistoryItem{})
		return
	}

	blIDs := make([]string, 0, len(shipments))
	poIDs := make([]string, 0, len(shipments))
	shipByID := make(map[string]baroPurchaseShipmentRow, len(shipments))
	for _, ship := range shipments {
		blIDs = append(blIDs, ship.BLID)
		shipByID[ship.BLID] = ship
		if ship.POID != nil && *ship.POID != "" {
			poIDs = append(poIDs, *ship.POID)
		}
	}

	lineData, _, err := h.DB.From("bl_line_items").
		Select("bl_line_id, bl_id, product_id, quantity, capacity_kw, item_type, payment_type, invoice_amount_usd, unit_price_usd_wp, unit_price_krw_wp, usage_category, products(product_code, product_name, spec_wp, module_width_mm, module_height_mm)", "exact", false).
		In("bl_id", blIDs).
		Execute()
	if err != nil {
		log.Printf("[BARO 구매이력 라인 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "BARO 구매이력 라인 조회에 실패했습니다")
		return
	}
	var lines []baroPurchaseLineRow
	if err := json.Unmarshal(lineData, &lines); err != nil {
		log.Printf("[BARO 구매이력 라인 디코딩 실패] %v / raw=%s", err, string(lineData))
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	poNumbers := h.baroPurchasePONumbers(poIDs)
	companyNames := h.baroPurchaseCompanyNames()
	manufacturerNames := h.baroPurchaseManufacturerNames()
	warehouseNames := h.baroPurchaseWarehouseNames()
	items := make([]model.BaroPurchaseHistoryItem, 0, len(lines))
	companyName := baroCompany.CompanyName

	for _, line := range lines {
		ship, ok := shipByID[line.BLID]
		if !ok {
			continue
		}
		product := line.Products
		purchaseDate := baroPurchaseDate(ship)
		manufacturerName := manufacturerNames[ship.ManufacturerID]
		sourceName := manufacturerName
		if ship.InboundType == "group" && ship.CounterpartCompanyID != nil {
			if name := companyNames[*ship.CounterpartCompanyID]; name != nil {
				sourceName = name
			}
		}
		item := model.BaroPurchaseHistoryItem{
			ID:                   line.BLLineID,
			BLID:                 ship.BLID,
			BLNumber:             ship.BLNumber,
			POID:                 ship.POID,
			PONumber:             baroPurchasePONumber(ship.POID, poNumbers),
			CompanyID:            ship.CompanyID,
			CompanyName:          &companyName,
			ManufacturerID:       ship.ManufacturerID,
			ManufacturerName:     manufacturerName,
			SourceName:           sourceName,
			InboundType:          ship.InboundType,
			Status:               ship.Status,
			Currency:             ship.Currency,
			ExchangeRate:         ship.ExchangeRate,
			ETD:                  ship.ETD,
			ETA:                  ship.ETA,
			ActualArrival:        ship.ActualArrival,
			PurchaseDate:         purchaseDate,
			Port:                 ship.Port,
			WarehouseID:          ship.WarehouseID,
			WarehouseName:        baroPurchaseStringMapPtr(warehouseNames, ship.WarehouseID),
			ProductID:            line.ProductID,
			Quantity:             line.Quantity,
			CapacityKW:           line.CapacityKW,
			ItemType:             line.ItemType,
			PaymentType:          line.PaymentType,
			UsageCategory:        line.UsageCategory,
			UnitPriceUSDWp:       line.UnitPriceUSDWp,
			UnitPriceKRWWp:       line.UnitPriceKRWWp,
			InvoiceAmountUSD:     line.InvoiceAmountUSD,
			EstimatedAmountUSD:   baroPurchaseAmountUSD(line),
			EstimatedAmountKRW:   baroPurchaseAmountKRW(line, ship.ExchangeRate),
			PaymentTerms:         ship.PaymentTerms,
			Incoterms:            ship.Incoterms,
			CounterpartCompanyID: ship.CounterpartCompanyID,
		}
		if product != nil {
			item.ProductCode = product.ProductCode
			item.ProductName = product.ProductName
			item.SpecWP = product.SpecWP
			item.ModuleWidthMM = product.ModuleWidthMM
			item.ModuleHeightMM = product.ModuleHeightMM
		}
		items = append(items, item)
	}

	sort.SliceStable(items, func(i, j int) bool {
		return baroPurchaseDateSort(items[i].PurchaseDate) > baroPurchaseDateSort(items[j].PurchaseDate)
	})
	response.RespondJSON(w, http.StatusOK, items)
}

func baroPurchaseLimit(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || n <= 0 {
		return 500
	}
	if n > 2000 {
		return 2000
	}
	return n
}

func (h *BaroPurchaseHistoryHandler) baroPurchaseCompany() (baroPurchaseCompanyRow, bool) {
	data, _, err := h.DB.From("companies").
		Select("company_id, company_name, company_code", "exact", false).
		Eq("company_code", "BR").
		Limit(1, "").
		Execute()
	if err != nil {
		log.Printf("[BARO 구매이력 법인 조회 실패] %v", err)
		return baroPurchaseCompanyRow{}, false
	}
	var rows []baroPurchaseCompanyRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 구매이력 법인 디코딩 실패] %v", err)
		return baroPurchaseCompanyRow{}, false
	}
	if len(rows) == 0 {
		log.Printf("[BARO 구매이력 법인 없음] company_code=BR")
		return baroPurchaseCompanyRow{}, false
	}
	return rows[0], true
}

func (h *BaroPurchaseHistoryHandler) baroPurchasePONumbers(poIDs []string) map[string]*string {
	out := map[string]*string{}
	if len(poIDs) == 0 {
		return out
	}
	data, _, err := h.DB.From("purchase_orders").
		Select("po_id, po_number", "exact", false).
		In("po_id", poIDs).
		Execute()
	if err != nil {
		log.Printf("[BARO 구매이력 PO 룩업 실패] %v", err)
		return out
	}
	var rows []baroPurchasePOrow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 구매이력 PO 룩업 디코딩 실패] %v", err)
		return out
	}
	for _, row := range rows {
		out[row.POID] = row.PONumber
	}
	return out
}

func (h *BaroPurchaseHistoryHandler) baroPurchaseCompanyNames() map[string]*string {
	data, _, err := h.DB.From("companies").Select("company_id, company_name, company_code", "exact", false).Execute()
	out := map[string]*string{}
	if err != nil {
		log.Printf("[BARO 구매이력 법인 룩업 실패] %v", err)
		return out
	}
	var rows []baroPurchaseCompanyRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 구매이력 법인 룩업 디코딩 실패] %v", err)
		return out
	}
	for _, row := range rows {
		name := row.CompanyName
		out[row.CompanyID] = &name
	}
	return out
}

func (h *BaroPurchaseHistoryHandler) baroPurchaseManufacturerNames() map[string]*string {
	data, _, err := h.DB.From("manufacturers").Select("manufacturer_id, name_kr", "exact", false).Execute()
	out := map[string]*string{}
	if err != nil {
		log.Printf("[BARO 구매이력 제조사 룩업 실패] %v", err)
		return out
	}
	var rows []baroPurchaseManufacturerRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 구매이력 제조사 룩업 디코딩 실패] %v", err)
		return out
	}
	for _, row := range rows {
		name := row.NameKR
		out[row.ManufacturerID] = &name
	}
	return out
}

func (h *BaroPurchaseHistoryHandler) baroPurchaseWarehouseNames() map[string]*string {
	data, _, err := h.DB.From("warehouses").Select("warehouse_id, warehouse_name", "exact", false).Execute()
	out := map[string]*string{}
	if err != nil {
		log.Printf("[BARO 구매이력 창고 룩업 실패] %v", err)
		return out
	}
	var rows []baroPurchaseWarehouseRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[BARO 구매이력 창고 룩업 디코딩 실패] %v", err)
		return out
	}
	for _, row := range rows {
		name := row.WarehouseName
		out[row.WarehouseID] = &name
	}
	return out
}

func baroPurchasePONumber(poID *string, poNumbers map[string]*string) *string {
	if poID == nil {
		return nil
	}
	return poNumbers[*poID]
}

func baroPurchaseStringMapPtr(m map[string]*string, key *string) *string {
	if key == nil {
		return nil
	}
	return m[*key]
}

func baroPurchaseDate(ship baroPurchaseShipmentRow) *string {
	if ship.ActualArrival != nil && *ship.ActualArrival != "" {
		return ship.ActualArrival
	}
	if ship.ETA != nil && *ship.ETA != "" {
		return ship.ETA
	}
	if ship.ETD != nil && *ship.ETD != "" {
		return ship.ETD
	}
	return nil
}

func baroPurchaseDateSort(date *string) string {
	if date == nil {
		return ""
	}
	return *date
}

func baroPurchaseAmountUSD(line baroPurchaseLineRow) *float64 {
	if line.InvoiceAmountUSD != nil {
		return line.InvoiceAmountUSD
	}
	if line.UnitPriceUSDWp == nil || line.CapacityKW <= 0 {
		return nil
	}
	v := (*line.UnitPriceUSDWp) * line.CapacityKW * 1000
	return &v
}

func baroPurchaseAmountKRW(line baroPurchaseLineRow, exchangeRate *float64) *float64 {
	if line.UnitPriceKRWWp != nil && line.CapacityKW > 0 {
		v := math.Round((*line.UnitPriceKRWWp) * line.CapacityKW * 1000)
		return &v
	}
	usd := baroPurchaseAmountUSD(line)
	if usd == nil || exchangeRate == nil {
		return nil
	}
	v := math.Round((*usd) * (*exchangeRate))
	return &v
}
