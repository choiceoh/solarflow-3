package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// OutboundHandler — 출고(outbounds) 관련 API를 처리하는 핸들러
// 비유: "출고 관리실" — 창고에서 현장/고객으로 나가는 모듈 출고를 관리
// TODO: Rust 계산엔진 연동 — 재고 차감 검증 (가용재고 >= 출고수량)
// TODO: 그룹 내 거래 — 출고 시 상대 법인 입고 자동 생성
type OutboundHandler struct {
	DB *supa.Client
}

// NewOutboundHandler — OutboundHandler 생성자
func NewOutboundHandler(db *supa.Client) *OutboundHandler {
	return &OutboundHandler{DB: db}
}

// insertBLItems — outbound_bl_items 일괄 등록 헬퍼
func (h *OutboundHandler) insertBLItems(outboundID string, items []model.OutboundBLItemInput) {
	for _, item := range items {
		if item.BLID == "" || item.Quantity <= 0 {
			continue
		}
		row := map[string]interface{}{
			"outbound_id": outboundID,
			"bl_id":       item.BLID,
			"quantity":    item.Quantity,
		}
		_, _, err := h.DB.From("outbound_bl_items").
			Insert(row, false, "", "", "").
			Execute()
		if err != nil {
			log.Printf("[outbound_bl_items 등록 실패] outbound_id=%s bl_id=%s err=%v", outboundID, item.BLID, err)
		}
	}
}

// fetchBLItems — outbound_bl_items 조회 헬퍼 (bl_shipments 조인 없이 단순 조회)
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
	return items
}

type outboundOrderProgressRow struct {
	Quantity int    `json:"quantity"`
	Status   string `json:"status"`
}

type outboundQuantityRow struct {
	Quantity int `json:"quantity"`
}

