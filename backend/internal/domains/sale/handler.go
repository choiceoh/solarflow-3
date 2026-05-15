package sale

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

	"solarflow-backend/internal/audit"
	"solarflow-backend/internal/dbschema"
	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/mount"
	"solarflow-backend/internal/response"
)

const (
	saleDefaultLimit = 100
	saleMaxLimit     = 1000
	// salesWithMetaView — receipt_status / business_date 등 계산 컬럼을 더한 sales 뷰.
	// 마이그 094. 읽기 경로 (List/Summary/Dashboard) 만 사용; 쓰기는 sales 테이블 직접.
	salesWithMetaView = "sales_with_meta"
)

// saleViewRow — sales_with_meta 한 행. enrichSales 가 Sale 부분만 가공하되
// 수금 메타 (collected/outstanding/receipt_status) 는 뷰가 계산한 값을 그대로 사용.
type saleViewRow struct {
	Sale
	CollectedAmount   *float64 `json:"collected_amount,omitempty"`
	OutstandingAmount *float64 `json:"outstanding_amount,omitempty"`
	ReceiptStatus     *string  `json:"receipt_status,omitempty"`
	BusinessDate      *string  `json:"business_date,omitempty"`
}

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

// init — D-20260512-090000 feature self-mounting.
func init() {
	mount.Register(mount.Spec{
		ID:   feature.IDTxSale,
		Auth: mount.AuthAuthed,
		Mount: func(d *mount.Deps, r chi.Router) {
			h := NewSaleHandler(d.DB)
			g := d.Gates
			r.Route("/sales", func(r chi.Router) {
				r.Get("/", h.List)
				r.Get("/summary", h.Summary)
				// 대시보드 집계 — KPI / trend24 / by_customer_top10. 정적 경로라 /{id} 보다 먼저.
				r.Get("/dashboard", h.Dashboard)
				r.Get("/{id}", h.GetByID)
				r.With(g.Write).Post("/", h.Create)
				r.With(g.Write).Put("/{id}", h.Update)
				r.With(g.Write).Delete("/{id}", h.Delete)
			})
		},
	})
}

