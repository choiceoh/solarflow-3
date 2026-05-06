package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// 매출 대시보드 집계 — OrdersPage 매출 탭 KPI/sparkline + SaleSummaryCards 의 client-side
// aggregation 을 서버에서 한 번에 처리해 wire payload 를 KB 단위로 줄인다 (C-1 sales).
//
// 이전 동작: 프론트가 useSaleListAll 로 전 sales 청크 누적 fetch (수 MB) 후 합계/카운트/거래처/단가 계산.
// 본 핸들러: List 와 동일한 필터 + 청크 누적 + enrichSales(outbound_date 채움) → 메모리 집계 → ~수 KB 응답.

const (
	saleDashboardChunkSize  = 1000
	saleDashboardMaxChunks  = 50
	saleDashboardTrendMonths = 24
	saleDashboardTopN        = 10
)

// SaleDashboard — /api/v1/sales/dashboard 응답.
//
// trend24: tax_invoice_date 우선, 없으면 outbound_date 로 binning. 매월 count, sale_amount_sum,
// pending_count(미발행, 같은 binning), distinct_customers, avg_unit_price_wp.
// pending_trend24: tax_invoice_date 가 비어있는 매출만 outbound_date 로 binning — SalesInvoicePendingInsight 화면용.
// by_*_top10: count, sale_amount_sum, invoice_pending_count, avg_unit_price_wp(≥3 priced 일 때만 0 아님), share.
type SaleDashboard struct {
	Totals              SaleDashTotals        `json:"totals"`
	Trend24             []SaleDashTrendPoint  `json:"trend24"`
	PendingTrend24      []SaleDashTrendPoint  `json:"pending_trend24"`
	ByCustomerTop10     []SaleDashBreakdownRow `json:"by_customer_top10"`
	ByManufacturerTop10 []SaleDashBreakdownRow `json:"by_manufacturer_top10"`
}

type SaleDashTotals struct {
	Count               int     `json:"count"`
	SaleAmountSum       float64 `json:"sale_amount_sum"`        // sum(total_amount)
	SupplyAmountSum     float64 `json:"supply_amount_sum"`      // sum(supply_amount)
	VatAmountSum        float64 `json:"vat_amount_sum"`         // sum(vat_amount)
	InvoiceIssuedCount  int     `json:"invoice_issued_count"`   // tax_invoice_date 있는 건수
	InvoicePendingCount int     `json:"invoice_pending_count"`  // tax_invoice_date 없는 건수
	CustomersCount      int     `json:"customers_count"`        // distinct customer_id
	AvgUnitPriceWp      float64 `json:"avg_unit_price_wp"`      // 평균 unit_price_wp (원/Wp)
}

// SaleDashTrendPoint — 월별 시계열 한 점.
// 기본 trend24 의 binning 은 tax_invoice_date 우선 → outbound_date.
// pending_trend24 는 tax_invoice_date null 인 행만 outbound_date 로 binning.
type SaleDashTrendPoint struct {
	Month             string  `json:"month"`
	Count             int     `json:"count"`
	SaleAmountSum     float64 `json:"sale_amount_sum"`
	PendingCount      int     `json:"pending_count"`
	DistinctCustomers int     `json:"distinct_customers"`
	AvgUnitPriceWp    float64 `json:"avg_unit_price_wp"`
}

// SaleDashBreakdownRow — 차원별 분해 (거래처/제조사). avg_unit_price_wp 는 priced(>0) 가
// 3건 이상일 때만 의미값. share 는 count 기준 0..1.
type SaleDashBreakdownRow struct {
	Key                 string  `json:"key"`
	Label               string  `json:"label"`
	Count               int     `json:"count"`
	SaleAmountSum       float64 `json:"sale_amount_sum"`
	InvoicePendingCount int     `json:"invoice_pending_count"`
	AvgUnitPriceWp      float64 `json:"avg_unit_price_wp"`
	Share               float64 `json:"share"`
}

// Dashboard — GET /api/v1/sales/dashboard.
// applySaleFilters 와 동일한 쿼리 파라미터 (customer_id, month, start, end, invoice_status, q, company_id).
// 페이지·정렬은 무시.
//
// 우선 sales_dashboard() RPC (migration 073) 호출 — DB-side GROUP BY 1 round-trip.
// RPC 가 미배포 (404 PGRST202) 또는 실패 시 기존 chunked Go-side 집계 경로로 fallback.
func (h *SaleHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	if dashJSON, ok := h.tryRPCSalesDashboard(r); ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dashJSON)
		return
	}
	// Fallback: chunked fetch + Go aggregation
	sales, err := h.fetchAllForSaleDashboard(r)
	if err != nil {
		log.Printf("[매출 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "매출 대시보드 데이터 조회에 실패했습니다")
		return
	}
	items := h.enrichSales(sales)
	dash := computeSaleDashboard(items)
	response.RespondJSON(w, http.StatusOK, dash)
}