type outboundProductRow struct {
	ProductID   string   `json:"product_id"`
	ProductName string   `json:"product_name"`
	ProductCode string   `json:"product_code"`
	SpecWp      *float64 `json:"spec_wp"`
	WattageKw   *float64 `json:"wattage_kw"`
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

func (h *OutboundHandler) recalculateOrderProgress(orderID string) error {
	if orderID == "" {
		return nil
	}

	orderData, _, err := h.DB.From("orders").
		Select("quantity, status", "exact", false).
		Eq("order_id", orderID).
		Execute()
	if err != nil {
		return err
	}

	var orders []outboundOrderProgressRow
	if err := json.Unmarshal(orderData, &orders); err != nil {
		return err
	}
	if len(orders) == 0 || orders[0].Status == "cancelled" {
		return nil
	}

	outboundData, _, err := h.DB.From("outbounds").
		Select("quantity", "exact", false).
		Eq("order_id", orderID).
		Eq("status", "active").
		Execute()
	if err != nil {
		return err
	}

	var outbounds []outboundQuantityRow
	if err := json.Unmarshal(outboundData, &outbounds); err != nil {
		return err
	}

	shippedQty := 0
	for _, ob := range outbounds {
		shippedQty += ob.Quantity
	}
	remainingQty := orders[0].Quantity - shippedQty
	if remainingQty < 0 {
		remainingQty = 0
	}

	status := "received"
	if shippedQty > 0 && remainingQty > 0 {
		status = "partial"
	} else if shippedQty > 0 && remainingQty == 0 {
		status = "completed"
	}

	_, _, err = h.DB.From("orders").
		Update(map[string]interface{}{
			"shipped_qty":   shippedQty,
			"remaining_qty": remainingQty,
			"status":        status,
		}, "", "").
		Eq("order_id", orderID).
		Execute()
	return err
}

func outboundOrderIDString(orderID *string) string {
	if orderID == nil {
		return ""
	}
	return *orderID
}

func (h *OutboundHandler) enrichOutbounds(outbounds []model.Outbound) []model.Outbound {
	if len(outbounds) == 0 {
		return outbounds
	}
	var products []outboundProductRow
	var warehouses []outboundWarehouseRow
	var companies []outboundCompanyRow
	var orders []outboundOrderRow
	var partners []outboundPartnerRow
	var sales []model.Sale

	if data, _, err := h.DB.From("products").Select("product_id, product_name, product_code, spec_wp, wattage_kw", "exact", false).Execute(); err == nil {
		_ = json.Unmarshal(data, &products)
	}
	if data, _, err := h.DB.From("warehouses").Select("warehouse_id, warehouse_name", "exact", false).Execute(); err == nil {
		_ = json.Unmarshal(data, &warehouses)
	}
	if data, _, err := h.DB.From("companies").Select("company_id, company_name", "exact", false).Execute(); err == nil {
		_ = json.Unmarshal(data, &companies)
	}
	if data, _, err := h.DB.From("orders").Select("order_id, order_number, customer_id, unit_price_wp", "exact", false).Execute(); err == nil {
		_ = json.Unmarshal(data, &orders)
	}
	if data, _, err := h.DB.From("partners").Select("partner_id, partner_name", "exact", false).Execute(); err == nil {
		_ = json.Unmarshal(data, &partners)
	}
	if data, _, err := h.DB.From("sales").Select("*", "exact", false).Execute(); err == nil {
		_ = json.Unmarshal(data, &sales)
	}

	productMap := make(map[string]outboundProductRow, len(products))
	for _, p := range products {
		productMap[p.ProductID] = p
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
	return outbounds
}

// List — GET /api/v1/outbounds — 출고 목록 조회
// 비유: 출고 관리실에서 전체 출고 전표를 꺼내 보여주는 것
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

	data, _, err := query.Execute()
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

	outbounds = h.enrichOutbounds(outbounds)
	response.RespondJSON(w, http.StatusOK, outbounds)
}

// GetByID — GET /api/v1/outbounds/{id} — 출고 상세 조회
func (h *OutboundHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("outbounds").
		Select("*", "exact", false).
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		log.Printf("[출고 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 조회에 실패했습니다")
		return
	}

	var outbounds []model.Outbound
	if err := json.Unmarshal(data, &outbounds); err != nil {
		log.Printf("[출고 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(outbounds) == 0 {
		response.RespondError(w, http.StatusNotFound, "출고를 찾을 수 없습니다")
		return
	}

	enriched := h.enrichOutbounds(outbounds)
	ob := enriched[0]
	ob.BLItems = h.fetchBLItems(id)
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

	if req.Status == "" {
		req.Status = "active"
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	// BLItems를 추출하고 nil로 설정해 PostgREST에 전달되지 않게 함
	blItems := req.BLItems
	req.BLItems = nil

	data, _, err := h.DB.From("outbounds").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[출고 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 등록에 실패했습니다")
		return
	}

	var created []model.Outbound
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[출고 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "출고 등록 결과를 확인할 수 없습니다")
		return
	}

	outboundID := created[0].OutboundID
	if len(blItems) > 0 {
		h.insertBLItems(outboundID, blItems)
	}
	if orderID := outboundOrderIDString(req.OrderID); orderID != "" {
		if err := h.recalculateOrderProgress(orderID); err != nil {
			log.Printf("[수주 출고 진행률 갱신 실패] order_id=%s err=%v", orderID, err)
			response.RespondError(w, http.StatusInternalServerError, "출고는 등록됐지만 수주 잔량 갱신에 실패했습니다")
			return
		}
	}

	created[0].BLItems = h.fetchBLItems(outboundID)
	response.RespondJSON(w, http.StatusCreated, created[0])
}

// Update — PUT /api/v1/outbounds/{id} — 출고 수정
func (h *OutboundHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	prevOrderID := ""
	if prevData, _, err := h.DB.From("outbounds").
		Select("order_id", "exact", false).
		Eq("outbound_id", id).
		Execute(); err == nil {
		var prev []model.Outbound
		if json.Unmarshal(prevData, &prev) == nil && len(prev) > 0 {
			prevOrderID = outboundOrderIDString(prev[0].OrderID)
		}
	} else {
		log.Printf("[출고 수정 전 수주 연결 조회 실패] id=%s err=%v", id, err)
	}

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

	// BLItems 추출 후 nil 처리
	blItems := req.BLItems
	req.BLItems = nil

	data, _, err := h.DB.From("outbounds").
		Update(req, "", "").
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		log.Printf("[출고 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 수정에 실패했습니다")
		return
	}

	var updated []model.Outbound
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[출고 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 출고를 찾을 수 없습니다")
		return
	}

	// bl_items가 제공된 경우 기존 항목 삭제 후 재등록
	if blItems != nil {
		_, _, _ = h.DB.From("outbound_bl_items").
			Delete("", "").
			Eq("outbound_id", id).
			Execute()
		h.insertBLItems(id, blItems)
	}

	updated[0].BLItems = h.fetchBLItems(id)
	orderIDs := map[string]bool{}
	if prevOrderID != "" {
		orderIDs[prevOrderID] = true
	}
	if newOrderID := outboundOrderIDString(updated[0].OrderID); newOrderID != "" {
		orderIDs[newOrderID] = true
	}
	for orderID := range orderIDs {
		if err := h.recalculateOrderProgress(orderID); err != nil {
			log.Printf("[수주 출고 진행률 갱신 실패] order_id=%s err=%v", orderID, err)
			response.RespondError(w, http.StatusInternalServerError, "출고는 수정됐지만 수주 잔량 갱신에 실패했습니다")
			return
		}
	}
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/outbounds/{id} — 출고 삭제
func (h *OutboundHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	deletedOrderID := ""
	if obData, _, err := h.DB.From("outbounds").
		Select("order_id", "exact", false).
		Eq("outbound_id", id).
		Execute(); err == nil {
		var outbounds []model.Outbound
		if json.Unmarshal(obData, &outbounds) == nil && len(outbounds) > 0 {
			deletedOrderID = outboundOrderIDString(outbounds[0].OrderID)
		}
	} else {
		log.Printf("[출고 삭제 전 수주 연결 조회 실패] id=%s err=%v", id, err)
	}

	// outbound_bl_items는 ON DELETE CASCADE로 자동 삭제
	// 수주 기준 계산서는 보존하고 outbound 연결만 해제한다. 출고만 있는 계산서는 같이 삭제한다.
	if saleData, _, err := h.DB.From("sales").Select("sale_id, order_id", "exact", false).Eq("outbound_id", id).Execute(); err == nil {
		var linkedSales []struct {
			SaleID  string  `json:"sale_id"`
			OrderID *string `json:"order_id"`
		}
		if json.Unmarshal(saleData, &linkedSales) == nil {
			for _, sale := range linkedSales {
				if sale.OrderID != nil && *sale.OrderID != "" {
					_, _, _ = h.DB.From("sales").
						Update(map[string]interface{}{"outbound_id": nil}, "", "").
						Eq("sale_id", sale.SaleID).
						Execute()
				} else {
					_, _, _ = h.DB.From("sales").
						Delete("", "").
						Eq("sale_id", sale.SaleID).
						Execute()
				}
			}
		}
	}

	_, _, err := h.DB.From("outbounds").
		Delete("", "").
		Eq("outbound_id", id).
		Execute()
	if err != nil {
		log.Printf("[출고 삭제 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "출고 삭제에 실패했습니다")
		return
	}
	if deletedOrderID != "" {
		if err := h.recalculateOrderProgress(deletedOrderID); err != nil {
			log.Printf("[수주 출고 진행률 갱신 실패] order_id=%s err=%v", deletedOrderID, err)
			response.RespondError(w, http.StatusInternalServerError, "출고는 삭제됐지만 수주 잔량 갱신에 실패했습니다")
			return
		}
	}

	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "deleted"})
}
