package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	postgrest "github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

const (
	saleDefaultLimit = 100
	saleMaxLimit     = 1000
)

// saleSortable — 정렬 화이트리스트. sales 테이블 컬럼만 허용.
var saleSortable = map[string]struct{}{
	"tax_invoice_date": {},
	"supply_amount":    {},
	"total_amount":     {},
	"unit_price_wp":    {},
	"customer_id":      {},
	"status":           {},
	"created_at":       {},
}

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

// idsByCompany — sales 가 직접 company_id 가 없으므로 outbound/order 양쪽에서 ID 후보를 끌어온다.
// (outbound_id IN ... OR order_id IN ...) 으로 회사별 매출만 필터하는 데 사용.
func (h *SaleHandler) idsByCompany(companyID string) (outboundIDs []string, orderIDs []string, err error) {
	if data, _, e := h.DB.From("outbounds").Select("outbound_id", "exact", false).Eq("company_id", companyID).Execute(); e == nil {
		var rows []struct {
			OutboundID string `json:"outbound_id"`
		}
		if jerr := json.Unmarshal(data, &rows); jerr == nil {
			outboundIDs = make([]string, 0, len(rows))
			for _, row := range rows {
				outboundIDs = append(outboundIDs, row.OutboundID)
			}
		}
	} else {
		err = fmt.Errorf("outbounds 회사 필터 실패: %w", e)
		return
	}
	if data, _, e := h.DB.From("orders").Select("order_id", "exact", false).Eq("company_id", companyID).Execute(); e == nil {
		var rows []struct {
			OrderID string `json:"order_id"`
		}
		if jerr := json.Unmarshal(data, &rows); jerr == nil {
			orderIDs = make([]string, 0, len(rows))
			for _, row := range rows {
				orderIDs = append(orderIDs, row.OrderID)
			}
		}
	} else {
		err = fmt.Errorf("orders 회사 필터 실패: %w", e)
		return
	}
	return
}

// customerIDsByQ — 거래처 이름으로 partner_id 후보 끌어옴. q 검색 시 customer_id IN 으로 결합.
func (h *SaleHandler) customerIDsByQ(q string) ([]string, error) {
	data, _, err := h.DB.From("partners").
		Select("partner_id", "exact", false).
		Ilike("partner_name", fmt.Sprintf("*%s*", q)).
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		PartnerID string `json:"partner_id"`
	}
	if jerr := json.Unmarshal(data, &rows); jerr != nil {
		return nil, jerr
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.PartnerID)
	}
	return ids, nil
}

func sanitizeSaleSearchTerm(q string) string {
	q = strings.TrimSpace(q)
	if q == "" {
		return ""
	}
	replacer := strings.NewReplacer(",", " ", "(", " ", ")", " ", ".", " ", "*", " ", "\"", " ")
	return strings.TrimSpace(replacer.Replace(q))
}

// applySaleFilters — List/Summary 가 공유하는 필터 로직.
// company_id/month/invoice_status/q 등 옛 클라이언트 필터를 모두 DB-level 로 처리.
// 매칭이 0건이라 빈 결과가 확정되면 (false, nil) 반환.
func (h *SaleHandler) applySaleFilters(r *http.Request, query *postgrest.FilterBuilder) (*postgrest.FilterBuilder, bool, error) {
	if outID := r.URL.Query().Get("outbound_id"); outID != "" {
		query = query.Eq("outbound_id", outID)
	}
	if orderID := r.URL.Query().Get("order_id"); orderID != "" {
		query = query.Eq("order_id", orderID)
	}
	if custID := r.URL.Query().Get("customer_id"); custID != "" {
		query = query.Eq("customer_id", custID)
	}
	if erpClosed := r.URL.Query().Get("erp_closed"); erpClosed != "" {
		query = query.Eq("erp_closed", erpClosed)
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	} else {
		query = query.Neq("status", "cancelled")
	}

	// month: tax_invoice_date.like.YYYY-MM-* (또는 YYYY-MM-%)
	if month := r.URL.Query().Get("month"); month != "" {
		query = query.Like("tax_invoice_date", month+"%")
	}

	// invoice_status: tax_invoice_date IS NULL / NOT NULL
	switch r.URL.Query().Get("invoice_status") {
	case "issued":
		query = query.Not("tax_invoice_date", "is", "null")
	case "pending":
		query = query.Is("tax_invoice_date", "null")
	}

	// company_id: outbound_id IN (...) OR order_id IN (...)
	if compID := r.URL.Query().Get("company_id"); compID != "" && compID != "all" {
		outIDs, ordIDs, err := h.idsByCompany(compID)
		if err != nil {
			return query, false, err
		}
		if len(outIDs) == 0 && len(ordIDs) == 0 {
			return query, false, nil
		}
		clauses := []string{}
		if len(outIDs) > 0 {
			clauses = append(clauses, fmt.Sprintf("outbound_id.in.(%s)", strings.Join(outIDs, ",")))
		}
		if len(ordIDs) > 0 {
			clauses = append(clauses, fmt.Sprintf("order_id.in.(%s)", strings.Join(ordIDs, ",")))
		}
		query = query.Or(strings.Join(clauses, ","), "")
	}

	// q: 거래처 이름 매칭으로 customer_id IN (...). 매칭 0건이면 빈 결과 즉시 반환.
	if q := sanitizeSaleSearchTerm(r.URL.Query().Get("q")); q != "" {
		ids, err := h.customerIDsByQ(q)
		if err != nil {
			return query, false, fmt.Errorf("거래처 검색 실패: %w", err)
		}
		if len(ids) == 0 {
			return query, false, nil
		}
		query = query.In("customer_id", ids)
	}

	return query, true, nil
}

