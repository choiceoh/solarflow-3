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
	// saleSummaryChunkSize — receipt_status 필터가 만든 sale_id IN(...) 목록을
	// PostgREST URL 에 한꺼번에 실으면 Supabase 앞단 Cloudflare 가
	// HTTP 400 "Bad Request"(URL too long) 로 거절한다 (실측: 700+ UUID 부터).
	// 헤더/타 필터 여유 두고 200 으로 청크.
	saleSummaryChunkSize = 200
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

type saleERPClosedRefRow struct {
	SaleID    string `json:"sale_id"`
	ERPClosed *bool  `json:"erp_closed"`
}

// erpOpenSaleIDs — 과거 이관 데이터의 NULL 과 명시 false 를 모두 ERP 미마감으로 본다.
// 비유: 도장이 안 찍힌 전표는 빈칸이든 "미마감" 표시든 같은 미처리함에 넣는다.
func (h *SaleHandler) erpOpenSaleIDs() ([]string, error) {
	data, err := fetchAllFromTable(h.DB, "sales", "sale_id,erp_closed")
	if err != nil {
		return nil, err
	}
	var rows []saleERPClosedRefRow
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.SaleID == "" || (row.ERPClosed != nil && *row.ERPClosed) {
			continue
		}
		ids = append(ids, row.SaleID)
	}
	return ids, nil
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

type saleBusinessDateRow struct {
	SaleID         string  `json:"sale_id"`
	TaxInvoiceDate *string `json:"tax_invoice_date"`
	OutboundID     *string `json:"outbound_id"`
	OrderID        *string `json:"order_id"`
}

type saleDateOutboundRow struct {
	OutboundID   string `json:"outbound_id"`
	OutboundDate string `json:"outbound_date"`
}

type saleDateOrderRow struct {
	OrderID   string `json:"order_id"`
	OrderDate string `json:"order_date"`
}

func saleBusinessDateMatches(dateValue, month, start, end string) bool {
	if dateValue == "" {
		return false
	}
	if month != "" && !strings.HasPrefix(dateValue, month) {
		return false
	}
	if start != "" && dateValue < start {
		return false
	}
	if end != "" && dateValue > end {
		return false
	}
	return true
}

// saleIDsByBusinessDate — 매출 기간 필터 후보 sale_id를 구한다.
// 비유: 계산서가 있으면 계산서일, 아직 없으면 출고일/수주일을 기준일로 삼아
// "미발행 매출"도 월말 마감 큐에서 사라지지 않게 한다.
func (h *SaleHandler) saleIDsByBusinessDate(month, start, end string) ([]string, error) {
	salesData, err := fetchAllFromTable(h.DB, "sales", "sale_id, tax_invoice_date, outbound_id, order_id")
	if err != nil {
		return nil, err
	}
	var sales []saleBusinessDateRow
	if err := json.Unmarshal(salesData, &sales); err != nil {
		return nil, err
	}

	outboundData, err := fetchAllFromTable(h.DB, "outbounds", "outbound_id, outbound_date")
	if err != nil {
		return nil, err
	}
	var outbounds []saleDateOutboundRow
	if err := json.Unmarshal(outboundData, &outbounds); err != nil {
		return nil, err
	}
	outboundDateByID := make(map[string]string, len(outbounds))
	for _, row := range outbounds {
		outboundDateByID[row.OutboundID] = row.OutboundDate
	}

	orderData, err := fetchAllFromTable(h.DB, "orders", "order_id, order_date")
	if err != nil {
		return nil, err
	}
	var orders []saleDateOrderRow
	if err := json.Unmarshal(orderData, &orders); err != nil {
		return nil, err
	}
	orderDateByID := make(map[string]string, len(orders))
	for _, row := range orders {
		orderDateByID[row.OrderID] = row.OrderDate
	}

	ids := make([]string, 0, len(sales))
	for _, sale := range sales {
		// 폴백 체인: tax_invoice_date → outbound_date → order_date.
		// outbound_id 가 dangling 이면 outboundDateByID 가 "" 를 반환하므로 order_id 폴백을 시도해야 한다.
		dateValue := ""
		if sale.TaxInvoiceDate != nil && *sale.TaxInvoiceDate != "" {
			dateValue = *sale.TaxInvoiceDate
		}
		if dateValue == "" && sale.OutboundID != nil && *sale.OutboundID != "" {
			dateValue = outboundDateByID[*sale.OutboundID]
		}
		if dateValue == "" && sale.OrderID != nil && *sale.OrderID != "" {
			dateValue = orderDateByID[*sale.OrderID]
		}
		if saleBusinessDateMatches(dateValue, month, start, end) {
			ids = append(ids, sale.SaleID)
		}
	}
	return ids, nil
}