type saleStatusUpdate struct {
	Status string `json:"status"`
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

// applySaleFilters — List/Summary/Dashboard 가 공유하는 필터 로직.
// 호출자는 반드시 sales_with_meta 뷰 (business_date / business_month / receipt_status 컬럼)
// 기반으로 query 를 만들어 전달해야 한다. 빈 결과가 확정되면 (false, nil) 반환.
//
// 설계 노트 (PR #701/근본 해법):
//   - erp_closed=false / month·start·end / receipt_status 는 과거 Go 측에서 sale_id 리스트로
//     변환해 .In() 으로 보내던 경로였다. 1,000+ UUID 가 URL 한도를 넘어 Cloudflare 가 400
//     Bad Request 로 거절하는 회귀가 있었다. 094 마이그가 뷰에 계산 컬럼을 노출해 모두
//     서버측 술어로 옮겼다.
func (h *SaleHandler) applySaleFilters(r *http.Request, query *postgrest.FilterBuilder) (*postgrest.FilterBuilder, bool, error) {
	q := r.URL.Query()

	if v := q.Get("outbound_id"); v != "" {
		query = query.Eq(dbschema.SalesWithMetaColOutboundId, v)
	}
	if v := q.Get("order_id"); v != "" {
		query = query.Eq(dbschema.SalesWithMetaColOrderId, v)
	}
	if v := q.Get("customer_id"); v != "" {
		query = query.Eq(dbschema.SalesWithMetaColCustomerId, v)
	}

	switch q.Get("erp_closed") {
	case "":
		// no-op
	case "true":
		query = query.Eq(dbschema.SalesWithMetaColErpClosed, "true")
	case "false":
		// NULL 도 미마감으로 본다 — `IS NOT TRUE` 의미.
		query = query.Or("erp_closed.is.null,erp_closed.is.false", "")
	default:
		return query, false, nil
	}

	if v := q.Get("status"); v != "" {
		query = query.Eq(dbschema.SalesWithMetaColStatus, v)
	} else {
		query = query.Neq(dbschema.SalesWithMetaColStatus, "cancelled")
	}

	if v := q.Get("month"); v != "" {
		query = query.Eq(dbschema.SalesWithMetaColBusinessMonth, v)
	}
	if v := q.Get("start"); v != "" {
		query = query.Gte(dbschema.SalesWithMetaColBusinessDate, v)
	}
	if v := q.Get("end"); v != "" {
		query = query.Lte(dbschema.SalesWithMetaColBusinessDate, v)
	}

	switch q.Get("invoice_status") {
	case "issued":
		query = query.Not(dbschema.SalesWithMetaColTaxInvoiceDate, "is", "null")
	case "pending":
		query = query.Is(dbschema.SalesWithMetaColTaxInvoiceDate, "null")
	}

	switch rs := q.Get("receipt_status"); rs {
	case "":
		// no-op
	case "open":
		// outstanding > 0 — unpaid 와 partial 의 합집합.
		query = query.In(dbschema.SalesWithMetaColReceiptStatus, []string{"unpaid", "partial"})
	case "unpaid", "partial", "paid":
		query = query.Eq(dbschema.SalesWithMetaColReceiptStatus, rs)
	default:
		return query, false, nil
	}

	// company_id: sales 직접 컬럼 아님 → sales_with_meta 의 outbound_company_id /
	// order_company_id (마이그 111) 로 server-side 매칭. 과거 idsByCompany 경로는
	// 대형 테넌트에서 UUID 수천 개를 URL 로 합쳐 Cloudflare 400 Bad Request 를 받았다.
	if compID := q.Get("company_id"); compID != "" && compID != "all" {
		query = query.Or(
			fmt.Sprintf("outbound_company_id.eq.%s,order_company_id.eq.%s", compID, compID),
			"",
		)
	}

	// q: 거래처 이름 매칭으로 customer_id IN (...). 매칭 0건이면 빈 결과 즉시 반환.
	if qStr := sanitizeSaleSearchTerm(q.Get("q")); qStr != "" {
		ids, err := h.customerIDsByQ(qStr)
		if err != nil {
			return query, false, fmt.Errorf("거래처 검색 실패: %w", err)
		}
		if len(ids) == 0 {
			return query, false, nil
		}
		query = query.In(dbschema.SalesWithMetaColCustomerId, ids)
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
//   - month/start/end: business_date(계산서일→출고일→수주일 폴백) 기반 기간 필터
//   - invoice_status: issued/pending
//   - receipt_status: open/unpaid/partial/paid (sales_with_meta 뷰 계산 컬럼)
//
// 응답 헤더 X-Total-Count.
func (h *SaleHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From(salesWithMetaView).Select("sale_id,outbound_id,order_id,customer_id,quantity,capacity_kw,unit_price_wp,unit_price_ea,supply_amount,vat_amount,total_amount,tax_invoice_date,tax_invoice_email,erp_closed,erp_closed_date,status,memo,erp_sales_no,erp_line_no,currency,created_at,updated_at,collected_amount,outstanding_amount,receipt_status,business_date", "exact", false)
	query, ok, err := h.applySaleFilters(r, query)
	if err != nil {
		log.Printf("[판매 목록 필터 처리 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 목록 필터 처리에 실패했습니다")
		return
	}
	if !ok {
		w.Header().Set("X-Total-Count", "0")
		response.RespondJSON(w, http.StatusOK, []SaleListItem{})
		return
	}

	sortCol, asc := parseSaleSort(r)
	query = query.Order(sortCol, &postgrest.OrderOpts{Ascending: asc})

	limit, offset := handlerutil.ParseLimitOffset(r, saleDefaultLimit, saleMaxLimit)
	query = query.Range(offset, offset+limit-1, "")

	data, count, err := query.Execute()
	if err != nil {
		log.Printf("[판매 목록 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 목록 조회에 실패했습니다")
		return
	}

	var rows []saleViewRow
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[판매 목록 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	items := h.enrichSales(rows)

	w.Header().Set("X-Total-Count", strconv.FormatInt(count, 10))
	response.RespondJSON(w, http.StatusOK, items)
}

// SaleSummary — 매출 KPI 카드 응답.
type SaleSummary struct {
	Total               int64   `json:"total"`
	SaleAmountSum       float64 `json:"sale_amount_sum"`
	InvoicePendingCount int64   `json:"invoice_pending_count"`
}

// Summary — GET /api/v1/sales/summary — 매출 KPI 집계 (List 와 동일 필터).
// 094 마이그(sales_with_meta) 후 모든 필터가 서버측 술어 — chunked .In() 회피책 제거.
// 단, PostgREST 의 db-max-rows=1000 cap 때문에 매칭이 1000 행 초과면 단일 Range 호출로는
// supply_amount 합 / invoice_pending 카운트가 잘리므로, handlerutil.FetchAllFromTable 와 같은
// 페이지네이션 패턴으로 모든 페이지를 누적 집계 (count 헤더는 첫 페이지 값을 신뢰).
func (h *SaleHandler) Summary(w http.ResponseWriter, r *http.Request) {
	const pageSize = handlerutil.PostgRESTMaxRows
	const maxPages = 50

	summary := SaleSummary{}
	for page := 0; page < maxPages; page++ {
		query := h.DB.From(salesWithMetaView).Select("supply_amount, tax_invoice_date", "exact", false)
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

		offset := page * pageSize
		data, count, err := query.Range(offset, offset+pageSize-1, "").Execute()
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

		if page == 0 {
			summary.Total = count
		}
		for _, row := range rows {
			if row.SupplyAmount != nil {
				summary.SaleAmountSum += *row.SupplyAmount
			}
			if row.TaxInvoiceDate == nil {
				summary.InvoicePendingCount++
			}
		}
		if len(rows) < pageSize {
			break
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
	OutboundID    string   `json:"outbound_id"`
	OutboundDate  string   `json:"outbound_date"`
	CompanyID     string   `json:"company_id"`
	ProductID     string   `json:"product_id"`
	Quantity      int      `json:"quantity"`
	CapacityKw    *float64 `json:"capacity_kw"`
	SiteName      *string  `json:"site_name"`
	OrderID       *string  `json:"order_id"`
	Status        string   `json:"status"`
	UsageCategory string   `json:"usage_category"`
}

type saleProductRow struct {
	ProductID      string   `json:"product_id"`
	ProductName    string   `json:"product_name"`
	ProductCode    string   `json:"product_code"`
	SpecWp         *float64 `json:"spec_wp"`
	ManufacturerID *string  `json:"manufacturer_id"`
}

type saleManufacturerRow struct {
	ManufacturerID string  `json:"manufacturer_id"`
	NameKR         string  `json:"name_kr"`
	ShortName      *string `json:"short_name"`
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

func (h *SaleHandler) enrichSales(rows []saleViewRow) []SaleListItem {
	var orders []saleOrderRow
	var outbounds []saleOutboundRow
	var products []saleProductRow
	var partners []salePartnerRow

	// 4 enrich 테이블 모두 handlerutil.FetchAllFromTable 헬퍼로 청크 페이지네이션 (D-064 PR 36).
	// PostgREST db-max-rows=1000 cap 으로 단일 Range 호출 시 첫 1000행만 응답 →
	// 1000 초과 테이블 (예: outbounds 2,229) 의 enrich 누락. 회귀 방지 위해 통일.
	// 수금 메타(collected/outstanding/receipt_status) 는 sales_with_meta 뷰가 이미 계산 — 별도 fetch 불필요.
	if data, err := handlerutil.FetchAllFromTable(h.DB, "orders", "order_id, order_number, order_date, company_id, customer_id, product_id, quantity, capacity_kw, site_name"); err == nil {
		if err := json.Unmarshal(data, &orders); err != nil {
			log.Printf("[매출 enrich] orders 디코딩 실패 — 수주 정보 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] orders 조회 실패 — 수주 정보 비표시: %v", err)
	}
	if data, err := handlerutil.FetchAllFromTable(h.DB, "outbounds", "outbound_id, outbound_date, company_id, product_id, quantity, capacity_kw, site_name, order_id, status, usage_category"); err == nil {
		if err := json.Unmarshal(data, &outbounds); err != nil {
			log.Printf("[매출 enrich] outbounds 디코딩 실패 — 출고 정보 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] outbounds 조회 실패 — 출고 정보 비표시: %v", err)
	}
	if data, err := handlerutil.FetchAllFromTable(h.DB, "products", "product_id, product_name, product_code, spec_wp, manufacturer_id"); err == nil {
		if err := json.Unmarshal(data, &products); err != nil {
			log.Printf("[매출 enrich] products 디코딩 실패 — 품목명/스펙 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] products 조회 실패 — 품목명/스펙 비표시: %v", err)
	}
	var manufacturers []saleManufacturerRow
	if data, err := handlerutil.FetchAllFromTable(h.DB, "manufacturers", "manufacturer_id, name_kr, short_name"); err == nil {
		if err := json.Unmarshal(data, &manufacturers); err != nil {
			log.Printf("[매출 enrich] manufacturers 디코딩 실패 — 제조사명 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] manufacturers 조회 실패 — 제조사명 비표시: %v", err)
	}
	if data, err := handlerutil.FetchAllFromTable(h.DB, "partners", "partner_id, partner_name"); err == nil {
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
	manufacturerMap := make(map[string]saleManufacturerRow, len(manufacturers))
	for _, m := range manufacturers {
		manufacturerMap[m.ManufacturerID] = m
	}
	partnerMap := make(map[string]salePartnerRow, len(partners))
	for _, p := range partners {
		partnerMap[p.PartnerID] = p
	}

	items := make([]SaleListItem, 0, len(rows))
	for _, row := range rows {
		sale := row.Sale
		collectedAmount := 0.0
		if row.CollectedAmount != nil {
			collectedAmount = *row.CollectedAmount
		}
		outstandingAmount := 0.0
		if row.OutstandingAmount != nil {
			outstandingAmount = *row.OutstandingAmount
		}
		receiptStatus := "unknown"
		if row.ReceiptStatus != nil && *row.ReceiptStatus != "" {
			receiptStatus = *row.ReceiptStatus
		}
		item := SaleListItem{
			SaleID:            sale.SaleID,
			OutboundID:        sale.OutboundID,
			OrderID:           sale.OrderID,
			CustomerID:        sale.CustomerID,
			Quantity:          0,
			CapacityKw:        sale.CapacityKw,
			UnitPriceWp:       sale.UnitPriceWp,
			UnitPriceEa:       sale.UnitPriceEa,
			SupplyAmount:      sale.SupplyAmount,
			VatAmount:         sale.VatAmount,
			TotalAmount:       sale.TotalAmount,
			CollectedAmount:   collectedAmount,
			OutstandingAmount: outstandingAmount,
			ReceiptStatus:     receiptStatus,
			TaxInvoiceDate:    sale.TaxInvoiceDate,
			Status:            sale.Status,
			Sale:              sale,
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
				if ob.UsageCategory != "" {
					uc := ob.UsageCategory
					item.UsageCategory = &uc
				}
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
				if p.ManufacturerID != nil && *p.ManufacturerID != "" {
					item.ManufacturerID = p.ManufacturerID
					if m, ok := manufacturerMap[*p.ManufacturerID]; ok {
						name := m.NameKR
						if m.ShortName != nil && *m.ShortName != "" {
							name = *m.ShortName
						}
						item.ManufacturerName = &name
					}
				}
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

	var sales []Sale
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
	var req CreateSaleRequest
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

	var created []Sale
	if err := json.Unmarshal(data, &created); err != nil {
		log.Printf("[판매 등록 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(created) == 0 {
		response.RespondError(w, http.StatusInternalServerError, "판매 등록 결과를 확인할 수 없습니다")
		return
	}

	audit.WriteLog(h.DB, r, "sales", created[0].SaleID, "create", nil, audit.RawFromValue(created[0]), "")
	response.RespondJSON(w, http.StatusCreated, created[0])
}

func (h *SaleHandler) fillSaleDefaults(req *CreateSaleRequest) {
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

func (h *SaleHandler) calculateSaleAmounts(req *CreateSaleRequest) {
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

func (h *SaleHandler) fetchSale(id string) (Sale, bool) {
	data, _, err := h.DB.From("sales").
		Select("*", "exact", false).
		Eq("sale_id", id).
		Execute()
	if err != nil {
		return Sale{}, false
	}
	var sales []Sale
	if err := json.Unmarshal(data, &sales); err != nil {
		log.Printf("[매출 fetchSale] 디코딩 실패 sale_id=%s err=%v — 재계산 생략", id, err)
		return Sale{}, false
	}
	if len(sales) == 0 {
		return Sale{}, false
	}
	return sales[0], true
}

func (h *SaleHandler) calculateSaleUpdate(id string, req *UpdateSaleRequest) {
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

	oldSnapshot, _, oldErr := audit.Snapshot(h.DB, "sales", "sale_id", id)
	if oldErr != nil {
		log.Printf("[판매 수정 전 감사 스냅샷 조회 실패] id=%s err=%v", id, oldErr)
	}

	var req UpdateSaleRequest
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

	var updated []Sale
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[판매 수정 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "수정할 판매를 찾을 수 없습니다")
		return
	}

	audit.EntityByRouteID(h.DB, r, "sales", "sale_id", "update", oldSnapshot, audit.RawFromValue(updated[0]), "")
	response.RespondJSON(w, http.StatusOK, updated[0])
}

// Delete — DELETE /api/v1/sales/{id} — 판매 취소 처리
func (h *SaleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	oldSnapshot, _, oldErr := audit.Snapshot(h.DB, "sales", "sale_id", id)
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

	var updated []Sale
	if err := json.Unmarshal(data, &updated); err != nil {
		log.Printf("[판매 취소 결과 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	if len(updated) == 0 {
		response.RespondError(w, http.StatusNotFound, "취소할 판매를 찾을 수 없습니다")
		return
	}

	audit.EntityByRouteID(h.DB, r, "sales", "sale_id", "delete", oldSnapshot, audit.RawFromValue(updated[0]), "soft_cancel")
	response.RespondJSON(w, http.StatusOK, struct {
		Status string `json:"status"`
	}{Status: "cancelled"})
}
