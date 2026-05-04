package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	postgrest "github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// outboundDefaultLimit / outboundMaxLimit — Supabase Cloud PostgREST 가 강제하는
// db-max-rows=1000 가드를 그대로 따라 단일 응답 최대 1000행으로 클램프한다.
const (
	outboundDefaultLimit = 100
	outboundMaxLimit     = 1000
)

// outboundListColumns — List 응답에 포함할 outbounds 컬럼 화이트리스트.
// source_payload (외부 양식 원본 jsonb, 행당 KB 단위) 제외 — 상세 화면(GetByID/fetchOutboundByID) 에서는 그대로 * 사용.
const outboundListColumns = "outbound_id, outbound_date, company_id, product_id, quantity, capacity_kw, " +
	"warehouse_id, usage_category, order_id, site_name, site_address, spare_qty, " +
	"group_trade, target_company_id, erp_outbound_no, status, memo, bl_id, " +
	"tx_statement_ready, inspection_request_sent, approval_requested, tax_invoice_issued"

// uniqueNonEmpty — 문자열 슬라이스에서 빈 값과 중복을 제거하고 입력 순서를 보존한다.
// enrich 단계에서 IN (...) 필터에 들어갈 ID 모음을 만들 때 사용.
func uniqueNonEmpty(values []string) []string {
	if len(values) == 0 {
		return values
	}
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, v := range values {
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

// outboundSortable — 정렬 가능 컬럼 화이트리스트 (SQL 인젝션 방어).
// 컬럼명은 outbounds 테이블의 실제 컬럼.
var outboundSortable = map[string]struct{}{
	"outbound_date":   {},
	"erp_outbound_no": {},
	"site_name":       {},
	"quantity":        {},
	"capacity_kw":     {},
	"usage_category":  {},
	"status":          {},
	"created_at":      {},
}

var errOutboundNotFound = errors.New("outbound not found")

// OutboundHandler — 출고(outbounds) 관련 API를 처리하는 핸들러
// 비유: "출고 관리실" — 창고에서 현장/고객으로 나가는 모듈 출고를 관리
// Rust 계산엔진 연동 — 출고 저장 전 재고 차감 검증 (가용재고 >= 출고수량)
// TODO: 그룹 내 거래 — 출고 시 상대 법인 입고 자동 생성.
type OutboundHandler struct {
	DB     *supa.Client
	Engine *engine.EngineClient
}

type createOutboundRPCRequest struct {
	OutboundID string                       `json:"p_outbound_id"`
	Outbound   model.CreateOutboundRequest  `json:"p_outbound"`
	BLItems    *[]model.OutboundBLItemInput `json:"p_bl_items,omitempty"`
}

type updateOutboundRPCRequest struct {
	OutboundID string                       `json:"p_outbound_id"`
	Outbound   model.UpdateOutboundRequest  `json:"p_outbound"`
	BLItems    *[]model.OutboundBLItemInput `json:"p_bl_items,omitempty"`
}

type deleteOutboundRPCRequest struct {
	OutboundID string `json:"p_outbound_id"`
}

// NewOutboundHandler — OutboundHandler 생성자
func NewOutboundHandler(db *supa.Client, engineClient ...*engine.EngineClient) *OutboundHandler {
	var ec *engine.EngineClient
	if len(engineClient) > 0 {
		ec = engineClient[0]
	}
	return &OutboundHandler{DB: db, Engine: ec}
}

func (h *OutboundHandler) fetchOutboundByID(id string) (model.Outbound, error) {
	data, _, err := h.DB.From("outbounds").
		Select("*", "exact", false).
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		return model.Outbound{}, err
	}

	var outbounds []model.Outbound
	if err := json.Unmarshal(data, &outbounds); err != nil {
		return model.Outbound{}, err
	}
	if len(outbounds) == 0 {
		return model.Outbound{}, errOutboundNotFound
	}

	enriched, err := h.enrichOutbounds(outbounds)
	if err != nil {
		return model.Outbound{}, err
	}
	ob := enriched[0]
	ob.BLItems = h.fetchBLItems(id)
	return ob, nil
}

type outboundBLNumberRow struct {
	BLID     string `json:"bl_id"`
	BLNumber string `json:"bl_number"`
}

// fetchBLNumberMap — bl_id → bl_number 매핑. blIDs 가 비면 전체 fetch (호환), 있으면 IN(...) 으로 좁힘.
func (h *OutboundHandler) fetchBLNumberMap(blIDs []string) map[string]string {
	q := h.DB.From("bl_shipments").Select("bl_id, bl_number", "exact", false)
	if len(blIDs) > 0 {
		q = q.In("bl_id", blIDs)
	}
	data, _, err := q.Execute()
	if err != nil {
		return map[string]string{}
	}
	var rows []outboundBLNumberRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return map[string]string{}
	}
	result := make(map[string]string, len(rows))
	for _, row := range rows {
		result[row.BLID] = row.BLNumber
	}
	return result
}

func withBLNumbers(items []model.OutboundBLItem, blNumbers map[string]string) []model.OutboundBLItem {
	for i := range items {
		if number, ok := blNumbers[items[i].BLID]; ok {
			blNumber := number
			items[i].BLNumber = &blNumber
		}
	}
	return items
}