func parseSaleSort(r *http.Request) (column string, ascending bool) {
	column = "tax_invoice_date"
	ascending = false
	if raw := r.URL.Query().Get("sort"); raw != "" {
		if _, ok := saleSortable[raw]; ok {
			column = raw
		}
	}
	if r.URL.Query().Get("order") == "asc" {
		ascending = true
	}
	return column, ascending
}

// List — GET /api/v1/sales — 판매 목록 조회 (서버사이드 페이지·검색·정렬).
// 쿼리 파라미터:
//   - limit/offset (기본 100, 최대 1000), sort/order (화이트리스트), q (거래처 검색)
//   - company_id/customer_id/outbound_id/order_id/erp_closed/status: 등치 필터
//   - month: tax_invoice_date prefix 매칭, invoice_status: issued/pending
//
// 응답 헤더 X-Total-Count.
func (h *SaleHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("sales").Select("*", "exact", false)
	query, ok, err := h.applySaleFilters(r, query)
	if err != nil {
		log.Printf("[판매 목록 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 목록 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		w.Header().Set("X-Total-Count", "0")
		response.RespondJSON(w, http.StatusOK, []model.SaleListItem{})
		return
	}

	sortCol, asc := parseSaleSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := parseLimitOffset(r, saleDefaultLimit, saleMaxLimit)
	query = query.Range(offset, offset+limit-1, "")

	data, count, err := query.Execute()
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

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, items)
}

// SaleSummary — 매출 KPI 카드 응답.
type SaleSummary struct {
	Total              int64   `json:"total"`
	SaleAmountSum      float64 `json:"sale_amount_sum"`
	InvoicePendingCount int64  `json:"invoice_pending_count"`
}

// Summary — GET /api/v1/sales/summary — 매출 KPI 집계 (List 와 동일 필터).
func (h *SaleHandler) Summary(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("sales").Select("supply_amount, tax_invoice_date", "exact", false)
	query, ok, err := h.applySaleFilters(r, query)
	if err != nil {
		log.Printf("[판매 요약 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 요약 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		response.RespondJSON(w, http.StatusOK, SaleSummary{})
		return
	}

	// 한 번에 모두 받아 클라이언트(이 핸들러) 에서 합산. 매출 데이터는 보통 매출 단위가 출고 단위와 비슷해
	// 최대 수만건 수준으로 충분히 메모리 처리 가능.
	// 큰 운영규모로 가면 SQL aggregate(view 또는 RPC) 로 교체 권장.
	data, count, err := query.Range(0, saleMaxLimit-1, "").Execute()
	if err != nil {
		log.Printf("[판매 요약 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 요약 조회에 실패했습니다")
		return
	}

	var rows []struct {
		SupplyAmount   *float64 `json:"supply_amount"`
		TaxInvoiceDate *string  `json:"tax_invoice_date"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[판매 요약 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	summary := SaleSummary{Total: count}
	for _, row := range rows {
		if row.SupplyAmount != nil {
			summary.SaleAmountSum += *row.SupplyAmount
		}
		if row.TaxInvoiceDate == nil {
			summary.InvoicePendingCount++
		}
	}
	response.RespondJSON(w, http.StatusOK, summary)
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