// tryRPCSalesDashboard — sales_dashboard() RPC 호출 시도. 성공하면 jsonb 바이트 반환.
// 실패 시 (RPC 미배포, DB 오류) false 반환 → 호출자가 fallback 경로 사용.
//
// PostgREST RPC 호출은 codebase 기존 패턴 (From("rpc/"+name).Insert(body)) 사용.
func (h *SaleHandler) tryRPCSalesDashboard(r *http.Request) ([]byte, bool) {
	q := r.URL.Query()
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}
	if v := q.Get("customer_id"); v != "" {
		args["p_customer_id"] = v
	}
	if v := q.Get("outbound_id"); v != "" {
		args["p_outbound_id"] = v
	}
	if v := q.Get("order_id"); v != "" {
		args["p_order_id"] = v
	}
	if v := q.Get("status"); v != "" {
		args["p_status"] = v
	}
	if v := q.Get("month"); v != "" {
		args["p_month"] = v
	}
	if v := q.Get("start"); v != "" {
		args["p_start"] = v
	}
	if v := q.Get("end"); v != "" {
		args["p_end"] = v
	}
	if v := q.Get("invoice_status"); v != "" {
		args["p_invoice_status"] = v
	}
	if v := q.Get("q"); v != "" {
		args["p_q"] = v
	}

	// PostgREST RPC POST /rpc/sales_dashboard. Insert payload 가 함수 인자 (named).
	// "" return preference — 함수 RETURNS jsonb 면 array-wrapped jsonb 가 돌아옴.
	data, _, err := h.DB.From("rpc/sales_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		// 일반 실패 시나리오:
		//   - PGRST202 (RPC 미발견) — migration 073 미적용
		//   - 권한 (GRANT EXECUTE 누락)
		//   - SQL 런타임 오류
		// 어떤 경우든 fallback 으로 넘긴다. 운영 적용 후엔 이 경로 0 회로 수렴해야 함.
		log.Printf("[매출 대시보드 RPC 실패 — fallback 사용] %v", err)
		return nil, false
	}
	// PostgREST 가 RETURNING jsonb 함수 결과를 단일 객체 또는 [obj] 배열로 줄 수 있음.
	// scalar 함수 호출은 single-row table 결과로 와서 [{ "sales_dashboard": {...} }] 형태일 수도.
	// 단일 jsonb 가 그대로 오는 정상 케이스를 우선, 이외 케이스는 unmarshal 시도.
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		// 배열로 감싸진 경우 첫 요소만 추출.
		var arr []json.RawMessage
		if data[0] == '[' && json.Unmarshal(data, &arr) == nil && len(arr) > 0 {
			// arr[0] 가 단순 jsonb 면 그대로, { "sales_dashboard": {...} } 형태면 키 추출.
			var wrap map[string]json.RawMessage
			if json.Unmarshal(arr[0], &wrap) == nil {
				if inner, ok := wrap["sales_dashboard"]; ok {
					return inner, true
				}
			}
			return arr[0], true
		}
		return data, true
	}
	return nil, false
}