// fetchBLItems — outbound_bl_items 조회 헬퍼 (단일 outbound 상세용).
// 항목에서 모은 bl_id 만 fetchBLNumberMap 으로 넘겨 bl_shipments 전체 스캔 회피.
func (h *OutboundHandler) fetchBLItems(outboundID string) []model.OutboundBLItem {
	data, _, err := h.DB.From("outbound_bl_items").
		Select("*", "exact", false).
		Eq("outbound_id", outboundID).
		Execute()
	if err != nil {
		return nil
	}
	var items []model.OutboundBLItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil
	}
	blIDs := make([]string, 0, len(items))
	for _, it := range items {
		blIDs = append(blIDs, it.BLID)
	}
	blIDs = uniqueNonEmpty(blIDs)
	return withBLNumbers(items, h.fetchBLNumberMap(blIDs))
}

// fetchBLItemsByOutbound — List 응답용 outbound_id → BL items 묶음.
// outboundIDs 로 좁혀 outbound_bl_items / bl_shipments 전체 스캔(이전 동작) 을 피한다.
func (h *OutboundHandler) fetchBLItemsByOutbound(outboundIDs []string) map[string][]model.OutboundBLItem {
	if len(outboundIDs) == 0 {
		return map[string][]model.OutboundBLItem{}
	}
	data, _, err := h.DB.From("outbound_bl_items").
		Select("*", "exact", false).
		In("outbound_id", outboundIDs).
		Execute()
	if err != nil {
		return map[string][]model.OutboundBLItem{}
	}
	var items []model.OutboundBLItem
	if err := json.Unmarshal(data, &items); err != nil {
		return map[string][]model.OutboundBLItem{}
	}
	blIDs := make([]string, 0, len(items))
	for _, it := range items {
		blIDs = append(blIDs, it.BLID)
	}
	blIDs = uniqueNonEmpty(blIDs)
	items = withBLNumbers(items, h.fetchBLNumberMap(blIDs))
	result := make(map[string][]model.OutboundBLItem)
	for _, item := range items {
		result[item.OutboundID] = append(result[item.OutboundID], item)
	}
	return result
}

type outboundProductRow struct {
	ProductID      string   `json:"product_id"`
	ProductName    string   `json:"product_name"`
	ProductCode    string   `json:"product_code"`
	SpecWp         *float64 `json:"spec_wp"`
	WattageKw      *float64 `json:"wattage_kw"`
	ManufacturerID *string  `json:"manufacturer_id"`
}

type outboundManufacturerRow struct {
	ManufacturerID string  `json:"manufacturer_id"`
	NameKR         string  `json:"name_kr"`
	ShortName      *string `json:"short_name"`
}

type outboundWarehouseRow struct {
	WarehouseID   string `json:"warehouse_id"`
	WarehouseName string `json:"warehouse_name"`
}

type outboundCompanyRow struct {
	CompanyID   string `json:"company_id"`
	CompanyName string `json:"company_name"`
}

type outboundOrderRow struct {
	OrderID     string   `json:"order_id"`
	OrderNumber *string  `json:"order_number"`
	CustomerID  string   `json:"customer_id"`
	UnitPriceWp *float64 `json:"unit_price_wp"`
}

type outboundPartnerRow struct {
	PartnerID   string `json:"partner_id"`
	PartnerName string `json:"partner_name"`
}

func (h *OutboundHandler) fetchOutboundRecord(id string) (model.Outbound, bool, error) {
	data, _, err := h.DB.From("outbounds").
		Select("*", "exact", false).
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		return model.Outbound{}, false, err
	}

	var rows []model.Outbound
	if err := json.Unmarshal(data, &rows); err != nil {
		return model.Outbound{}, false, err
	}
	if len(rows) == 0 {
		return model.Outbound{}, false, nil
	}
	return rows[0], true, nil
}

// computeOutboundCapacityKW — 출고 용량(kW) 계산의 pure 함수.
// explicit capacity_kw가 주어지면 양수 검증 후 그대로 반환.
// 아니면 quantity × productWattageKW로 계산. productWattageKW는 호출 측에서 DB 조회 후 전달.
// DB·HTTP 의존 없음 — 단위테스트는 tx_outbound_test.go.
func computeOutboundCapacityKW(quantity int, explicitKW *float64, productWattageKW *float64) (float64, error) {
	if explicitKW != nil {
		if *explicitKW <= 0 {
			return 0, fmt.Errorf("capacity_kw는 양수여야 합니다")
		}
		return *explicitKW, nil
	}
	if productWattageKW == nil || *productWattageKW <= 0 {
		return 0, fmt.Errorf("품번의 wattage_kw를 확인할 수 없습니다")
	}
	return float64(quantity) * *productWattageKW, nil
}

func (h *OutboundHandler) resolveOutboundCapacityKW(productID string, quantity int, capacityKW *float64) (float64, error) {
	var wattage *float64
	if capacityKW == nil {
		// explicit이 없을 때만 DB 조회
		data, _, err := h.DB.From("products").
			Select("wattage_kw", "exact", false).
			Eq("product_id", productID).
			Execute()
		if err != nil {
			return 0, err
		}
		var products []struct {
			WattageKW *float64 `json:"wattage_kw"`
		}
		if err := json.Unmarshal(data, &products); err != nil {
			return 0, err
		}
		if len(products) > 0 {
			wattage = products[0].WattageKW
		}
	}
	return computeOutboundCapacityKW(quantity, capacityKW, wattage)
}

