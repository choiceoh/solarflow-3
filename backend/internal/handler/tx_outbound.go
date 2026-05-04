package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// outboundDefaultLimit / outboundMaxLimit — Supabase Cloud PostgREST 가 강제하는
// db-max-rows=1000 가드를 그대로 따라 단일 응답 최대 1000행으로 클램프한다.
// 1000 초과는 프론트에서 offset 을 증가시키며 청크 호출로 누적한다.
const (
	outboundDefaultLimit = 1000
	outboundMaxLimit     = 1000
)

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

func withBLNumbers(items []model.OutboundBLItem, blNumbers map[string]string) []model.OutboundBLItem {
	for i := range items {
		if number, ok := blNumbers[items[i].BLID]; ok {
			blNumber := number
			items[i].BLNumber = &blNumber
		}
	}
	return items
}

// fetchBLItems — outbound_bl_items 조회 헬퍼
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
	return withBLNumbers(items, h.fetchBLNumberMap())
}

func (h *OutboundHandler) fetchBLItemsByOutbound() map[string][]model.OutboundBLItem {
	data, _, err := h.DB.From("outbound_bl_items").
		Select("*", "exact", false).
		Execute()
	if err != nil {
		return map[string][]model.OutboundBLItem{}
	}
	var items []model.OutboundBLItem
	if err := json.Unmarshal(data, &items); err != nil {
		return map[string][]model.OutboundBLItem{}
	}
	items = withBLNumbers(items, h.fetchBLNumberMap())
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
	var products []outboundProductRow
	var warehouses []outboundWarehouseRow
	var companies []outboundCompanyRow
	var orders []outboundOrderRow
	var partners []outboundPartnerRow
	var sales []model.Sale

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

// parseLimitOffset — ?limit, ?offset 파싱 + 클램프. 호환성 유지 위해 미지정 시 기본 1000.
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

// List — GET /api/v1/outbounds — 출고 목록 조회
// 비유: 출고 관리실에서 출고 전표를 페이지 단위로 꺼내 보여주는 것
// ?limit (기본·최대 1000), ?offset (기본 0) 으로 페이지네이션. 전체 건수는 X-Total-Count 헤더.
func (h *OutboundHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("outbounds").
		Select("*", "exact", false)

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

	// manufacturer_id 는 outbounds 컬럼이 아니므로 products → product_id IN (...) 으로 변환해 DB-level 적용.
	// 페이지네이션이 정확히 동작하려면 enrichment 후 클라이언트 필터로는 안 됨 (페이지마다 결과 수 달라짐).
	if mfgID := r.URL.Query().Get("manufacturer_id"); mfgID != "" {
		productIDs, err := h.productIDsByManufacturer(mfgID)
		if err != nil {
			log.Printf("[출고 목록 - 제조사 필터 product_id 조회 실패] %v", err)
			response.RespondError(w, http.StatusInternalServerError, "제조사 필터 처리에 실패했습니다")
			return
		}
		if len(productIDs) == 0 {
			w.Header().Set("X-Total-Count", "0")
			response.RespondJSON(w, http.StatusOK, []model.Outbound{})
			return
		}
		query = query.In("product_id", productIDs)
	}

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
	blItemsByOutbound := h.fetchBLItemsByOutbound()
	for i := range outbounds {
		outbounds[i].BLItems = blItemsByOutbound[outbounds[i].OutboundID]
	}

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, outbounds)
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

// createOutboundCore — Create 핸들러가 사용하는 핵심 로직.
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