// fetchAllForSaleDashboard — 필터 적용 후 1000 행 청크로 sales 전체를 끌어온다.
func (h *SaleHandler) fetchAllForSaleDashboard(r *http.Request) ([]model.Sale, error) {
	cols := "sale_id,outbound_id,order_id,customer_id,quantity,capacity_kw,unit_price_wp,unit_price_ea,supply_amount,vat_amount,total_amount,tax_invoice_date,tax_invoice_email,erp_closed,erp_closed_date,status,memo,erp_sales_no,erp_line_no,currency,created_at,updated_at"
	all := make([]model.Sale, 0, saleDashboardChunkSize)
	for chunk := 0; chunk < saleDashboardMaxChunks; chunk++ {
		q := h.DB.From("sales").Select(cols, "exact", false)
		q, ok, err := h.applySaleFilters(r, q)
		if err != nil {
			return nil, fmt.Errorf("필터 처리 실패: %w", err)
		}
		if !ok {
			return all, nil
		}
		offset := chunk * saleDashboardChunkSize
		q = q.Range(offset, offset+saleDashboardChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("sales 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []model.Sale
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("sales 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < saleDashboardChunkSize {
			break
		}
	}
	return all, nil
}

func computeSaleDashboard(items []model.SaleListItem) *SaleDashboard {
	d := &SaleDashboard{
		Trend24:             make([]SaleDashTrendPoint, 0, saleDashboardTrendMonths),
		PendingTrend24:      make([]SaleDashTrendPoint, 0, saleDashboardTrendMonths),
		ByCustomerTop10:     []SaleDashBreakdownRow{},
		ByManufacturerTop10: []SaleDashBreakdownRow{},
	}
	d.Totals = computeSaleDashTotals(items)
	d.Trend24 = computeSaleDashTrend24(items)
	d.PendingTrend24 = computeSaleDashPendingTrend24(items)
	d.ByCustomerTop10 = computeSaleDashBreakdown(items, saleDimCustomer, saleDashboardTopN)
	d.ByManufacturerTop10 = computeSaleDashBreakdown(items, saleDimManufacturer, saleDashboardTopN)
	return d
}

func computeSaleDashTotals(items []model.SaleListItem) SaleDashTotals {
	t := SaleDashTotals{Count: len(items)}
	customers := make(map[string]struct{}, 32)
	unitPriceSum := 0.0
	unitPriceN := 0
	for _, s := range items {
		if s.Sale.SupplyAmount != nil {
			t.SupplyAmountSum += *s.Sale.SupplyAmount
		}
		if s.Sale.VatAmount != nil {
			t.VatAmountSum += *s.Sale.VatAmount
		}
		if s.Sale.TotalAmount != nil {
			t.SaleAmountSum += *s.Sale.TotalAmount
		} else if s.TotalAmount != nil {
			t.SaleAmountSum += *s.TotalAmount
		}
		if s.TaxInvoiceDate != nil && *s.TaxInvoiceDate != "" {
			t.InvoiceIssuedCount++
		} else if s.Sale.TaxInvoiceDate != nil && *s.Sale.TaxInvoiceDate != "" {
			t.InvoiceIssuedCount++
		} else {
			t.InvoicePendingCount++
		}
		if s.CustomerID != "" {
			customers[s.CustomerID] = struct{}{}
		}
		// unit_price_wp 평균 — 0/null 스킵해 노이즈 회피.
		uw := saleUnitPriceWp(s)
		if uw > 0 {
			unitPriceSum += uw
			unitPriceN++
		}
	}
	t.CustomersCount = len(customers)
	if unitPriceN > 0 {
		t.AvgUnitPriceWp = unitPriceSum / float64(unitPriceN)
	}
	return t
}

// saleUnitPriceWp — SaleListItem.UnitPriceWp 우선, 없으면 unit_price_ea/spec_wp 로 derive.
// 프론트와 동일한 fallback 로직 (OrdersPage avg 계산식).
func saleUnitPriceWp(s model.SaleListItem) float64 {
	if s.UnitPriceWp > 0 {
		return s.UnitPriceWp
	}
	if s.SpecWp != nil && *s.SpecWp > 0 && s.UnitPriceEa != nil {
		return *s.UnitPriceEa / *s.SpecWp
	}
	return 0
}

// saleDateForBin — 월별 binning 용. tax_invoice_date 우선, 없으면 outbound_date.
func saleDateForBin(s model.SaleListItem) string {
	if s.TaxInvoiceDate != nil && *s.TaxInvoiceDate != "" {
		return *s.TaxInvoiceDate
	}
	if s.OutboundDate != nil && *s.OutboundDate != "" {
		return *s.OutboundDate
	}
	return ""
}

func computeSaleDashTrend24(items []model.SaleListItem) []SaleDashTrendPoint {
	now := time.Now()
	labels := make([]string, saleDashboardTrendMonths)
	idx := make(map[string]int, saleDashboardTrendMonths)
	for i := 0; i < saleDashboardTrendMonths; i++ {
		t := now.AddDate(0, -(saleDashboardTrendMonths-1-i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]SaleDashTrendPoint, saleDashboardTrendMonths)
	for i, m := range labels {
		out[i] = SaleDashTrendPoint{Month: m}
	}
	// distinct customer + avg unit_price 누적용 보조 버킷.
	customers := make([]map[string]struct{}, saleDashboardTrendMonths)
	priceSum := make([]float64, saleDashboardTrendMonths)
	priceN := make([]int, saleDashboardTrendMonths)
	for i := range customers {
		customers[i] = make(map[string]struct{}, 4)
	}
	for _, s := range items {
		m := monthOf(saleDateForBin(s))
		if m == "" {
			continue
		}
		i, ok := idx[m]
		if !ok {
			continue
		}
		out[i].Count++
		if s.Sale.TotalAmount != nil {
			out[i].SaleAmountSum += *s.Sale.TotalAmount
		} else if s.TotalAmount != nil {
			out[i].SaleAmountSum += *s.TotalAmount
		}
		issued := (s.TaxInvoiceDate != nil && *s.TaxInvoiceDate != "") ||
			(s.Sale.TaxInvoiceDate != nil && *s.Sale.TaxInvoiceDate != "")
		if !issued {
			out[i].PendingCount++
		}
		if s.CustomerID != "" {
			customers[i][s.CustomerID] = struct{}{}
		}
		uw := saleUnitPriceWp(s)
		if uw > 0 {
			priceSum[i] += uw
			priceN[i]++
		}
	}
	for i := range out {
		out[i].DistinctCustomers = len(customers[i])
		if priceN[i] > 0 {
			out[i].AvgUnitPriceWp = priceSum[i] / float64(priceN[i])
		}
	}
	return out
}

// computeSaleDashPendingTrend24 — tax_invoice_date 가 비어있는 매출만 outbound_date 로 binning.
// SalesInvoicePendingInsight 화면용 (outboundDate 기반 누적).
func computeSaleDashPendingTrend24(items []model.SaleListItem) []SaleDashTrendPoint {
	now := time.Now()
	labels := make([]string, saleDashboardTrendMonths)
	idx := make(map[string]int, saleDashboardTrendMonths)
	for i := 0; i < saleDashboardTrendMonths; i++ {
		t := now.AddDate(0, -(saleDashboardTrendMonths-1-i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]SaleDashTrendPoint, saleDashboardTrendMonths)
	for i, m := range labels {
		out[i] = SaleDashTrendPoint{Month: m}
	}
	for _, s := range items {
		issued := (s.TaxInvoiceDate != nil && *s.TaxInvoiceDate != "") ||
			(s.Sale.TaxInvoiceDate != nil && *s.Sale.TaxInvoiceDate != "")
		if issued {
			continue
		}
		// pending 은 outbound_date 우선, 없으면 order_date.
		var date string
		if s.OutboundDate != nil && *s.OutboundDate != "" {
			date = *s.OutboundDate
		} else if s.OrderDate != nil && *s.OrderDate != "" {
			date = *s.OrderDate
		}
		m := monthOf(date)
		if m == "" {
			continue
		}
		i, ok := idx[m]
		if !ok {
			continue
		}
		out[i].Count++
		out[i].PendingCount++
	}
	return out
}

type saleBreakdownDim int

const (
	saleDimCustomer saleBreakdownDim = iota
	saleDimManufacturer
)

// computeSaleDashBreakdown — customer 또는 manufacturer 차원으로 분해. avg_unit_price_wp 는 priced(>0) ≥ 3 일 때만.
// sale_amount_sum 내림차순 정렬 (top N 의미).
func computeSaleDashBreakdown(items []model.SaleListItem, dim saleBreakdownDim, top int) []SaleDashBreakdownRow {
	type acc struct {
		label    string
		count    int
		amount   float64
		pending  int
		priceSum float64
		priceN   int
	}
	m := make(map[string]*acc, 32)
	totalCount := 0
	for _, s := range items {
		var key, label string
		switch dim {
		case saleDimCustomer:
			key = s.CustomerID
			if key == "" {
				key = "__unset__"
			}
			label = strPtrOr(s.CustomerName, "미지정")
		case saleDimManufacturer:
			if s.ManufacturerID != nil && *s.ManufacturerID != "" {
				key = *s.ManufacturerID
			} else {
				key = "__unset__"
			}
			label = strPtrOr(s.ManufacturerName, "미지정")
		}
		a, ok := m[key]
		if !ok {
			a = &acc{label: label}
			m[key] = a
		}
		a.count++
		if s.Sale.TotalAmount != nil {
			a.amount += *s.Sale.TotalAmount
		} else if s.TotalAmount != nil {
			a.amount += *s.TotalAmount
		}
		issued := (s.TaxInvoiceDate != nil && *s.TaxInvoiceDate != "") ||
			(s.Sale.TaxInvoiceDate != nil && *s.Sale.TaxInvoiceDate != "")
		if !issued {
			a.pending++
		}
		uw := saleUnitPriceWp(s)
		if uw > 0 {
			a.priceSum += uw
			a.priceN++
		}
		totalCount++
	}
	rows := make([]SaleDashBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		avg := 0.0
		if a.priceN >= 3 {
			avg = a.priceSum / float64(a.priceN)
		}
		rows = append(rows, SaleDashBreakdownRow{
			Key:                 k,
			Label:               a.label,
			Count:               a.count,
			SaleAmountSum:       a.amount,
			InvoicePendingCount: a.pending,
			AvgUnitPriceWp:      avg,
			Share:               share,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].SaleAmountSum != rows[j].SaleAmountSum {
			return rows[i].SaleAmountSum > rows[j].SaleAmountSum
		}
		return rows[i].Count > rows[j].Count
	})
	if top > 0 && len(rows) > top {
		return rows[:top]
	}
	return rows
}