func (h *OutboundHandler) ensureOutboundStockAvailable(companyID, productID string, quantity int, capacityKW *float64, status string, creditKW float64) (int, string, error) {
	if status != "active" {
		return 0, "", nil
	}
	if h.Engine == nil {
		return http.StatusServiceUnavailable, "Rust 재고 검증을 사용할 수 없어 출고 저장을 중단했습니다", fmt.Errorf("Rust 계산엔진 미설정")
	}

	requiredKW, err := h.resolveOutboundCapacityKW(productID, quantity, capacityKW)
	if err != nil {
		return http.StatusInternalServerError, "출고 용량을 계산하지 못했습니다: " + err.Error(), err
	}

	inventory, err := h.Engine.GetInventory(companyID, &productID, nil)
	if err != nil {
		return http.StatusServiceUnavailable, "Rust 재고 검증에 실패해 출고 저장을 중단했습니다: " + err.Error(), err
	}

	availableKW := 0.0
	for _, item := range inventory.Items {
		if item.ProductID == productID {
			availableKW = item.AvailableKW
			break
		}
	}

	maxAllowedKW := availableKW + creditKW
	const toleranceKW = 0.000001
	if requiredKW > maxAllowedKW+toleranceKW {
		msg := fmt.Sprintf("재고 부족으로 출고를 저장할 수 없습니다 (필요 %.3fkW, 가용 %.3fkW)", requiredKW, maxAllowedKW)
		return http.StatusConflict, msg, fmt.Errorf("재고 부족: 필요 %.3fkW, 가용 %.3fkW", requiredKW, maxAllowedKW)
	}

	return 0, "", nil
}

