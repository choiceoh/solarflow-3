package handler

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// SaleHandler — 판매(sales) 관련 API를 처리하는 핸들러
// 비유: "판매 전표함" — 출고에 연결된 판매 금액, 세금계산서 정보를 관리
// Rust 마진/이익률 분석은 /api/v1/calc/margin-analysis 프록시가 담당한다.
type SaleHandler struct {
	DB *supa.Client
}

// NewSaleHandler — SaleHandler 생성자
func NewSaleHandler(db *supa.Client) *SaleHandler {
	return &SaleHandler{DB: db}
}

type saleStatusUpdate struct {
	Status string `json:"status"`
}

// List — GET /api/v1/sales — 판매 목록 조회
// 비유: 판매 전표함에서 전체 판매 내역을 꺼내 보여주는 것
// TODO: 세금계산서 미발행 목록 필터 (tax_invoice_date IS NULL + outbound completed)
func (h *SaleHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("sales").
		Select("*", "exact", false)

	// 비유: ?outbound_id=xxx — 특정 출고의 판매만 필터
	if outID := r.URL.Query().Get("outbound_id"); outID != "" {
		query = query.Eq("outbound_id", outID)
	}
	if orderID := r.URL.Query().Get("order_id"); orderID != "" {
		query = query.Eq("order_id", orderID)
	}

	// 비유: ?customer_id=xxx — 특정 고객의 판매만 필터
	if custID := r.URL.Query().Get("customer_id"); custID != "" {
		query = query.Eq("customer_id", custID)
	}

	// 비유: ?erp_closed=true — ERP 마감 여부 필터
	if erpClosed := r.URL.Query().Get("erp_closed"); erpClosed != "" {
		query = query.Eq("erp_closed", erpClosed)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	} else {
		query = query.Neq("status", "cancelled")
	}

	data, _, err := query.Execute()
	if err != nil {
		log.Printf("[판매 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 목록 조회에 실패했습니다")
		return
	}

	var sales []model.Sale
	if err := json.Unmarshal(data, &sales); err != nil {
		log.Printf("[판매 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	items := h.enrichSales(sales)
	companyID := r.URL.Query().Get("company_id")
	month := r.URL.Query().Get("month")
	invoiceStatus := r.URL.Query().Get("invoice_status")
	statusFilter := r.URL.Query().Get("status")
	filtered := make([]model.SaleListItem, 0, len(items))
	for _, item := range items {
		if statusFilter == "" && item.OutboundStatus != nil && *item.OutboundStatus != "active" {
			continue
		}
		if companyID != "" && companyID != "all" && (item.CompanyID == nil || *item.CompanyID != companyID) {
			continue
		}
		if month != "" && (item.Sale.TaxInvoiceDate == nil || !strings.HasPrefix(*item.Sale.TaxInvoiceDate, month)) {
			continue
		}
		if invoiceStatus == "issued" && item.Sale.TaxInvoiceDate == nil {
			continue
		}
		if invoiceStatus == "pending" && item.Sale.TaxInvoiceDate != nil {
			continue
		}
		filtered = append(filtered, item)
	}

	response.RespondJSON(w, http.StatusOK, filtered)
}

type saleOrderRow struct {
	OrderID     string   `json:"order_id"`
	OrderNumber *string  `json:"order_number"`
	OrderDate   string   `json:"order_date"`
	CompanyID   string   `json:"company_id"`
	CustomerID  string   `json:"customer_id"`
	ProductID   string   `json:"product_id"`
	Quantity    int      `json:"quantity"`
	CapacityKw  *float64 `json:"capacity_kw"`
	SiteName    *string  `json:"site_name"`
}

type saleOutboundRow struct {
	OutboundID   string   `json:"outbound_id"`
	OutboundDate string   `json:"outbound_date"`
	CompanyID    string   `json:"company_id"`
	ProductID    string   `json:"product_id"`
	Quantity     int      `json:"quantity"`
	CapacityKw   *float64 `json:"capacity_kw"`
	SiteName     *string  `json:"site_name"`
	OrderID      *string  `json:"order_id"`
	Status       string   `json:"status"`
}

type saleProductRow struct {
	ProductID   string   `json:"product_id"`
	ProductName string   `json:"product_name"`
	ProductCode string   `json:"product_code"`
	SpecWp      *float64 `json:"spec_wp"`
}

type salePartnerRow struct {
	PartnerID   string `json:"partner_id"`
	PartnerName string `json:"partner_name"`
}

type saleCalcSource struct {
	Quantity   int
	CapacityKw *float64
	ProductID  string
}

func ptrString(v string) *string { return &v }

func (h *SaleHandler) enrichSales(sales []model.Sale) []model.SaleListItem {
	var orders []saleOrderRow
	var outbounds []saleOutboundRow
	var products []saleProductRow
	var partners []salePartnerRow

	if data, _, err := h.DB.From("orders").Select("order_id, order_number, order_date, company_id, customer_id, product_id, quantity, capacity_kw, site_name", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &orders); err != nil {
			log.Printf("[매출 enrich] orders 디코딩 실패 — 수주 정보 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] orders 조회 실패 — 수주 정보 비표시: %v", err)
	}
	if data, _, err := h.DB.From("outbounds").Select("outbound_id, outbound_date, company_id, product_id, quantity, capacity_kw, site_name, order_id, status", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &outbounds); err != nil {
			log.Printf("[매출 enrich] outbounds 디코딩 실패 — 출고 정보 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] outbounds 조회 실패 — 출고 정보 비표시: %v", err)
	}
	if data, _, err := h.DB.From("products").Select("product_id, product_name, product_code, spec_wp", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &products); err != nil {
			log.Printf("[매출 enrich] products 디코딩 실패 — 품목명/스펙 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] products 조회 실패 — 품목명/스펙 비표시: %v", err)
	}
	if data, _, err := h.DB.From("partners").Select("partner_id, partner_name", "exact", false).Execute(); err == nil {
		if err := json.Unmarshal(data, &partners); err != nil {
			log.Printf("[매출 enrich] partners 디코딩 실패 — 거래처명 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] partners 조회 실패 — 거래처명 비표시: %v", err)
	}

	orderMap := make(map[string]saleOrderRow, len(orders))
	for _, o := range orders {
		orderMap[o.OrderID] = o
	}
	outboundMap := make(map[string]saleOutboundRow, len(outbounds))
	for _, ob := range outbounds {
		outboundMap[ob.OutboundID] = ob
	}
	productMap := make(map[string]saleProductRow, len(products))
	for _, p := range products {
		productMap[p.ProductID] = p
	}
	partnerMap := make(map[string]salePartnerRow, len(partners))
	for _, p := range partners {
		partnerMap[p.PartnerID] = p
	}

	items := make([]model.SaleListItem, 0, len(sales))
	for _, sale := range sales {
		item := model.SaleListItem{
			SaleID:         sale.SaleID,
			OutboundID:     sale.OutboundID,
			OrderID:        sale.OrderID,
			CustomerID:     sale.CustomerID,
			Quantity:       0,
			CapacityKw:     sale.CapacityKw,
			UnitPriceWp:    sale.UnitPriceWp,
			UnitPriceEa:    sale.UnitPriceEa,
			SupplyAmount:   sale.SupplyAmount,
			VatAmount:      sale.VatAmount,
			TotalAmount:    sale.TotalAmount,
			TaxInvoiceDate: sale.TaxInvoiceDate,
			Status:         sale.Status,
			Sale:           sale,
		}
		if sale.Quantity != nil {
			item.Quantity = *sale.Quantity
		}
		if p, ok := partnerMap[sale.CustomerID]; ok {
			item.CustomerName = &p.PartnerName
			item.Sale.CustomerName = &p.PartnerName
		}

		var productID *string
		if sale.OutboundID != nil {
			if ob, ok := outboundMap[*sale.OutboundID]; ok {
				item.OutboundDate = &ob.OutboundDate
				item.OutboundStatus = &ob.Status
				item.CompanyID = &ob.CompanyID
				item.SiteName = ob.SiteName
				productID = &ob.ProductID
				if item.Quantity == 0 {
					item.Quantity = ob.Quantity
				}
				if item.CapacityKw == nil {
					item.CapacityKw = ob.CapacityKw
				}
				if item.OrderID == nil && ob.OrderID != nil {
					item.OrderID = ob.OrderID
				}
			}
		}
		if item.OrderID != nil {
			if ord, ok := orderMap[*item.OrderID]; ok {
				item.OrderDate = &ord.OrderDate
				item.OrderNumber = ord.OrderNumber
				if item.CompanyID == nil {
					item.CompanyID = &ord.CompanyID
				}
				if item.SiteName == nil {
					item.SiteName = ord.SiteName
				}
				if productID == nil {
					productID = &ord.ProductID
				}
				if item.Quantity == 0 {
					item.Quantity = ord.Quantity
				}
				if item.CapacityKw == nil {
					item.CapacityKw = ord.CapacityKw
				}
			}
		}
		if productID != nil {
			item.ProductID = productID
			if p, ok := productMap[*productID]; ok {
				item.ProductName = ptrString(p.ProductName)
				item.ProductCode = ptrString(p.ProductCode)
				item.SpecWp = p.SpecWp
			}
		}
		items = append(items, item)
	}
	return items
}

func (h *SaleHandler) saleSource(outboundID *string, orderID *string) (saleCalcSource, bool) {
	if outboundID != nil && *outboundID != "" {
		data, _, err := h.DB.From("outbounds").
			Select("quantity, capacity_kw, product_id", "exact", false).
			Eq("outbound_id", *outboundID).
			Execute()
		if err != nil {
			log.Printf("[매출 saleSource] outbound 조회 실패 outbound_id=%s err=%v — 수주 fallback 시도", *outboundID, err)
		} else {
			var rows []struct {
				Quantity   int      `json:"quantity"`
				CapacityKw *float64 `json:"capacity_kw"`
				ProductID  string   `json:"product_id"`
			}
			if err := json.Unmarshal(data, &rows); err != nil {
				log.Printf("[매출 saleSource] outbound 디코딩 실패 outbound_id=%s err=%v — 수주 fallback 시도", *outboundID, err)
			} else if len(rows) > 0 {
				return saleCalcSource{Quantity: rows[0].Quantity, CapacityKw: rows[0].CapacityKw, ProductID: rows[0].ProductID}, true
			}
		}
	}
	if orderID != nil && *orderID != "" {
		data, _, err := h.DB.From("orders").
			Select("quantity, capacity_kw, product_id", "exact", false).
			Eq("order_id", *orderID).
			Execute()
		if err != nil {
			log.Printf("[매출 saleSource] order 조회 실패 order_id=%s err=%v", *orderID, err)
		} else {
			var rows []struct {
				Quantity   int      `json:"quantity"`
				CapacityKw *float64 `json:"capacity_kw"`
				ProductID  string   `json:"product_id"`
			}
			if err := json.Unmarshal(data, &rows); err != nil {
				log.Printf("[매출 saleSource] order 디코딩 실패 order_id=%s err=%v", *orderID, err)
			} else if len(rows) > 0 {
				return saleCalcSource{Quantity: rows[0].Quantity, CapacityKw: rows[0].CapacityKw, ProductID: rows[0].ProductID}, true
			}
		}
	}
	return saleCalcSource{}, false
}

func (h *SaleHandler) productSpecWp(productID string) (float64, bool) {
	if productID == "" {
		return 0, false
	}
	data, _, err := h.DB.From("products").
		Select("spec_wp", "exact", false).
		Eq("product_id", productID).
		Execute()
	if err != nil {
		return 0, false
	}
	var rows []struct {
		SpecWp *float64 `json:"spec_wp"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[매출 productSpecWp] products 디코딩 실패 product_id=%s err=%v — 단가 계산 생략", productID, err)
		return 0, false
	}
	if len(rows) == 0 || rows[0].SpecWp == nil || *rows[0].SpecWp <= 0 {
		return 0, false
	}
	return *rows[0].SpecWp, true
}

func applySaleAmounts(quantity int, unitPriceWp float64, specWp float64) (*float64, *float64, *float64, *float64) {
	unitPriceEa := math.Round(unitPriceWp * specWp)
	supplyAmount := math.Round(unitPriceEa * float64(quantity))
	vatAmount := math.Round(supplyAmount * 0.1)
	totalAmount := supplyAmount + vatAmount
	return &unitPriceEa, &supplyAmount, &vatAmount, &totalAmount
}

// GetByID — GET /api/v1/sales/{id} — 판매 상세 조회
// 비유: 특정 판매 전표를 꺼내 자세히 보는 것
func (h *SaleHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	data, _, err := h.DB.From("sales").
		Select("*", "exact", false).
		Eq("sale_id", id).
		Execute()
	if err != nil {
		log.Printf("[판매 상세 조회 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "판매 조회에 실패했습니다")
		return
	}

	var sales []model.Sale
	if err := json.Unmarshal(data, &sales); err != nil {
		log.Printf("[판매 상세 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(sales) == 0 {
		response.RespondError(w, http.StatusNotFound, "판매를 찾을 수 없습니다")
		return
	}

	response.RespondJSON(w, http.StatusOK, sales[0])
}

// Create — POST /api/v1/sales — 판매 등록
// 비유: 새 판매 전표를 작성하여 전표함에 보관하는 것
func (h *SaleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req model.CreateSaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[판매 등록 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	h.fillSaleDefaults(&req)
	h.calculateSaleAmounts(&req)

	data, _, err := h.DB.From("sales").
		Insert(req, false, "", "", "").
		Execute()
	if err != nil {
		log.Printf("[판매 등록 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 등록에 실패했습니다")
		return
	}

	var created []model.Sale
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[판매 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "판매 등록 결과를 확인할 수 없습니다")
		return
	}

	writeAuditLog(h.DB, r, "sales", created[0].SaleID, "create", nil, auditRawFromValue(created[0]), "")
	response.RespondJSON(w, http.StatusCreated, created[0])
}

func (h *SaleHandler) fillSaleDefaults(req *model.CreateSaleRequest) {
	if req.Quantity != nil && req.CapacityKw != nil {
		return
	}
	if source, ok := h.saleSource(req.OutboundID, req.OrderID); ok {
		if req.Quantity == nil {
			req.Quantity = &source.Quantity
		}
		if req.CapacityKw == nil {
			req.CapacityKw = source.CapacityKw
		}
	}
}

func (h *SaleHandler) calculateSaleAmounts(req *model.CreateSaleRequest) {
	if req.Quantity == nil || *req.Quantity <= 0 {
		return
	}
	source, ok := h.saleSource(req.OutboundID, req.OrderID)
	if !ok {
		return
	}
	specWp, ok := h.productSpecWp(source.ProductID)
	if !ok {
		return
	}
	req.UnitPriceEa, req.SupplyAmount, req.VatAmount, req.TotalAmount = applySaleAmounts(*req.Quantity, req.UnitPriceWp, specWp)
}

func (h *SaleHandler) fetchSale(id string) (model.Sale, bool) {
	data, _, err := h.DB.From("sales").
		Select("*", "exact", false).
		Eq("sale_id", id).
		Execute()
	if err != nil {
		return model.Sale{}, false
	}
	var sales []model.Sale
	if err := json.Unmarshal(data, &sales); err != nil {
		log.Printf("[매출 fetchSale] 디코딩 실패 sale_id=%s err=%v — 재계산 생략", id, err)
		return model.Sale{}, false
	}
	if len(sales) == 0 {
		return model.Sale{}, false
	}
	return sales[0], true
}

func (h *SaleHandler) calculateSaleUpdate(id string, req *model.UpdateSaleRequest) {
	current, ok := h.fetchSale(id)
	if !ok {
		return
	}
	outboundID := current.OutboundID
	if req.OutboundID != nil {
		outboundID = req.OutboundID
	}
	orderID := current.OrderID
	if req.OrderID != nil {
		orderID = req.OrderID
	}
	source, ok := h.saleSource(outboundID, orderID)
	if !ok {
		return
	}
	quantity := source.Quantity
	if current.Quantity != nil {
		quantity = *current.Quantity
	}
	if req.Quantity != nil {
		quantity = *req.Quantity
	}
	unitPriceWp := current.UnitPriceWp
	if req.UnitPriceWp != nil {
		unitPriceWp = *req.UnitPriceWp
	}
	specWp, ok := h.productSpecWp(source.ProductID)
	if !ok || quantity <= 0 || unitPriceWp <= 0 {
		return
	}
	req.UnitPriceEa, req.SupplyAmount, req.VatAmount, req.TotalAmount = applySaleAmounts(quantity, unitPriceWp, specWp)
	if req.Quantity != nil && req.CapacityKw == nil {
		if source.CapacityKw != nil && source.Quantity > 0 {
			capacityKw := (*source.CapacityKw / float64(source.Quantity)) * float64(quantity)
			req.CapacityKw = &capacityKw
		}
	}
}

// Update — PUT /api/v1/sales/{id} — 판매 수정
// 비유: 기존 판매 전표의 내용을 수정하는 것
func (h *SaleHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "sales", "sale_id", id)
	if oldErr != nil {
		log.Printf("[판매 수정 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	var req model.UpdateSaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[판매 수정 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}

	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}
	h.calculateSaleUpdate(id, &req)

	data, _, err := h.DB.From("sales").
		Update(req, "", "").
		Eq("sale_id", id).
		Execute()
	if err != nil {
		log.Printf("[판매 수정 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "판매 수정에 실패했습니다")
		return
	}

	var updated []model.Sale
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[판매 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 판매를 찾을 수 없습니다")
		return
	}

	auditEntityByRouteID(h.DB, r, "sales", "sale_id", "update", oldSnapshot, auditRawFromValue(updated[0]), "")
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/sales/{id} — 판매 취소 처리
func (h *SaleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	oldSnapshot, _, oldErr := auditSnapshot(h.DB, "sales", "sale_id", id)
	if oldErr != nil {
		log.Printf("[판매 취소 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	data, _, err := h.DB.From("sales").
		Update(saleStatusUpdate{Status: "cancelled"}, "", "").
		Eq("sale_id", id).
		Execute()
	if err != nil {
		log.Printf("[판매 취소 실패] id=%s, err=%v", id, err)
		response.RespondError(w, http.StatusInternalServerError, "판매 취소에 실패했습니다")
		return
	}

	var updated []model.Sale
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[판매 취소 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "취소할 판매를 찾을 수 없습니다")
		return
	}

	auditEntityByRouteID(h.DB, r, "sales", "sale_id", "delete", oldSnapshot, auditRawFromValue(updated[0]), "soft_cancel")
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "cancelled"})
}
