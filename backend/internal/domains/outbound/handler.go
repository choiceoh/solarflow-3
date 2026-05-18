package outbound

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

	"solarflow-backend/internal/audit"
	"solarflow-backend/internal/dbschema"
	"solarflow-backend/internal/domains/sale"
	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
	"solarflow-backend/internal/rpcutil"
)

// outboundDefaultLimit / outboundMaxLimit — Supabase Cloud PostgREST 가 강제하는
// db-max-rows=1000 가드를 그대로 따라 단일 응답 최대 1000행으로 클램프한다.
const (
	outboundDefaultLimit = 100
	outboundMaxLimit     = 1000
	// outboundSummaryBatchSize — Summary 의 sales.outbound_id IN 청크 크기.
	// 36-char UUID 200 개 → 약 7.4KB URL, Cloudflare 8KB 한도 안.
	outboundSummaryBatchSize = 200
)

// outboundListColumns — List 응답에 포함할 outbounds 컬럼 화이트리스트.
// source_payload (외부 양식 원본 jsonb, 행당 KB 단위) 제외 — 상세 화면(GetByID/FetchOutboundByID) 에서는 그대로 * 사용.
// outbounds.bl_id 는 M115 (2026-05-14) 에서 DROP — BL 매핑은 outbound_bl_items 가 정본.
const outboundListColumns = "outbound_id, outbound_date, company_id, product_id, quantity, capacity_kw, " +
	"warehouse_id, usage_category, order_id, site_name, site_address, spare_qty, " +
	"group_trade, target_company_id, erp_outbound_no, status, memo, " +
	"tx_statement_ready, inspection_request_sent, approval_requested, tax_invoice_issued"

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
	DB          *supa.Client
	Engine      *engine.EngineClient
	BaroCompany *middleware.BaroCompanyResolver
}

type createOutboundRPCRequest struct {
	OutboundID string                 `json:"p_outbound_id"`
	Outbound   CreateOutboundRequest  `json:"p_outbound"`
	BLItems    *[]OutboundBLItemInput `json:"p_bl_items,omitempty"`
}

type updateOutboundRPCRequest struct {
	OutboundID string                 `json:"p_outbound_id"`
	Outbound   UpdateOutboundRequest  `json:"p_outbound"`
	BLItems    *[]OutboundBLItemInput `json:"p_bl_items,omitempty"`
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

// init — D-20260512-090000 feature self-mounting.
// Mount 클로저가 OutboundHandler 인스턴스를 자체 생성한다. AssistantHandler 의 WithWriters
// alias (Phase 6) 도 별도 인스턴스를 만들 예정 — 핸들러가 stateless 라 인스턴스 중복 무해.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDTxOutbound,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewOutboundHandler(d.DB, d.Engine)
			h.BaroCompany = d.BaroCompany
			g := d.Gates
			r.Route("/outbounds", func(r chi.Router) {
				r.Get("/", h.List)
				r.Get("/summary", h.Summary)
				// 대시보드 집계 — KPI / trend24 / breakdown / sale conversion 한 번에.
				// 정적 경로라 /{id} 보다 먼저 등록.
				r.Get("/dashboard", h.Dashboard)
				r.Get("/{id}", h.GetByID)
				// D-064 PR 29: ERP FIFO 매칭(입고 LOT ↔ 출고) 라인 + 합계
				r.Get("/{id}/fifo-matches", h.FifoMatches)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Put("/{id}", h.Update)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
		},
	})
}

func (h *OutboundHandler) FetchOutboundByID(id string) (Outbound, error) {
	data, _, err := h.DB.From("outbounds").
		Select("*", "exact", false).
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		return Outbound{}, err
	}

	var outbounds []Outbound
	if err := json.Unmarshal(data, &outbounds); err != nil {
		return Outbound{}, err
	}
	if len(outbounds) == 0 {
		return Outbound{}, errOutboundNotFound
	}

	enriched, err := h.enrichOutbounds(outbounds)
	if err != nil {
		return Outbound{}, err
	}
	ob := enriched[0]
	ob.BLItems = h.fetchBLItems(id)
	return ob, nil
}