func (h *OutboundHandler) enrichOutbounds(outbounds []model.Outbound) ([]model.Outbound, error) {
	if len(outbounds) == 0 {
		return outbounds, nil
	}

	// 배치에서 참조된 ID 들만 수집 — products/warehouses/companies/orders/partners/sales
	// 각 테이블 전체 스캔(이전 동작) 대신 IN (...) 필터로 좁힌다.
	productIDs := make([]string, 0, len(outbounds))
	warehouseIDs := make([]string, 0, len(outbounds))
	companyIDs := make([]string, 0, len(outbounds)*2)
	orderIDs := make([]string, 0, len(outbounds))
	outboundIDs := make([]string, 0, len(outbounds))
	for _, o := range outbounds {
		productIDs = append(productIDs, o.ProductID)
		warehouseIDs = append(warehouseIDs, o.WarehouseID)
		companyIDs = append(companyIDs, o.CompanyID)
		if o.TargetCompanyID != nil {
			companyIDs = append(companyIDs, *o.TargetCompanyID)
		}
		if o.OrderID != nil {
			orderIDs = append(orderIDs, *o.OrderID)
		}
		outboundIDs = append(outboundIDs, o.OutboundID)
	}
	productIDs = uniqueNonEmpty(productIDs)
	warehouseIDs = uniqueNonEmpty(warehouseIDs)
	companyIDs = uniqueNonEmpty(companyIDs)
	orderIDs = uniqueNonEmpty(orderIDs)
	outboundIDs = uniqueNonEmpty(outboundIDs)

	var products []outboundProductRow
	if len(productIDs) > 0 {
		if data, _, err := h.DB.From("products").
			Select("product_id, product_name, product_code, spec_wp, wattage_kw, manufacturer_id", "exact", false).
			In("product_id", productIDs).
			Execute(); err != nil {
			return nil, fmt.Errorf("products 조회 실패: %w", err)
		} else if err := json.Unmarshal(data, &products); err != nil {
			return nil, fmt.Errorf("products 디코딩 실패: %w", err)
		}
	}

	manufacturerIDs := make([]string, 0, len(products))
	for _, p := range products {
		if p.ManufacturerID != nil {
			manufacturerIDs = append(manufacturerIDs, *p.ManufacturerID)
		}
	}
	manufacturerIDs = uniqueNonEmpty(manufacturerIDs)

	var manufacturers []outboundManufacturerRow
	if len(manufacturerIDs) > 0 {
		if data, _, err := h.DB.From("manufacturers").
			Select("manufacturer_id, name_kr, short_name", "exact", false).
			In("manufacturer_id", manufacturerIDs).
			Execute(); err != nil {
			return nil, fmt.Errorf("manufacturers 조회 실패: %w", err)
		} else if err := json.Unmarshal(data, &manufacturers); err != nil {
			return nil, fmt.Errorf("manufacturers 디코딩 실패: %w", err)
		}
	}

	var warehouses []outboundWarehouseRow
	if len(warehouseIDs) > 0 {
		if data, _, err := h.DB.From("warehouses").
			Select("warehouse_id, warehouse_name", "exact", false).
			In("warehouse_id", warehouseIDs).
			Execute(); err != nil {
			return nil, fmt.Errorf("warehouses 조회 실패: %w", err)
		} else if err := json.Unmarshal(data, &warehouses); err != nil {
			return nil, fmt.Errorf("warehouses 디코딩 실패: %w", err)
		}
	}

	var companies []outboundCompanyRow
	if len(companyIDs) > 0 {
		if data, _, err := h.DB.From("companies").
			Select("company_id, company_name", "exact", false).
			In("company_id", companyIDs).
			Execute(); err != nil {
			return nil, fmt.Errorf("companies 조회 실패: %w", err)
		} else if err := json.Unmarshal(data, &companies); err != nil {
			return nil, fmt.Errorf("companies 디코딩 실패: %w", err)
		}
	}

	var orders []outboundOrderRow
	if len(orderIDs) > 0 {
		if data, _, err := h.DB.From("orders").
			Select("order_id, order_number, customer_id, unit_price_wp", "exact", false).
			In("order_id", orderIDs).
			Execute(); err != nil {
			return nil, fmt.Errorf("orders 조회 실패: %w", err)
		} else if err := json.Unmarshal(data, &orders); err != nil {
			return nil, fmt.Errorf("orders 디코딩 실패: %w", err)
		}
	}

	customerIDs := make([]string, 0, len(orders))
	for _, o := range orders {
		customerIDs = append(customerIDs, o.CustomerID)
	}
	customerIDs = uniqueNonEmpty(customerIDs)

	var partners []outboundPartnerRow
	if len(customerIDs) > 0 {
		if data, _, err := h.DB.From("partners").
			Select("partner_id, partner_name", "exact", false).
			In("partner_id", customerIDs).
			Execute(); err != nil {
			return nil, fmt.Errorf("partners 조회 실패: %w", err)
		} else if err := json.Unmarshal(data, &partners); err != nil {
			return nil, fmt.Errorf("partners 디코딩 실패: %w", err)
		}
	}

	var sales []model.Sale
	if len(outboundIDs) > 0 {
		if data, _, err := h.DB.From("sales").
			Select("*", "exact", false).
			Neq("status", "cancelled").
			In("outbound_id", outboundIDs).
			Execute(); err != nil {
			return nil, fmt.Errorf("sales 조회 실패: %w", err)
		} else if err := json.Unmarshal(data, &sales); err != nil {
			return nil, fmt.Errorf("sales 디코딩 실패: %w", err)
		}
	}

	productMap := make(map[string]outboundProductRow, len(products))
	for _, p := range products {
		productMap[p.ProductID] = p
	}
	manufacturerMap := make(map[string]outboundManufacturerRow, len(manufacturers))
	for _, m := range manufacturers {
		manufacturerMap[m.ManufacturerID] = m
	}
	warehouseMap := make(map[string]outboundWarehouseRow, len(warehouses))
	for _, w := range warehouses {
		warehouseMap[w.WarehouseID] = w
	}
	companyMap := make(map[string]outboundCompanyRow, len(companies))
	for _, c := range companies {
		companyMap[c.CompanyID] = c
	}
	orderMap := make(map[string]outboundOrderRow, len(orders))
	for _, o := range orders {
		orderMap[o.OrderID] = o
	}
	partnerMap := make(map[string]outboundPartnerRow, len(partners))
	for _, p := range partners {
		partnerMap[p.PartnerID] = p
	}
	saleMap := make(map[string]model.Sale, len(sales))
	for _, s := range sales {
		if s.OutboundID != nil && *s.OutboundID != "" {
			sale := s
			if partner, ok := partnerMap[s.CustomerID]; ok {
				sale.CustomerName = &partner.PartnerName
			}
			if _, exists := saleMap[*s.OutboundID]; !exists {
				saleMap[*s.OutboundID] = sale
			}
		}
	}

	for i := range outbounds {
		ob := &outbounds[i]
		if p, ok := productMap[ob.ProductID]; ok {
			ob.ProductName = &p.ProductName
			ob.ProductCode = &p.ProductCode
			ob.SpecWp = p.SpecWp
			ob.WattageKw = p.WattageKw
			ob.ManufacturerID = p.ManufacturerID
			if p.ManufacturerID != nil {
				if m, ok := manufacturerMap[*p.ManufacturerID]; ok {
					name := m.NameKR
					if m.ShortName != nil && *m.ShortName != "" {
						name = *m.ShortName
					}
					ob.ManufacturerName = &name
				}
			}
		}
		if w, ok := warehouseMap[ob.WarehouseID]; ok {
			ob.WarehouseName = &w.WarehouseName
		}
		if c, ok := companyMap[ob.CompanyID]; ok {
			ob.CompanyName = &c.CompanyName
		}
		if ob.TargetCompanyID != nil {
			if c, ok := companyMap[*ob.TargetCompanyID]; ok {
				ob.TargetCompanyName = &c.CompanyName
			}
		}
		if ob.OrderID != nil {
			if order, ok := orderMap[*ob.OrderID]; ok {
				ob.OrderNumber = order.OrderNumber
				ob.CustomerID = &order.CustomerID
				ob.UnitPriceWp = order.UnitPriceWp
				if partner, ok := partnerMap[order.CustomerID]; ok {
					ob.CustomerName = &partner.PartnerName
				}
			}
		}
		if sale, ok := saleMap[ob.OutboundID]; ok {
			ob.Sale = &sale
		}
	}
	return outbounds, nil
}