// intersectSaleIDLists — 후보 sale_id 리스트들의 교집합을 구한다.
// applySaleFilters 에서 erp/날짜/수금 등 여러 후보 컬럼이 모두 sale_id 를 좁히는데,
// postgrest-go .In() 은 params map 이라 같은 컬럼 두 번 호출 시 덮어써진다 (한 필터만 살아남음).
// 따라서 후보 리스트들을 Go 에서 교집합 처리한 뒤 마지막에 한 번만 .In() 호출한다.
func intersectSaleIDLists(lists [][]string) []string {
	if len(lists) == 0 {
		return nil
	}
	// 가장 작은 리스트를 기준으로 멤버십 맵 생성 후 교집합 — O(N×M).
	smallestIdx := 0
	for i, list := range lists {
		if len(list) < len(lists[smallestIdx]) {
			smallestIdx = i
		}
	}
	base := make(map[string]struct{}, len(lists[smallestIdx]))
	for _, id := range lists[smallestIdx] {
		base[id] = struct{}{}
	}
	for i, list := range lists {
		if i == smallestIdx {
			continue
		}
		next := make(map[string]struct{}, len(base))
		for _, id := range list {
			if _, ok := base[id]; ok {
				next[id] = struct{}{}
			}
		}
		base = next
		if len(base) == 0 {
			return nil
		}
	}
	result := make([]string, 0, len(base))
	for id := range base {
		result = append(result, id)
	}
	return result
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
	// sale_id 후보 리스트들 — erp/날짜/수금 필터가 모두 sale_id 컬럼을 좁히는데
	// postgrest-go .In() 은 params map 이라 같은 컬럼을 두 번 부르면 덮어쓰여 한 필터만 살아남는다.
	// 모두 모은 뒤 교집합으로 한 번만 .In("sale_id", …) 호출한다.
	var saleIDCandidates [][]string

	if erpClosed := r.URL.Query().Get("erp_closed"); erpClosed != "" {
		switch erpClosed {
		case "true":
			query = query.Eq("erp_closed", "true")
		case "false":
			ids, err := h.erpOpenSaleIDs()
			if err != nil {
				return query, false, fmt.Errorf("ERP 미마감 매출 조회 실패: %w", err)
			}
			if len(ids) == 0 {
				return query, false, nil
			}
			saleIDCandidates = append(saleIDCandidates, ids)
		default:
			return query, false, nil
		}
	}
	if status := r.URL.Query().Get("status"); status != "" {
		query = query.Eq("status", status)
	} else {
		query = query.Neq("status", "cancelled")
	}

	month := r.URL.Query().Get("month")
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if month != "" || start != "" || end != "" {
		ids, err := h.saleIDsByBusinessDate(month, start, end)
		if err != nil {
			return query, false, fmt.Errorf("매출 기준일 필터 실패: %w", err)
		}
		if len(ids) == 0 {
			return query, false, nil
		}
		saleIDCandidates = append(saleIDCandidates, ids)
	}

	// invoice_status: tax_invoice_date IS NULL / NOT NULL
	switch r.URL.Query().Get("invoice_status") {
	case "issued":
		query = query.Not("tax_invoice_date", "is", "null")
	case "pending":
		query = query.Is("tax_invoice_date", "null")
	}

	if receiptStatus := r.URL.Query().Get("receipt_status"); receiptStatus != "" {
		ids, err := h.saleIDsByReceiptStatus(receiptStatus)
		if err != nil {
			return query, false, fmt.Errorf("수금 상태 필터 실패: %w", err)
		}
		if len(ids) == 0 {
			return query, false, nil
		}
		saleIDCandidates = append(saleIDCandidates, ids)
	}

	if len(saleIDCandidates) > 0 {
		intersected := intersectSaleIDLists(saleIDCandidates)
		if len(intersected) == 0 {
			return query, false, nil
		}
		query = query.In("sale_id", intersected)
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

type saleReceiptStatusRow struct {
	SaleID      string   `json:"sale_id"`
	OutboundID  *string  `json:"outbound_id"`
	TotalAmount *float64 `json:"total_amount"`
}

func saleReceiptStatusMatches(filter string, totalAmount float64, collectedAmount float64) bool {
	if totalAmount <= receiptMatchAmountEpsilon {
		return false
	}
	outstandingAmount := totalAmount - collectedAmount
	if outstandingAmount < 0 {
		outstandingAmount = 0
	}
	switch filter {
	case "open":
		return outstandingAmount > receiptMatchAmountEpsilon
	case "unpaid":
		return outstandingAmount > receiptMatchAmountEpsilon && collectedAmount <= receiptMatchAmountEpsilon
	case "partial":
		return outstandingAmount > receiptMatchAmountEpsilon && collectedAmount > receiptMatchAmountEpsilon
	case "paid":
		return outstandingAmount <= receiptMatchAmountEpsilon
	default:
		return false
	}
}

func (h *SaleHandler) saleIDsByReceiptStatus(filter string) ([]string, error) {
	switch filter {
	case "open", "unpaid", "partial", "paid":
	default:
		return nil, nil
	}

	var sales []saleReceiptStatusRow
	if data, err := fetchAllFromTable(h.DB, "sales", "sale_id,outbound_id,total_amount"); err != nil {
		return nil, err
	} else if err := json.Unmarshal(data, &sales); err != nil {
		return nil, err
	}

	var receiptMatches []receiptMatchTargetAmountRow
	if data, err := fetchAllFromTable(h.DB, "receipt_matches", "outbound_id,sale_id,matched_amount"); err != nil {
		return nil, err
	} else if err := json.Unmarshal(data, &receiptMatches); err != nil {
		return nil, err
	}

	collectedBySaleID := make(map[string]float64)
	collectedByOutboundID := make(map[string]float64)
	for _, match := range receiptMatches {
		if match.SaleID != nil && *match.SaleID != "" {
			collectedBySaleID[*match.SaleID] += match.MatchedAmount
			continue
		}
		if match.OutboundID != nil && *match.OutboundID != "" {
			collectedByOutboundID[*match.OutboundID] += match.MatchedAmount
		}
	}

	ids := make([]string, 0, len(sales))
	for _, sale := range sales {
		totalAmount := 0.0
		if sale.TotalAmount != nil {
			totalAmount = *sale.TotalAmount
		}
		collectedAmount := collectedBySaleID[sale.SaleID]
		if sale.OutboundID != nil && *sale.OutboundID != "" {
			collectedAmount += collectedByOutboundID[*sale.OutboundID]
		}
		if saleReceiptStatusMatches(filter, totalAmount, collectedAmount) {
			ids = append(ids, sale.SaleID)
		}
	}
	return ids, nil
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
//   - receipt_status: open/unpaid/partial/paid
//
// 응답 헤더 X-Total-Count.
func (h *SaleHandler) List(w http.ResponseWriter, r *http.Request) {
	query := h.DB.From("sales").Select("sale_id,outbound_id,order_id,customer_id,quantity,capacity_kw,unit_price_wp,unit_price_ea,supply_amount,vat_amount,total_amount,tax_invoice_date,tax_invoice_email,erp_closed,erp_closed_date,status,memo,erp_sales_no,erp_line_no,currency,created_at,updated_at", "exact", false)
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
	Total               int64   `json:"total"`
	SaleAmountSum       float64 `json:"sale_amount_sum"`
	InvoicePendingCount int64   `json:"invoice_pending_count"`
}

// Summary — GET /api/v1/sales/summary — 매출 KPI 집계 (List 와 동일 필터).
func (h *SaleHandler) Summary(w http.ResponseWriter, r *http.Request) {
	// receipt_status 필터는 sale_id 수천 개를 URL 에 싣게 만들어 Cloudflare 가
	// URI Too Long 으로 차단한다. saleSummaryChunkSize 단위로 분할해 합산.
	if receiptStatus := r.URL.Query().Get("receipt_status"); receiptStatus != "" {
		h.summaryByReceiptStatus(w, r, receiptStatus)
		return
	}

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

	summary, err := h.executeSummary(query)
	if err != nil {
		log.Printf("[판매 요약 조회 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 요약 조회에 실패했습니다")
		return
	}
	response.RespondJSON(w, http.StatusOK, summary)
}

func (h *SaleHandler) summaryByReceiptStatus(w http.ResponseWriter, r *http.Request, status string) {
	// receipt_status / erp_closed=false / month·start·end 는 모두 sale_id 후보 리스트를
	// 만든다. applySaleFilters 가 한 번만 .In("sale_id", …) 을 부르도록 설계됐으므로,
	// 청크의 .In() 이 그 호출을 덮어쓰지 않도록 세 필터를 모두 수집해 직접 교집합한 뒤
	// 요청에서 제거하고 청크 단위로 다시 .In() 한다.
	var candidates [][]string

	receiptIDs, err := h.saleIDsByReceiptStatus(status)
	if err != nil {
		log.Printf("[판매 요약 수금 필터 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "판매 요약 수금 필터에 실패했습니다")
		return
	}
	if len(receiptIDs) == 0 {
		response.RespondJSON(w, http.StatusOK, SaleSummary{})
		return
	}
	candidates = append(candidates, receiptIDs)

	if r.URL.Query().Get("erp_closed") == "false" {
		ids, err := h.erpOpenSaleIDs()
		if err != nil {
			log.Printf("[판매 요약 ERP 필터 실패] %v", err)
			response.RespondError(w, http.StatusInternalServerError, "판매 요약 ERP 필터에 실패했습니다")
			return
		}
		if len(ids) == 0 {
			response.RespondJSON(w, http.StatusOK, SaleSummary{})
			return
		}
		candidates = append(candidates, ids)
	}

	month := r.URL.Query().Get("month")
	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")
	if month != "" || startDate != "" || endDate != "" {
		ids, err := h.saleIDsByBusinessDate(month, startDate, endDate)
		if err != nil {
			log.Printf("[판매 요약 기준일 필터 실패] %v", err)
			response.RespondError(w, http.StatusInternalServerError, "판매 요약 기준일 필터에 실패했습니다")
			return
		}
		if len(ids) == 0 {
			response.RespondJSON(w, http.StatusOK, SaleSummary{})
			return
		}
		candidates = append(candidates, ids)
	}

	intersected := intersectSaleIDLists(candidates)
	if len(intersected) == 0 {
		response.RespondJSON(w, http.StatusOK, SaleSummary{})
		return
	}

	// id-producing 필터는 모두 직접 처리했으므로 applySaleFilters 가 .In("sale_id", …) 을
	// 다시 부르지 않도록 stripped 요청에서 제거.
	stripped := *r
	strippedURL := *r.URL
	q := strippedURL.Query()
	q.Del("receipt_status")
	if q.Get("erp_closed") == "false" {
		q.Del("erp_closed")
	}
	q.Del("month")
	q.Del("start")
	q.Del("end")
	strippedURL.RawQuery = q.Encode()
	stripped.URL = &strippedURL

	summary := SaleSummary{}
	for _, chunk := range chunkSaleIDs(intersected, saleSummaryChunkSize) {
		query := h.DB.From("sales").Select("supply_amount, tax_invoice_date", "exact", false)
		query, ok, err := h.applySaleFilters(&stripped, query)
		if err != nil {
			log.Printf("[판매 요약 필터 처리 실패] %v", err)
			response.RespondError(w, http.StatusInternalServerError, "판매 요약 필터 처리에 실패했습니다")
			return
		}
		if !ok {
			continue
		}
		query = query.In("sale_id", chunk)

		partial, err := h.executeSummary(query)
		if err != nil {
			log.Printf("[판매 요약 조회 실패] %v", err)
			response.RespondError(w, http.StatusInternalServerError, "판매 요약 조회에 실패했습니다")
			return
		}
		summary.Total += partial.Total
		summary.SaleAmountSum += partial.SaleAmountSum
		summary.InvoicePendingCount += partial.InvoicePendingCount
	}
	response.RespondJSON(w, http.StatusOK, summary)
}

func (h *SaleHandler) executeSummary(query *postgrest.FilterBuilder) (SaleSummary, error) {
	data, count, err := query.Range(0, saleMaxLimit-1, "").Execute()
	if err != nil {
		return SaleSummary{}, err
	}

	var rows []struct {
		SupplyAmount   *float64 `json:"supply_amount"`
		TaxInvoiceDate *string  `json:"tax_invoice_date"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return SaleSummary{}, fmt.Errorf("디코딩: %w", err)
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
	return summary, nil
}

func chunkSaleIDs(ids []string, size int) [][]string {
	if size <= 0 || len(ids) == 0 {
		return nil
	}
	chunks := make([][]string, 0, (len(ids)+size-1)/size)
	for start := 0; start < len(ids); start += size {
		end := start + size
		if end > len(ids) {
			end = len(ids)
		}
		chunks = append(chunks, ids[start:end])
	}
	return chunks
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

func (h *SaleHandler) enrichSales(sales []model.Sale) []model.SaleListItem {
	var orders []saleOrderRow
	var outbounds []saleOutboundRow
	var products []saleProductRow
	var partners []salePartnerRow
	var receiptMatches []receiptMatchTargetAmountRow

	// 5 enrich 테이블 모두 fetchAllFromTable 헬퍼로 청크 페이지네이션 (D-064 PR 36).
	// PostgREST db-max-rows=1000 cap 으로 단일 Range 호출 시 첫 1000행만 응답 →
	// 1000 초과 테이블 (예: outbounds 2,229) 의 enrich 누락. 회귀 방지 위해 통일.
	if data, err := fetchAllFromTable(h.DB, "orders", "order_id, order_number, order_date, company_id, customer_id, product_id, quantity, capacity_kw, site_name"); err == nil {
		if err := json.Unmarshal(data, &orders); err != nil {
			log.Printf("[매출 enrich] orders 디코딩 실패 — 수주 정보 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] orders 조회 실패 — 수주 정보 비표시: %v", err)
	}
	if data, err := fetchAllFromTable(h.DB, "outbounds", "outbound_id, outbound_date, company_id, product_id, quantity, capacity_kw, site_name, order_id, status"); err == nil {
		if err := json.Unmarshal(data, &outbounds); err != nil {
			log.Printf("[매출 enrich] outbounds 디코딩 실패 — 출고 정보 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] outbounds 조회 실패 — 출고 정보 비표시: %v", err)
	}
	if data, err := fetchAllFromTable(h.DB, "products", "product_id, product_name, product_code, spec_wp, manufacturer_id"); err == nil {
		if err := json.Unmarshal(data, &products); err != nil {
			log.Printf("[매출 enrich] products 디코딩 실패 — 품목명/스펙 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] products 조회 실패 — 품목명/스펙 비표시: %v", err)
	}
	var manufacturers []saleManufacturerRow
	if data, err := fetchAllFromTable(h.DB, "manufacturers", "manufacturer_id, name_kr, short_name"); err == nil {
		if err := json.Unmarshal(data, &manufacturers); err != nil {
			log.Printf("[매출 enrich] manufacturers 디코딩 실패 — 제조사명 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] manufacturers 조회 실패 — 제조사명 비표시: %v", err)
	}
	if data, err := fetchAllFromTable(h.DB, "partners", "partner_id, partner_name"); err == nil {
		if err := json.Unmarshal(data, &partners); err != nil {
			log.Printf("[매출 enrich] partners 디코딩 실패 — 거래처명 비표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] partners 조회 실패 — 거래처명 비표시: %v", err)
	}
	if data, err := fetchAllFromTable(h.DB, "receipt_matches", "outbound_id, sale_id, matched_amount"); err == nil {
		if err := json.Unmarshal(data, &receiptMatches); err != nil {
			log.Printf("[매출 enrich] receipt_matches 디코딩 실패 — 수금상태 미표시: %v", err)
		}
	} else {
		log.Printf("[매출 enrich] receipt_matches 조회 실패 — 수금상태 미표시: %v", err)
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
	collectedBySaleID := make(map[string]float64)
	collectedByOutboundID := make(map[string]float64)
	for _, match := range receiptMatches {
		if match.SaleID != nil && *match.SaleID != "" {
			collectedBySaleID[*match.SaleID] += match.MatchedAmount
			continue
		}
		if match.OutboundID != nil && *match.OutboundID != "" {
			collectedByOutboundID[*match.OutboundID] += match.MatchedAmount
		}
	}

	items := make([]model.SaleListItem, 0, len(sales))
	for _, sale := range sales {
		collectedAmount := collectedBySaleID[sale.SaleID]
		if sale.OutboundID != nil && *sale.OutboundID != "" {
			collectedAmount += collectedByOutboundID[*sale.OutboundID]
		}
		outstandingAmount := 0.0
		receiptStatus := "unknown"
		if sale.TotalAmount != nil && *sale.TotalAmount > 0 {
			outstandingAmount = *sale.TotalAmount - collectedAmount
			if outstandingAmount < 0 {
				outstandingAmount = 0
			}
			switch {
			case outstandingAmount <= receiptMatchAmountEpsilon:
				receiptStatus = "paid"
			case collectedAmount > receiptMatchAmountEpsilon:
				receiptStatus = "partial"
			default:
				receiptStatus = "unpaid"
			}
		}
		item := model.SaleListItem{
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