type outboundBLNumberRow struct {
	BLID     string `json:"bl_id"`
	BLNumber string `json:"bl_number"`
}

func (h *OutboundHandler) fetchBLNumberMap() map[string]string {
	data, _, err := h.DB.From("bl_shipments").
		Select("bl_id, bl_number", "exact", false).
		Execute()
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

func withBLNumbers(items []OutboundBLItem, blNumbers map[string]string) []OutboundBLItem {
	for i := range items {
		if number, ok := blNumbers[items[i].BLID]; ok {
			blNumber := number
			items[i].BLNumber = &blNumber
		}
	}
	return items
}

// fetchBLItems — outbound_bl_items 조회 헬퍼
func (h *OutboundHandler) fetchBLItems(outboundID string) []OutboundBLItem {
	data, _, err := h.DB.From("outbound_bl_items").
		Select("*", "exact", false).
		Eq("outbound_id", outboundID).
		Execute()
	if err != nil {
		return nil
	}
	var items []OutboundBLItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil
	}
	return withBLNumbers(items, h.fetchBLNumberMap())
}

func (h *OutboundHandler) fetchBLItemsByOutbound() map[string][]OutboundBLItem {
	data, _, err := h.DB.From("outbound_bl_items").
		Select("*", "exact", false).
		Execute()
	if err != nil {
		return map[string][]OutboundBLItem{}
	}
	var items []OutboundBLItem
	if err := json.Unmarshal(data, &items); err != nil {
		return map[string][]OutboundBLItem{}
	}
	items = withBLNumbers(items, h.fetchBLNumberMap())
	result := make(map[string][]OutboundBLItem)
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

// outboundsBaseTable — 읽기 경로(List/Summary/Dashboard) 가 쿼리할 베이스 뷰 이름.
//
// 마이그 112 의 outbounds_with_meta — outbounds 에 products/orders/warehouses/companies
// 메타 컬럼(product_code/name, product_manufacturer_id, order_number, warehouse_name,
// target_company_name/code) 을 LEFT JOIN 으로 노출. q 검색·제조사 필터를 server-side
// 술어로 풀 수 있게 한다 (Go 측 UUID 리스트 IN URL 폭주 회피).
//
// sale_unregistered 는 마이그 110(112 에서 base 갱신) 의 outbounds_sale_unregistered.
// 같은 view 기반이라 q 검색·제조사 필터가 그대로 통과한다.
//
// 쓰기(Create/Update/Delete) 는 outbounds 테이블 직접 (이 함수 미사용).
func outboundsBaseTable(r *http.Request) string {
	if r.URL.Query().Get("work_queue") == "sale_unregistered" {
		return "outbounds_sale_unregistered"
	}
	return "outbounds_with_meta"
}

// baroOwnsOutboundOr404 — BARO 토큰일 때만 outbound 소유권을 검증한다 (D-108 격리 강화).
//
//   - module/cable/topsolar 토큰: 항상 true (검증 안 함).
//   - BARO 토큰 + outbound.company_id == BR: true.
//   - BARO 토큰 + BR 법인이 마스터에 없거나 룩업 실패: 404 + false.
//   - BARO 토큰 + outbound 가 module 소유 (또는 존재하지 않음): 404 + false.
//
// 404 를 일관 반환 — BARO 에게 module 출고의 *존재 자체*를 숨긴다 (403 으로 알려주지 않음).
// 호출자: GetByID / FifoMatches / Update / Delete 시작점.
func (h *OutboundHandler) baroOwnsOutboundOr404(w http.ResponseWriter, r *http.Request, outboundID string) bool {
	if middleware.GetTenantScope(r.Context()) != middleware.TenantScopeBaro {
		return true
	}
	if h.BaroCompany == nil {
		log.Printf("[BARO 출고 소유권 검증] BaroCompany resolver 미주입")
		response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
		return false
	}
	baroID, err := h.BaroCompany.Resolve()
	if err != nil {
		log.Printf("[BARO 출고 소유권 검증] BR 법인 룩업 실패: %v", err)
		response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
		return false
	}
	data, _, err := h.DB.From("outbounds").
		Select(dbschema.OutboundsColCompanyId, "exact", false).
		Eq(dbschema.OutboundsColOutboundId, outboundID).
		Limit(1, "").
		Execute()
	if err != nil {
		log.Printf("[BARO 출고 소유권 검증] DB 조회 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "소유권 검증 실패")
		return false
	}
	var rows []struct {
		CompanyID string `json:"company_id"`
	}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 || rows[0].CompanyID != baroID {
		response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
		return false
	}
	return true
}

// baroEnforceCompanyOnCreate — BARO 토큰이 출고를 등록할 때 company_id 를 BR 로 강제.
// 클라이언트가 module company_id 를 보내도 무시하고 BR 로 교체. BR 룩업 실패 시 false 반환
// (호출자가 400/500 응답). module 토큰은 통과 (변경 없음).
func (h *OutboundHandler) baroEnforceCompanyOnCreate(w http.ResponseWriter, r *http.Request, req *CreateOutboundRequest) bool {
	if middleware.GetTenantScope(r.Context()) != middleware.TenantScopeBaro {
		return true
	}
	if h.BaroCompany == nil {
		response.RespondError(w, http.StatusServiceUnavailable, "BR 법인 마스터 확인 불가")
		return false
	}
	baroID, err := h.BaroCompany.Resolve()
	if err != nil {
		response.RespondError(w, http.StatusServiceUnavailable, "BR 법인 마스터 확인 불가")
		return false
	}
	if req.CompanyID != baroID {
		log.Printf("[BARO 출고 생성] company_id 강제 교체 %s -> %s", req.CompanyID, baroID)
		req.CompanyID = baroID
	}
	return true
}

func (h *OutboundHandler) fetchOutboundRecord(id string) (Outbound, bool, error) {
	data, _, err := h.DB.From("outbounds").
		Select("*", "exact", false).
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		return Outbound{}, false, err
	}

	var rows []Outbound
	if err := json.Unmarshal(data, &rows); err != nil {
		return Outbound{}, false, err
	}
	if len(rows) == 0 {
		return Outbound{}, false, nil
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

func (h *OutboundHandler) enrichOutbounds(outbounds []Outbound) ([]Outbound, error) {
	if len(outbounds) == 0 {
		return outbounds, nil
	}
	var products []outboundProductRow
	var warehouses []outboundWarehouseRow
	var companies []outboundCompanyRow
	var orders []outboundOrderRow
	var partners []outboundPartnerRow
	var sales []sale.Sale

	if data, _, err := h.DB.From("products").Select("product_id, product_name, product_code, spec_wp, wattage_kw, manufacturer_id", "exact", false).Execute(); err != nil {
		return nil, fmt.Errorf("products 조회 실패: %w", err)
	} else if err := json.Unmarshal(data, &products); err != nil {
		return nil, fmt.Errorf("products 디코딩 실패: %w", err)
	}
	var manufacturers []outboundManufacturerRow
	if data, _, err := h.DB.From("manufacturers").Select("manufacturer_id, name_kr, short_name", "exact", false).Execute(); err != nil {
		return nil, fmt.Errorf("manufacturers 조회 실패: %w", err)
	} else if err := json.Unmarshal(data, &manufacturers); err != nil {
		return nil, fmt.Errorf("manufacturers 디코딩 실패: %w", err)
	}
	if data, _, err := h.DB.From("warehouses").Select("warehouse_id, warehouse_name", "exact", false).Execute(); err != nil {
		return nil, fmt.Errorf("warehouses 조회 실패: %w", err)
	} else if err := json.Unmarshal(data, &warehouses); err != nil {
		return nil, fmt.Errorf("warehouses 디코딩 실패: %w", err)
	}
	if data, _, err := h.DB.From("companies").Select("company_id, company_name", "exact", false).Execute(); err != nil {
		return nil, fmt.Errorf("companies 조회 실패: %w", err)
	} else if err := json.Unmarshal(data, &companies); err != nil {
		return nil, fmt.Errorf("companies 디코딩 실패: %w", err)
	}
	if data, _, err := h.DB.From("orders").Select("order_id, order_number, customer_id, unit_price_wp", "exact", false).Execute(); err != nil {
		return nil, fmt.Errorf("orders 조회 실패: %w", err)
	} else if err := json.Unmarshal(data, &orders); err != nil {
		return nil, fmt.Errorf("orders 디코딩 실패: %w", err)
	}
	if data, _, err := h.DB.From("partners").Select("partner_id, partner_name", "exact", false).Execute(); err != nil {
		return nil, fmt.Errorf("partners 조회 실패: %w", err)
	} else if err := json.Unmarshal(data, &partners); err != nil {
		return nil, fmt.Errorf("partners 디코딩 실패: %w", err)
	}
	if data, _, err := h.DB.From("sales").Select("*", "exact", false).Neq("status", "cancelled").Execute(); err != nil {
		return nil, fmt.Errorf("sales 조회 실패: %w", err)
	} else if err := json.Unmarshal(data, &sales); err != nil {
		return nil, fmt.Errorf("sales 디코딩 실패: %w", err)
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
	saleMap := make(map[string]sale.Sale, len(sales))
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
// outbounds_with_meta(마이그 112) 가 product_code/name, order_number, warehouse_name,
// target_company_name/code 를 view 컬럼으로 노출하므로 모두 server-side ilike OR
// 한 번에 처리. 과거엔 4 개 마스터 테이블에서 UUID 리스트를 따로 끌어와
// outbounds.<fk>.in.(...) 으로 합쳤다 — 매칭이 많을 때 URL 폭주 (PR #806 동일 패턴).
func (h *OutboundHandler) applyOutboundSearch(query *postgrest.FilterBuilder, q string) (*postgrest.FilterBuilder, bool, error) {
	clauses := []string{
		fmt.Sprintf("site_name.ilike.*%s*", q),
		fmt.Sprintf("erp_outbound_no.ilike.*%s*", q),
		fmt.Sprintf("product_code.ilike.*%s*", q),
		fmt.Sprintf("product_name.ilike.*%s*", q),
		fmt.Sprintf("order_number.ilike.*%s*", q),
		fmt.Sprintf("warehouse_name.ilike.*%s*", q),
		fmt.Sprintf("target_company_name.ilike.*%s*", q),
		fmt.Sprintf("target_company_code.ilike.*%s*", q),
	}
	return query.Or(strings.Join(clauses, ","), ""), true, nil
}

// applyOutboundWorkQueue — work_queue 별 추가 필터.
// sale_unregistered 의 본체(상품판매 + 매출 미연결)는 outboundsBaseTable 가 가리키는
// outbounds_sale_unregistered 뷰가 DB-side 로 처리한다 (마이그 110). 여기서는 status
// 기본값(active) 만 핸들러 단에 남겨 사용자 status override 를 보존.
func (h *OutboundHandler) applyOutboundWorkQueue(r *http.Request, query *postgrest.FilterBuilder) (*postgrest.FilterBuilder, bool, error) {
	switch r.URL.Query().Get("work_queue") {
	case "":
		return query, true, nil
	case "sale_unregistered":
		if r.URL.Query().Get("status") == "" {
			query = query.Eq(dbschema.OutboundsColStatus, "active")
		}
		return query, true, nil
	default:
		return query, false, nil
	}
}

// applyOutboundFilters — List 와 Summary 가 공유하는 필터 로직.
// q/manufacturer_id 처리에 추가 DB 호출이 발생할 수 있어 (success bool, err) 시그니처로 빈 결과를 신호한다.
//
// BARO 격리 (D-108): BARO 토큰일 때는 클라이언트가 보낸 company_id 를 무시하고 항상 BR
// 법인으로 강제 필터. company_code='BR' 룩업 실패(마스터 미등록 / DB 에러)는 빈 결과로
// fail-closed — module 데이터가 한 행도 새지 않도록.
func (h *OutboundHandler) applyOutboundFilters(r *http.Request, query *postgrest.FilterBuilder) (*postgrest.FilterBuilder, bool, error) {
	if middleware.GetTenantScope(r.Context()) == middleware.TenantScopeBaro {
		if h.BaroCompany == nil {
			log.Printf("[BARO 출고 격리] BaroCompany resolver 미주입 — 핸들러 마운트 점검 필요")
			return query, false, nil
		}
		baroID, err := h.BaroCompany.Resolve()
		if err != nil {
			log.Printf("[BARO 출고 격리] BR 법인 룩업 실패 — 빈 결과 반환: %v", err)
			return query, false, nil
		}
		query = query.Eq(dbschema.OutboundsColCompanyId, baroID)
	} else if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		query = query.Eq(dbschema.OutboundsColCompanyId, compID)
	}
	if whID := r.URL.Query().Get("warehouse_id"); whID != "" {
		query = query.Eq(dbschema.OutboundsColWarehouseId, whID)
	}
	if usage := r.URL.Query().Get("usage_category"); usage != "" {
		query = query.Eq(dbschema.OutboundsColUsageCategory, usage)
	}
	if orderID := r.URL.Query().Get("order_id"); orderID != "" {
		query = query.Eq(dbschema.OutboundsColOrderId, orderID)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq(dbschema.OutboundsColStatus, status)
	}
	// 기간 필터 — outbound_date 기준 [start, end] inclusive.
	if start := r.URL.Query().Get("start"); start != "" {
		query = query.Gte(dbschema.OutboundsColOutboundDate, start)
	}
	if end := r.URL.Query().Get("end"); end != "" {
		query = query.Lte(dbschema.OutboundsColOutboundDate, end)
	}
	// 용량(kW) 범위 — outbounds.capacity_kw 기준 [min_kw, max_kw] inclusive.
	if minKw := r.URL.Query().Get("min_kw"); minKw != "" {
		if _, err := strconv.ParseFloat(minKw, 64); err == nil {
			query = query.Gte(dbschema.OutboundsColCapacityKw, minKw)
		}
	}
	if maxKw := r.URL.Query().Get("max_kw"); maxKw != "" {
		if _, err := strconv.ParseFloat(maxKw, 64); err == nil {
			query = query.Lte(dbschema.OutboundsColCapacityKw, maxKw)
		}
	}

	var ok bool
	var err error
	query, ok, err = h.applyOutboundWorkQueue(r, query)
	if err != nil {
		return query, false, err
	}
	if !ok {
		return query, false, nil
	}

	// manufacturer_id: outbounds_with_meta(마이그 112) 가 view 컬럼으로 노출.
	// 과거엔 products.product_id IN (...) 으로 우회 — 한 제조사 product 가 많을 때 폭주 위험.
	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		query = query.Eq("product_manufacturer_id", mfgID)
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
//   - q:            site_name/erp_outbound_no 및 product/order/warehouse/상대법인 이름 검색
//   - company_id/warehouse_id/usage_category/order_id/status/manufacturer_id: 등치 필터
//
// 응답 헤더 X-Total-Count 로 필터 후 전체 건수 노출.
func (h *OutboundHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From(outboundsBaseTable(r)).Select("*", "exact", false)
	query, ok, err := h.applyOutboundFilters(r, query)
	if err != nil {
		log.Printf("[출고 목록 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 목록 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		w.Header().Set("X-Total-Count", "0")
		response.RespondJSON(w, http.StatusOK, []Outbound{})
		return
	}

	sortCol, asc := parseOutboundSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := handlerutil.ParseLimitOffset(r, outboundDefaultLimit, outboundMaxLimit)
	query = query.Range(offset, offset+limit-1, "")

	data, count, err := query.Execute()
	if err != nil {
		log.Printf("[출고 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 목록 조회에 실패했습니다")
		return
	}

	var outbounds []Outbound
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
	blItemsByOutbound := h.fetchBLItemsByOutbound()
	for i := range outbounds {
		outbounds[i].BLItems = blItemsByOutbound[outbounds[i].OutboundID]
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, outbounds)
}

// OutboundSummary — KPI 카드용 집계 응답.
// 매출 합계와 계산서 미발행 건수는 sales 테이블에서 outbound 단위로 조인 집계한다.
type OutboundSummary struct {
	Total               int64   `json:"total"`
	ActiveCount         int64   `json:"active_count"`
	CancelPendingCount  int64   `json:"cancel_pending_count"`
	CancelledCount      int64   `json:"cancelled_count"`
	SaleAmountSum       float64 `json:"sale_amount_sum"`
	InvoicePendingCount int64   `json:"invoice_pending_count"`
}

// Summary — GET /api/v1/outbounds/summary — KPI 카드용 집계.
// List 와 동일한 필터(company_id, warehouse_id, usage_category, manufacturer_id, q) 를 받아
// 페이지 사이즈에 무관하게 전체에 대한 카운트/합계를 돌려준다.
func (h *OutboundHandler) Summary(w http.ResponseWriter, r *http.Request) {
	// 출고 카운트 — head=true 로 본문 없이 X-Total-Count 만 받는다 (전체).
	baseTable := outboundsBaseTable(r)
	totalQ := h.DB.From(baseTable).Select("outbound_id", "exact", true)
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
	//
	// 회귀 가드: postgrest-go .Eq() 는 params map 이라 같은 컬럼 두 번 호출 시 덮어쓰기 된다.
	// applyOutboundFilters 가 사용자 status 를 이미 적용했으면 여기서 다시 .Eq("status", ...) 를
	// 부르면 덮어써져서 다른 status 의 전역 카운트가 채워진다. user_status 가 set 일 때는 그 값에
	// 일치하는 버킷만 채우고 나머지는 0 으로 둔다 (= 위 주석의 "의도").
	userStatus := r.URL.Query().Get("status")
	for _, st := range []struct {
		key    string
		target *int64
	}{
		{"active", &summary.ActiveCount},
		{"cancel_pending", &summary.CancelPendingCount},
		{"cancelled", &summary.CancelledCount},
	} {
		if userStatus != "" && userStatus != st.key {
			continue
		}
		q := h.DB.From(baseTable).Select("outbound_id", "exact", true)
		q, ok2, err := h.applyOutboundFilters(r, q)
		if err != nil || !ok2 {
			continue
		}
		if userStatus == "" {
			q = q.Eq(dbschema.OutboundsColStatus, st.key)
		}
		if _, c, err := q.Range(0, 0, "").Execute(); err == nil {
			*st.target = c
		}
	}

	// 매출 합계와 계산서 미발행 건수는 sales 에서 직접 집계.
	// outbound 필터를 sales.outbound_id 로 재투영하기 위해 List 와 같은 필터로 outbound_id 후보를
	// 끌어온 뒤 sales 에서 IN 으로 거른다. 한 URL 에 모든 UUID 를 넣으면 Cloudflare 한도 초과로
	// 평문 400 → 디코딩 실패. handlerutil.StringBatches 로 분할 호출해 회피.
	//
	// InvoicePendingCount 는 "outbound 단위" 로 센다 (D-102 정의):
	//   - 매출 row 자체가 없는 출고 → 미발행
	//   - 매출이 있어도 모든 sale 의 tax_invoice_date 가 null → 미발행
	//   - tax_invoice_date 가 채워진 sale 이 하나라도 있으면 → 발행 (제외)
	idQ := h.DB.From(baseTable).Select("outbound_id", "exact", false)
	idQ, ok3, err := h.applyOutboundFilters(r, idQ)
	if err == nil && ok3 {
		idRows, _, ferr := handlerutil.FetchAllSummaryRows[struct {
			OutboundID string `json:"outbound_id"`
		}](func() *postgrest.FilterBuilder {
			q := h.DB.From(baseTable).Select("outbound_id", "exact", false)
			q, _, _ = h.applyOutboundFilters(r, q)
			return q
		})
		if ferr == nil && len(idRows) > 0 {
			ids := make([]string, 0, len(idRows))
			for _, row := range idRows {
				ids = append(ids, row.OutboundID)
			}
			issuedOutbounds := make(map[string]struct{})
			// URL 한도 회피용 200/청크 (UUID 36 char → 200 × 37 ≈ 7.4KB 안전).
			for _, batch := range handlerutil.StringBatches(ids, outboundSummaryBatchSize) {
				saleData, _, serr := h.DB.From("sales").
					Select("supply_amount, tax_invoice_date, outbound_id", "exact", false).
					In("outbound_id", batch).
					Neq("status", "cancelled").
					Execute()
				if serr != nil {
					log.Printf("[출고 요약 - sales 청크 조회 실패] %v", serr)
					break
				}
				var sales []struct {
					SupplyAmount   *float64 `json:"supply_amount"`
					TaxInvoiceDate *string  `json:"tax_invoice_date"`
					OutboundID     *string  `json:"outbound_id"`
				}
				if json.Unmarshal(saleData, &sales) != nil {
					continue
				}
				for _, s := range sales {
					if s.SupplyAmount != nil {
						summary.SaleAmountSum += *s.SupplyAmount
					}
					if s.TaxInvoiceDate != nil && s.OutboundID != nil {
						issuedOutbounds[*s.OutboundID] = struct{}{}
					}
				}
			}
			summary.InvoicePendingCount = int64(len(ids) - len(issuedOutbounds))
		}
	}

	response.RespondJSON(w, http.StatusOK, summary)
}

// GetByID — GET /api/v1/outbounds/{id} — 출고 상세 조회
func (h *OutboundHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.baroOwnsOutboundOr404(w, r, id) {
		return
	}

	ob, err := h.FetchOutboundByID(id)
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
	var req CreateOutboundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[출고 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if !h.baroEnforceCompanyOnCreate(w, r, &req) {
		return
	}

	created, code, msg, err := h.CreateOutboundCore(req)
	if err != nil {
		response.RespondError(w, code, msg)
		return
	}
	audit.WriteLog(h.DB, r, "outbounds", created.OutboundID, "create", nil, audit.RawFromValue(created), "")
	response.RespondJSON(w, code, created)
}

// CreateOutboundCore — Create 핸들러와 AI 도우미 ConfirmProposal이 공유하는 핵심 로직.
// status 기본값/검증/재고 체크/트랜잭션 RPC/결과 조회까지 수행한다.
// audit log 기록은 호출 측에서 (요청 컨텍스트가 필요하므로).
// 반환: (생성된 출고, HTTP status code, 사용자용 메시지, error). err==nil이면 code는 201.
func (h *OutboundHandler) CreateOutboundCore(req CreateOutboundRequest) (Outbound, int, string, error) {
	if req.Status == "" {
		req.Status = "active"
	}
	if msg := req.Validate(); msg != "" {
		return Outbound{}, http.StatusBadRequest, msg, fmt.Errorf("validate: %s", msg)
	}

	if status, msg, err := h.ensureOutboundStockAvailable(req.CompanyID, req.ProductID, req.Quantity, req.CapacityKw, req.Status, 0); err != nil {
		log.Printf("[출고 등록 재고 검증 실패] company_id=%s product_id=%s err=%v", req.CompanyID, req.ProductID, err)
		return Outbound{}, status, msg, err
	}

	blItems := req.BLItems
	req.BLItems = nil
	var blItemsParam *[]OutboundBLItemInput
	if blItems != nil {
		blItemsParam = &blItems
	}

	outboundID := uuid.NewString()
	if err := rpcutil.CallRPC(h.DB, "sf_create_outbound", createOutboundRPCRequest{
		OutboundID: outboundID,
		Outbound:   req,
		BLItems:    blItemsParam,
	}); err != nil {
		log.Printf("[출고 트랜잭션 등록 실패] outbound_id=%s err=%v", outboundID, err)
		return Outbound{}, http.StatusInternalServerError, "출고 등록에 실패했습니다", err
	}

	created, err := h.FetchOutboundByID(outboundID)
	if err != nil {
		log.Printf("[출고 등록 결과 조회 실패] outbound_id=%s err=%v", outboundID, err)
		return Outbound{}, http.StatusInternalServerError, "출고 등록 결과를 확인할 수 없습니다", err
	}
	if err := h.ensurePickingListForOutbound(created); err != nil {
		log.Printf("[WMS 피킹 자동 생성 실패] outbound_id=%s err=%v", outboundID, err)
	}
	return created, http.StatusCreated, "", nil
}

// Update — PUT /api/v1/outbounds/{id} — 출고 수정
func (h *OutboundHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.baroOwnsOutboundOr404(w, r, id) {
		return
	}

	var req UpdateOutboundRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[출고 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	oldSnapshot, _, oldErr := audit.Snapshot(h.DB, "outbounds", "outbound_id", id)
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
	var blItemsParam *[]OutboundBLItemInput
	if blItems != nil {
		blItemsParam = &blItems
	}

	if err := rpcutil.CallRPC(h.DB, "sf_update_outbound", updateOutboundRPCRequest{
		OutboundID: id,
		Outbound:   req,
		BLItems:    blItemsParam,
	}); err != nil {
		log.Printf("[출고 트랜잭션 수정 실패] outbound_id=%s err=%v", id, err)
		if rpcutil.IsRPCNotFound(err) {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 수정에 실패했습니다")
		return
	}

	updated, err := h.FetchOutboundByID(id)
	if err != nil {
		log.Printf("[출고 수정 결과 조회 실패] outbound_id=%s err=%v", id, err)
		if errors.Is(err, errOutboundNotFound) {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 수정 결과를 확인할 수 없습니다")
		return
	}
	audit.EntityByRouteID(h.DB, r, "outbounds", "outbound_id", "update", oldSnapshot, audit.RawFromValue(updated), "")
	response.RespondJSON(w, http.StatusOK, updated)
}

// Delete — DELETE /api/v1/outbounds/{id} — 출고 취소 처리
func (h *OutboundHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if !h.baroOwnsOutboundOr404(w, r, id) {
		return
	}

	oldSnapshot, _, oldErr := audit.Snapshot(h.DB, "outbounds", "outbound_id", id)
	if oldErr != nil {
		log.Printf("[출고 취소 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	var linkedSales []sale.Sale
	if saleData, _, err := h.DB.From("sales").Select("*", "exact", false).Eq(dbschema.SalesColOutboundId, id).Execute(); err == nil {
		if err := json.Unmarshal(saleData, &linkedSales); err != nil {
			log.Printf("[출고 취소 전 매출 스냅샷 디코딩 실패] outbound_id=%s err=%v", id, err)
		}
	} else {
		log.Printf("[출고 취소 전 매출 스냅샷 조회 실패] outbound_id=%s err=%v", id, err)
	}

	if err := rpcutil.CallRPC(h.DB, "sf_delete_outbound", deleteOutboundRPCRequest{OutboundID: id}); err != nil {
		log.Printf("[출고 트랜잭션 취소 실패] id=%s, err=%v", id, err)
		if rpcutil.IsRPCNotFound(err) {
			response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
			return
		}
		response.RespondError(w, http.StatusInternalServerError, "출고 취소에 실패했습니다")
		return
	}

	newSnapshot, _, snapErr := audit.Snapshot(h.DB, "outbounds", "outbound_id", id)
	if snapErr != nil {
		log.Printf("[출고 취소 후 감사 스냅샷 조회 실패] id=%s err=%v", id, snapErr)
	}
	audit.EntityByRouteID(h.DB, r, "outbounds", "outbound_id", "delete", oldSnapshot, newSnapshot, "soft_cancel")

	for _, sale := range linkedSales {
		action := "update"
		note := "outbound_soft_cancel_detach"
		if sale.OrderID == nil || *sale.OrderID == "" {
			action = "delete"
			note = "outbound_soft_cancel"
		}
		after, found, afterErr := audit.Snapshot(h.DB, "sales", "sale_id", sale.SaleID)
		if afterErr != nil {
			log.Printf("[출고 취소 후 매출 감사 스냅샷 조회 실패] sale_id=%s err=%v", sale.SaleID, afterErr)
		}
		if !found {
			after = nil
		}
		audit.WriteLog(h.DB, r, "sales", sale.SaleID, action, audit.RawFromValue(sale), after, note)
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "cancelled"})
}