// productIDsByManufacturer — manufacturer_id 로 products.product_id 리스트를 끌어옴.
// outbounds.product_id IN (...) 형태로 DB-level 제조사 필터를 거는 데 사용한다.
func (h *OutboundHandler) productIDsByManufacturer(manufacturerID string) ([]string, error) {
	data, _, err := h.DB.From("products").
		Select("product_id", "exact", false).
		Eq("manufacturer_id", manufacturerID).
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ProductID string `json:"product_id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ProductID)
	}
	return ids, nil
}

// idsBySearch — 단일 컬럼 ilike 로 자식 테이블의 ID 후보를 끌어와 outbounds.<fk> IN (...) 에 사용.
// q 가 빈 문자열이거나 매칭이 0건이면 빈 슬라이스 반환 (호출 측에서 OR 조건 생략).
func (h *OutboundHandler) idsBySearch(table, idColumn string, columns []string, q string) ([]string, error) {
	or := make([]string, 0, len(columns))
	for _, col := range columns {
		or = append(or, fmt.Sprintf("%s.ilike.*%s*", col, q))
	}
	data, _, err := h.DB.From(table).
		Select(idColumn, "exact", false).
		Or(strings.Join(or, ","), "").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []map[string]any
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if v, ok := row[idColumn].(string); ok {
			ids = append(ids, v)
		}
	}
	return ids, nil
}

// parseLimitOffset — ?limit, ?offset 파싱 + 클램프.
func parseLimitOffset(r *http.Request, defaultLimit, maxLimit int) (limit, offset int) {
	limit = defaultLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	if raw := r.URL.Query().Get("offset"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 0 {
			offset = v
		}
	}
	return limit, offset
}

// parseSort — ?sort=<column>&?order=<asc|desc> 파싱. 화이트리스트 검증.
// 기본값은 outbound_date desc (운영자가 가장 최근 출고를 먼저 보길 기대).
func parseOutboundSort(r *http.Request) (column string, ascending bool) {
	column = "outbound_date"
	ascending = false
	if raw := r.URL.Query().Get("sort"); raw != "" {
		if _, ok := outboundSortable[raw]; ok {
			column = raw
		}
	}
	if r.URL.Query().Get("order") == "asc" {
		ascending = true
	}
	return column, ascending
}

// sanitizeSearchTerm — q 에서 PostgREST OR 파서가 읽는 reserved 문자(쉼표·괄호·점·따옴표)를
// 공백으로 치환. 빈 문자열이 되면 검색 미적용으로 떨어진다.
func sanitizeSearchTerm(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	replacer := strings.NewReplacer(",", " ", "(", " ", ")", " ", ".", " ", "*", " ", "\"", " ")
	return strings.TrimSpace(replacer.Replace(q))
}

// applyOutboundSearch — ?q 검색어를 outbound 쿼리에 적용한다.
// outbounds 직접 컬럼(site_name, erp_outbound_no, target_company_name) 은 ilike OR 로,
// 자식 테이블(products/orders/warehouses) 의 컬럼은 먼저 ID 리스트를 끌어와 IN 으로 결합한다.
// 매칭되는 컬럼이 하나도 없으면 false 를 반환하고 빈 응답을 보내야 한다.
func (h *OutboundHandler) applyOutboundSearch(query *postgrest.FilterBuilder, q string) (*postgrest.FilterBuilder, bool, error) {
	clauses := []string{
		fmt.Sprintf("site_name.ilike.*%s*", q),
		fmt.Sprintf("erp_outbound_no.ilike.*%s*", q),
		fmt.Sprintf("target_company_name.ilike.*%s*", q),
	}

	productIDs, err := h.idsBySearch("products", "product_id", []string{"product_code", "product_name"}, q)
	if err != nil {
		return query, false, fmt.Errorf("products 검색 실패: %w", err)
	}
	if len(productIDs) > 0 {
		clauses = append(clauses, fmt.Sprintf("product_id.in.(%s)", strings.Join(productIDs, ",")))
	}

	orderIDs, err := h.idsBySearch("orders", "order_id", []string{"order_number"}, q)
	if err != nil {
		return query, false, fmt.Errorf("orders 검색 실패: %w", err)
	}
	if len(orderIDs) > 0 {
		clauses = append(clauses, fmt.Sprintf("order_id.in.(%s)", strings.Join(orderIDs, ",")))
	}

	warehouseIDs, err := h.idsBySearch("warehouses", "warehouse_id", []string{"warehouse_name"}, q)
	if err != nil {
		return query, false, fmt.Errorf("warehouses 검색 실패: %w", err)
	}
	if len(warehouseIDs) > 0 {
		clauses = append(clauses, fmt.Sprintf("warehouse_id.in.(%s)", strings.Join(warehouseIDs, ",")))
	}

	return query.Or(strings.Join(clauses, ","), ""), true, nil
}

// applyOutboundFilters — List 와 Summary 가 공유하는 필터 로직.
// q/manufacturer_id 처리에 추가 DB 호출이 발생할 수 있어 (success bool, err) 시그니처로 빈 결과를 신호한다.
func (h *OutboundHandler) applyOutboundFilters(r *http.Request, query *postgrest.FilterBuilder) (*postgrest.FilterBuilder, bool, error) {
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq("company_id", compID)
	}
	if whID := r.URL.Query().Get("warehouse_id"); whID != "" {
		query = query.Eq("warehouse_id", whID)
	}
	if usage := r.URL.Query().Get("usage_category"); usage != "" {
		query = query.Eq("usage_category", usage)
	}
	if orderID := r.URL.Query().Get("order_id"); orderID != "" {
		query = query.Eq("order_id", orderID)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	}

	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		productIDs, err := h.productIDsByManufacturer(mfgID)
		if err != nil {
			return query, false, fmt.Errorf("manufacturer_id 처리 실패: %w", err)
		}
		if len(productIDs) == 0 {
			return query, false, nil
		}
		query = query.In("product_id", productIDs)
	}

	if q := sanitizeSearchTerm(r.URL.Query().Get("q")); q != "" {
		next, ok, err := h.applyOutboundSearch(query, q)
		if err != nil {
			return query, false, err
		}
		if !ok {
			return query, false, nil
		}
		query = next
	}

	return query, true, nil
}

// List — GET /api/v1/outbounds — 출고 목록 조회 (서버사이드 페이지네이션·검색·정렬).
// 쿼리 파라미터:
//   - limit/offset: 페이지네이션 (기본 100, 최대 1000)
//   - sort/order:   화이트리스트 컬럼 정렬 (기본 outbound_date desc)
//   - q:            site_name/erp_outbound_no/target_company_name 및 product/order/warehouse 이름 검색
//   - company_id/warehouse_id/usage_category/order_id/status/manufacturer_id: 등치 필터
//
// 응답 헤더 X-Total-Count 로 필터 후 전체 건수 노출.
func (h *OutboundHandler) List(w http.ResponseWriter, r *http.Request) {
	// 응답에서 source_payload (외부 양식 원본 jsonb, 행당 KB 단위) 제외 — 상세 화면(GetByID/fetchOutboundByID) 에서는 그대로 *.
	query := h.DB.From("outbounds").Select(outboundListColumns, "exact", false)
	query, ok, err := h.applyOutboundFilters(r, query)
	if err != nil {
		log.Printf("[출고 목록 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 목록 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		w.Header().Set("X-Total-Count", "0")
		response.RespondJSON(w, http.StatusOK, []model.Outbound{})
		return
	}

	sortCol, asc := parseOutboundSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := parseLimitOffset(r, outboundDefaultLimit, outboundMaxLimit)
	query = query.Range(offset, offset+limit-1, "")

	data, count, err := query.Execute()
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

	outbounds, err = h.enrichOutbounds(outbounds)
	if err != nil {
		log.Printf("[출고 목록 참조 데이터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 참조 데이터 처리에 실패했습니다")
		return
	}
	outboundIDs := make([]string, 0, len(outbounds))
	for _, o := range outbounds {
		outboundIDs = append(outboundIDs, o.OutboundID)
	}
	blItemsByOutbound := h.fetchBLItemsByOutbound(outboundIDs)
	for i := range outbounds {
		outbounds[i].BLItems = blItemsByOutbound[outbounds[i].OutboundID]
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, outbounds)
}

// OutboundSummary — KPI 카드용 집계 응답.
// 매출 합계와 계산서 미발행 건수는 sales 테이블에서 outbound 단위로 조인 집계한다.
type OutboundSummary struct {
	Total              int64   `json:"total"`
	ActiveCount        int64   `json:"active_count"`
	CancelPendingCount int64   `json:"cancel_pending_count"`
	CancelledCount     int64   `json:"cancelled_count"`
	SaleAmountSum      float64 `json:"sale_amount_sum"`
	InvoicePendingCount int64  `json:"invoice_pending_count"`
}

// Summary — GET /api/v1/outbounds/summary — KPI 카드용 집계.
// List 와 동일한 필터(company_id, warehouse_id, usage_category, manufacturer_id, q) 를 받아
// 페이지 사이즈에 무관하게 전체에 대한 카운트/합계를 돌려준다.
func (h *OutboundHandler) Summary(w http.ResponseWriter, r *http.Request) {
	// 출고 카운트 — head=true 로 본문 없이 X-Total-Count 만 받는다 (전체).
	totalQ := h.DB.From("outbounds").Select("outbound_id", "exact", true)
	totalQ, ok, err := h.applyOutboundFilters(r, totalQ)
	if err != nil {
		log.Printf("[출고 요약 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 요약 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		response.RespondJSON(w, http.StatusOK, OutboundSummary{})
		return
	}

	summary := OutboundSummary{}
	if _, count, err := totalQ.Range(0, 0, "").Execute(); err != nil {
		log.Printf("[출고 요약 - total 카운트 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 요약 조회에 실패했습니다")
		return
	} else {
		summary.Total = count
	}

	// status 별 카운트는 List 와 동일 필터 + status 추가로 재조회.
	// status 가 이미 query string 에 있으면 그 값으로 고정되어 다른 status 카운트는 0 으로 떨어짐 (의도).
	for _, st := range []struct {
		key    string
		target *int64
	}{
		{"active", &summary.ActiveCount},
		{"cancel_pending", &summary.CancelPendingCount},
		{"cancelled", &summary.CancelledCount},
	} {
		q := h.DB.From("outbounds").Select("outbound_id", "exact", true)
		q, ok2, err := h.applyOutboundFilters(r, q)
		if err != nil || !ok2 {
			continue
		}
		// 사용자가 status 필터를 이미 걸었다면 그쪽이 우선 — Eq 추가는 더 좁히는 효과만.
		q = q.Eq("status", st.key)
		if _, c, err := q.Range(0, 0, "").Execute(); err == nil {
			*st.target = c
		}
	}

	// 매출 합계와 계산서 미발행 건수는 sales 에서 직접 집계.
	// outbound 필터를 sales.outbound_id 로 재투영하기 위해 List 와 같은 필터로 outbound_id 후보를 끌어온 뒤
	// sales 에서 IN 으로 거른다 — 후보가 매우 많으면(>10k) PostgREST URL 길이 한계 우려가 있으나
	// 운영 데이터 규모상 당분간 안전.
	//
	// InvoicePendingCount 는 "outbound 단위" 로 센다 (D-102 정의):
	//   - 매출 row 자체가 없는 출고 → 미발행
	//   - 매출이 있어도 모든 sale 의 tax_invoice_date 가 null → 미발행
	//   - tax_invoice_date 가 채워진 sale 이 하나라도 있으면 → 발행 (제외)
	// 과거에는 sale row 개수를 그대로 셌어서 (a) 매출 없는 출고를 누락하고 (b) 한 출고에 sale 이 여러 건이면
	// 중복 카운트하는 두 가지 결함이 있었음. 알림(useAlerts) 가 이 값을 그대로 사용하므로 정의가 일치해야 함.
	idQ := h.DB.From("outbounds").Select("outbound_id", "exact", false)
	idQ, ok3, err := h.applyOutboundFilters(r, idQ)
	if err == nil && ok3 {
		if data, _, err := idQ.Execute(); err == nil {
			var idRows []struct {
				OutboundID string `json:"outbound_id"`
			}
			if json.Unmarshal(data, &idRows) == nil && len(idRows) > 0 {
				ids := make([]string, 0, len(idRows))
				for _, row := range idRows {
					ids = append(ids, row.OutboundID)
				}
				if saleData, _, err := h.DB.From("sales").
					Select("supply_amount, tax_invoice_date, outbound_id", "exact", false).
					In("outbound_id", ids).
					Neq("status", "cancelled").
					Execute(); err == nil {
					var sales []struct {
						SupplyAmount   *float64 `json:"supply_amount"`
						TaxInvoiceDate *string  `json:"tax_invoice_date"`
						OutboundID     *string  `json:"outbound_id"`
					}
					if json.Unmarshal(saleData, &sales) == nil {
						issuedOutbounds := make(map[string]struct{})
						for _, s := range sales {
							if s.SupplyAmount != nil {
								summary.SaleAmountSum += *s.SupplyAmount
							}
							if s.TaxInvoiceDate != nil && s.OutboundID != nil {
								issuedOutbounds[*s.OutboundID] = struct{}{}
							}
						}
						summary.InvoicePendingCount = int64(len(ids) - len(issuedOutbounds))
					}
				}
			}
		}
	}

	response.RespondJSON(w, http.StatusOK, summary)
}

// GetByID — GET /api/v1/outbounds/{id} — 출고 상세 조회
func (h *OutboundHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	ob, err := h.fetchOutboundByID(id)
	if err != nil {
		log.Printf("[출고 상세 조회 실패] id=%s err=%v", id, err)
		if errors.Is(err, errOutboundNotFound) {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 조회에 실패했습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, ob)
}

// Create — POST /api/v1/outbounds — 출고 등록
func (h *OutboundHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateOutboundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[출고 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	created, code, msg, err := h.createOutboundCore(req)
	if err != nil {
		response.RespondError(w, code, msg)
		return
	}
	writeAuditLog(h.DB, r, "outbounds", created.OutboundID, "create", nil, auditRawFromValue(created), "")
	response.RespondJSON(w, code, created)
}

// createOutboundCore — Create 핸들러와 AI 도우미 ConfirmProposal이 공유하는 핵심 로직.
// status 기본값/검증/재고 체크/트랜잭션 RPC/결과 조회까지 수행한다.
// audit log 기록은 호출 측에서 (요청 컨텍스트가 필요하므로).
// 반환: (생성된 출고, HTTP status code, 사용자용 메시지, error). err==nil이면 code는 201.
func (h *OutboundHandler) createOutboundCore(req model.CreateOutboundRequest) (model.Outbound, int, string, error) {
	if req.Status == "" {
		req.Status = "active"
	}
	if msg := req.Validate(); msg != "" {
		return model.Outbound{}, http.StatusBadRequest, msg, fmt.Errorf("validate: %s", msg)
	}

	if status, msg, err := h.ensureOutboundStockAvailable(req.CompanyID, req.ProductID, req.Quantity, req.CapacityKw, req.Status, 0); err != nil {
		log.Printf("[출고 등록 재고 검증 실패] company_id=%s product_id=%s err=%v", req.CompanyID, req.ProductID, err)
		return model.Outbound{}, status, msg, err
	}

	blItems := req.BLItems
	req.BLItems = nil
	var blItemsParam *[]model.OutboundBLItemInput
	if blItems != nil {
		blItemsParam = &blItems
	}

	outboundID := uuid.NewString()
	if err := callRPC(h.DB, "sf_create_outbound", createOutboundRPCRequest{
		OutboundID: outboundID,
		Outbound:   req,
		BLItems:    blItemsParam,
	}); err != nil {
		log.Printf("[출고 트랜잭션 등록 실패] outbound_id=%s err=%v", outboundID, err)
		return model.Outbound{}, http.StatusInternalServerError, "출고 등록에 실패했습니다", err
	}

	created, err := h.fetchOutboundByID(outboundID)
	if err != nil {
		log.Printf("[출고 등록 결과 조회 실패] outbound_id=%s err=%v", outboundID, err)
		return model.Outbound{}, http.StatusInternalServerError, "출고 등록 결과를 확인할 수 없습니다", err
	}
	return created, http.StatusCreated, "", nil
}

// Update — PUT /api/v1/outbounds/{id} — 출고 수정
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

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "outbounds", "outbound_id", id)
	if oldErr != nil {
		log.Printf("[출고 수정 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	prev, found, err := h.fetchOutboundRecord(id)
	if err != nil {
		log.Printf("[출고 수정 전 기존 전표 조회 실패] id=%s err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "기존 출고 조회에 실패했습니다")
		return
	}
	if !found {
		response.RespondError(w, http.StatusNotFound, "수정할 출고를 찾을 수 없습니다")
		return
	}

	finalCompanyID := prev.CompanyID
	if req.CompanyID != nil {
		finalCompanyID = *req.CompanyID
	}
	finalProductID := prev.ProductID
	if req.ProductID != nil {
		finalProductID = *req.ProductID
	}
	finalQuantity := prev.Quantity
	if req.Quantity != nil {
		finalQuantity = *req.Quantity
	}
	finalCapacityKW := prev.CapacityKw
	if req.CapacityKw != nil {
		finalCapacityKW = req.CapacityKw
	}
	finalStatus := prev.Status
	if req.Status != nil {
		finalStatus = *req.Status
	}

	creditKW := 0.0
	if prev.Status == "active" && prev.CompanyID == finalCompanyID && prev.ProductID == finalProductID {
		if oldKW, err := h.resolveOutboundCapacityKW(prev.ProductID, prev.Quantity, prev.CapacityKw); err == nil {
			creditKW = oldKW
		} else {
			log.Printf("[출고 수정 재고 검증] 기존 출고 용량 계산 실패 id=%s err=%v", id, err)
		}
	}
	if status, msg, err := h.ensureOutboundStockAvailable(finalCompanyID, finalProductID, finalQuantity, finalCapacityKW, finalStatus, creditKW); err != nil {
		log.Printf("[출고 수정 재고 검증 실패] id=%s company_id=%s product_id=%s err=%v", id, finalCompanyID, finalProductID, err)
		response.RespondError(w, status, msg)
		return
	}

	// BLItems 추출 후 nil 처리
	blItems := req.BLItems
	req.BLItems = nil
	var blItemsParam *[]model.OutboundBLItemInput
	if blItems != nil {
		blItemsParam = &blItems
	}

	if err := callRPC(h.DB, "sf_update_outbound", updateOutboundRPCRequest{
		OutboundID: id,
		Outbound:   req,
		BLItems:    blItemsParam,
	}); err != nil {
		log.Printf("[출고 트랜잭션 수정 실패] outbound_id=%s err=%v", id, err)
		if isRPCNotFound(err) {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 수정에 실패했습니다")
		return
	}

	updated, err := h.fetchOutboundByID(id)
	if err != nil {
		log.Printf("[출고 수정 결과 조회 실패] outbound_id=%s err=%v", id, err)
		if errors.Is(err, errOutboundNotFound) {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 수정 결과를 확인할 수 없습니다")
		return
	}
	auditEntityByRouteID(h.DB, r, "outbounds", "outbound_id", "update", oldSnapshot, auditRawFromValue(updated), "")
	response.RespondJSON(w, http.StatusOK, updated)
}

// Delete — DELETE /api/v1/outbounds/{id} — 출고 취소 처리
func (h *OutboundHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "outbounds", "outbound_id", id)
	if oldErr != nil {
		log.Printf("[출고 취소 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	var linkedSales []model.Sale
	if saleData, _, err := h.DB.From("sales").Select("*", "exact", false).Eq("outbound_id", id).Execute(); err == nil {
		if err := json.Unmarshal(saleData, &linkedSales); err != nil {
			log.Printf("[출고 취소 전 매출 스냅샷 디코딩 실패] outbound_id=%s err=%v", id, err)
		}
	} else {
		log.Printf("[출고 취소 전 매출 스냅샷 조회 실패] outbound_id=%s err=%v", id, err)
	}

	if err := callRPC(h.DB, "sf_delete_outbound", deleteOutboundRPCRequest{OutboundID: id}); err != nil {
		log.Printf("[출고 트랜잭션 취소 실패] id=%s, err=%v", id, err)
		if isRPCNotFound(err) {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 취소에 실패했습니다")
		return
	}

	newSnapshot, _, snapErr := auditSnapshot(h.DB, "outbounds", "outbound_id", id)
	if snapErr != nil {
		log.Printf("[출고 취소 후 감사 스냅샷 조회 실패] id=%s err=%v", id, snapErr)
	}
	auditEntityByRouteID(h.DB, r, "outbounds", "outbound_id", "delete", oldSnapshot, newSnapshot, "soft_cancel")

	for _, sale := range linkedSales {
		action := "update"
		note := "outbound_soft_cancel_detach"
		if sale.OrderID == nil || *sale.OrderID == "" {
			action = "delete"
			note = "outbound_soft_cancel"
		}
		after, found, afterErr := auditSnapshot(h.DB, "sales", "sale_id", sale.SaleID)
		if afterErr != nil {
			log.Printf("[출고 취소 후 매출 감사 스냅샷 조회 실패] sale_id=%s err=%v", sale.SaleID, afterErr)
		}
		if !found {
			after = nil
		}
		writeAuditLog(h.DB, r, "sales", sale.SaleID, action, auditRawFromValue(sale), after, note)
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "cancelled"})
}
