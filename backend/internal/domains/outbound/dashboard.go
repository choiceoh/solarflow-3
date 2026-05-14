package outbound

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/response"
)

// 출고 대시보드 집계 — OrdersPage outbound 탭 KPI/sparkline + 4 개 Insights 의 client-side
// breakdown 을 서버에서 한 번에 처리해 wire payload 를 KB 단위로 줄인다.
//
// 이전 동작:
//   - 프론트가 useOutboundListAll 로 전 outbounds 청크 누적 fetch (5 MB+ wire) 후
//     KPI/sparkline/breakdown 을 브라우저에서 계산.
// 본 핸들러:
//   - List 와 동일한 필터를 적용해 전체 outbounds 를 청크로 끌어오고,
//     enrichOutbounds 로 product/manufacturer/customer/sale 메타를 채운 뒤
//     필요한 집계만 계산해 ~수 KB JSON 으로 응답.
//
// 추후 개선 방향: outbounds 가 1만 행을 넘어가면 SQL 측 GROUP BY (Postgres RPC 또는
// Rust 엔진) 로 옮긴다. 본 v1 은 PostgREST 청크 + Go 메모리 집계.

// dashboardChunkSize / dashboardMaxChunks — Supabase Cloud db-max-rows=1000 가드를
// 따라 청크당 1000 행. 5만 행까지 안전 (50 청크 × 1000).
const (
	dashboardChunkSize   = 1000
	dashboardMaxChunks   = 50
	dashboardTrendMonths = 24
	dashboardTopN        = 10
)

// OutboundDashboard — /api/v1/outbounds/dashboard 응답.
//
// breakdowns(by_usage / by_manufacturer_top10 / by_customer_top10) 은 ?period 쿼리 파라미터에 따라 범위가 달라진다:
//   - period=lifetime (기본) — 필터 적용된 전체
//   - period=prev_month — 직전 달만 (OutboundKwInsight 용)
//   - period=year — 올해(YYYY-) 만 (OutboundKwYearInsight 용)
//
// trend24 / weekly12 / yoy3y / totals 는 period 와 무관하게 항상 전체 기준.
type OutboundDashboard struct {
	Totals              OutboundDashTotals         `json:"totals"`
	Trend24             []OutboundTrendPoint       `json:"trend24"`
	Weekly12            []OutboundDashWeeklyPoint  `json:"weekly12"`
	YoY3Y               OutboundDashYoY3Y          `json:"yoy3y"`
	Period              string                     `json:"period"`
	ByUsage             []OutboundBreakdownRow     `json:"by_usage"`
	ByManufacturerTop10 []OutboundBreakdownRow     `json:"by_manufacturer_top10"`
	ByCustomerTop10     []OutboundBreakdownRow     `json:"by_customer_top10"`
	SaleConversion      OutboundDashSaleConversion `json:"sale_conversion"`
}

// OutboundDashWeeklyPoint — 최근 12 주 (월요일 시작) 한 점. OrdersPage 우측 레일 "주간 출고" 막대.
type OutboundDashWeeklyPoint struct {
	WeekStart string  `json:"week_start"` // 'YYYY-MM-DD' (월요일)
	Count     int     `json:"count"`
	KwSum     float64 `json:"kw_sum"`
}

// OutboundDashYoY3Y — 3 년 동기 비교용 월별 kW. OrdersPage '금년 출고 용량' KPI sparkline 에 사용.
// 길이는 months_this_year (1..12) — 현재월까지만 채운다. 같은 인덱스끼리 (2년전, 1년전, 올해) 동월.
// last_year_same 은 작년의 같은 기간(1월~현재월의 같은날까지) 누계 — yoy_pct 분모.
type OutboundDashYoY3Y struct {
	MonthsThisYear int       `json:"months_this_year"`
	TwoYearsAgo    []float64 `json:"two_years_ago"`
	LastYear       []float64 `json:"last_year"`
	CurrentYear    []float64 `json:"current_year"`
	LastYearSame   float64   `json:"last_year_same"`
	YoYPct         *float64  `json:"yoy_pct"`
}

type OutboundDashTotals struct {
	Count               int     `json:"count"`
	KwSum               float64 `json:"kw_sum"`
	ActiveCount         int     `json:"active_count"`
	CancelPendingCount  int     `json:"cancel_pending_count"`
	CancelledCount      int     `json:"cancelled_count"`
	SaleAmountSum       float64 `json:"sale_amount_sum"`
	InvoicePendingCount int     `json:"invoice_pending_count"`
}

// OutboundTrendPoint — 월별 시계열 한 점. month 는 'YYYY-MM'.
type OutboundTrendPoint struct {
	Month string  `json:"month"`
	Count int     `json:"count"`
	KwSum float64 `json:"kw_sum"`
}

// OutboundBreakdownRow — 차원별 분해 한 줄. share 는 0..1 (count 기준).
type OutboundBreakdownRow struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Count int     `json:"count"`
	KwSum float64 `json:"kw_sum"`
	Share float64 `json:"share"`
}

// OutboundDashSaleConversion — 매출 연결율: 매출대상 (usage_category in sale/sale_spare)
// 중 sales 레코드 연결된 비율 + 월별 추이 + 차원별 분해.
// 차원별 분해는 SaleConversionInsight 의 거래처/제조사/용도 별 연결률 화면에 사용.
type OutboundDashSaleConversion struct {
	EligibleCount       int                            `json:"eligible_count"`
	LinkedCount         int                            `json:"linked_count"`
	Monthly             []OutboundDashSaleMonthlyPoint `json:"monthly"`
	ByUsage             []OutboundSaleConvBreakdownRow `json:"by_usage"`
	ByManufacturerTop10 []OutboundSaleConvBreakdownRow `json:"by_manufacturer_top10"`
	ByCustomerTop10     []OutboundSaleConvBreakdownRow `json:"by_customer_top10"`
}

type OutboundDashSaleMonthlyPoint struct {
	Month         string `json:"month"`
	EligibleCount int    `json:"eligible_count"`
	LinkedCount   int    `json:"linked_count"`
}

// OutboundSaleConvBreakdownRow — sale_conversion.by_* 행. value 는 연결률(%) 0..100.
// 매출 대상이 너무 적은 차원(노이즈) 제거는 클라이언트에서 처리.
type OutboundSaleConvBreakdownRow struct {
	Key           string  `json:"key"`
	Label         string  `json:"label"`
	EligibleCount int     `json:"eligible_count"`
	LinkedCount   int     `json:"linked_count"`
	Rate          float64 `json:"rate"`
}

// Dashboard — GET /api/v1/outbounds/dashboard.
// applyOutboundFilters 와 동일한 쿼리 파라미터 (status, usage_category, manufacturer_id, q,
// company_id 등) 를 받는다. 페이지·정렬은 무시.
//
// outbounds_dashboard() RPC (migration 076) 우선. 미배포/실패 시 chunked Go 경로 fallback.
func (h *OutboundHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	if dashJSON, ok := h.tryRPCOutboundsDashboard(r); ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dashJSON)
		return
	}
	outbounds, err := h.fetchAllForDashboard(r)
	if err != nil {
		log.Printf("[출고 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 대시보드 데이터 조회에 실패했습니다")
		return
	}
	enriched, err := h.enrichOutbounds(outbounds)
	if err != nil {
		log.Printf("[출고 대시보드 enrich 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "출고 대시보드 참조 데이터 처리에 실패했습니다")
		return
	}
	period := normalizePeriod(r.URL.Query().Get("period"))
	dash := computeOutboundDashboard(enriched, period)
	response.RespondJSON(w, http.StatusOK, dash)
}

// normalizePeriod — ?period 파라미터를 lifetime/prev_month/year 중 하나로 정규화.
// 미지정 또는 알 수 없는 값은 lifetime.
func normalizePeriod(raw string) string {
	switch raw {
	case "prev_month", "year":
		return raw
	}
	return "lifetime"
}

// tryRPCOutboundsDashboard — outbounds_dashboard() RPC 호출.
func (h *OutboundHandler) tryRPCOutboundsDashboard(r *http.Request) ([]byte, bool) {
	q := r.URL.Query()
	// 용량(kW)·업무 큐 필터는 현재 RPC 시그니처(migration 076)가 모르므로 fallback Go 경로 사용.
	if q.Get("min_kw") != "" || q.Get("max_kw") != "" || q.Get("work_queue") != "" {
		return nil, false
	}
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}
	if v := q.Get("status"); v != "" {
		args["p_status"] = v
	}
	if v := q.Get("usage_category"); v != "" {
		args["p_usage_category"] = v
	}
	if v := q.Get("manufacturer_id"); v != "" {
		args["p_manufacturer_id"] = v
	}
	if v := q.Get("q"); v != "" {
		args["p_q"] = v
	}
	args["p_period"] = normalizePeriod(q.Get("period"))

	data, _, err := h.DB.From("rpc/outbounds_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[출고 대시보드 RPC 실패 — fallback 사용] %v", err)
		return nil, false
	}
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		var arr []json.RawMessage
		if data[0] == '[' && json.Unmarshal(data, &arr) == nil && len(arr) > 0 {
			var wrap map[string]json.RawMessage
			if json.Unmarshal(arr[0], &wrap) == nil {
				if inner, ok := wrap["outbounds_dashboard"]; ok {
					return inner, true
				}
			}
			return arr[0], true
		}
		return data, true
	}
	return nil, false
}

// fetchAllForDashboard — 필터 적용 후 1000 행 청크로 outbounds 전체를 끌어온다.
// PostgREST db-max-rows=1000 가드를 우회하는 offset 누적 패턴 (프론트 fetchAllOutbounds 와 동일 전략).
func (h *OutboundHandler) fetchAllForDashboard(r *http.Request) ([]Outbound, error) {
	all := make([]Outbound, 0, dashboardChunkSize)
	baseTable := outboundsBaseTable(r)
	for chunk := 0; chunk < dashboardMaxChunks; chunk++ {
		q := h.DB.From(baseTable).Select(outboundListColumns, "exact", false)
		q, ok, err := h.applyOutboundFilters(r, q)
		if err != nil {
			return nil, fmt.Errorf("필터 처리 실패: %w", err)
		}
		if !ok {
			return all, nil
		}
		offset := chunk * dashboardChunkSize
		q = q.Range(offset, offset+dashboardChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("outbounds 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []Outbound
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("outbounds 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < dashboardChunkSize {
			break
		}
	}
	return all, nil
}

// computeOutboundDashboard — enriched outbounds 에서 KPI/trend/breakdown 을 계산한다.
// period 가 lifetime 이면 입력 그대로, prev_month/year 면 해당 기간의 outbounds 만 breakdown 에 사용.
// totals, trend24, sale_conversion 은 항상 전체 기준.
// 입력 슬라이스를 변경하지 않는다.
func computeOutboundDashboard(outbounds []Outbound, period string) *OutboundDashboard {
	d := &OutboundDashboard{
		Period:              period,
		Trend24:             make([]OutboundTrendPoint, 0, dashboardTrendMonths),
		ByUsage:             []OutboundBreakdownRow{},
		ByManufacturerTop10: []OutboundBreakdownRow{},
		ByCustomerTop10:     []OutboundBreakdownRow{},
	}
	d.Totals = computeDashTotals(outbounds)
	d.Trend24 = computeDashTrend24(outbounds)
	d.Weekly12 = computeDashWeekly12(outbounds)
	d.YoY3Y = computeDashYoY3Y(outbounds)

	scoped := filterByPeriod(outbounds, period)
	d.ByUsage = computeDashBreakdown(scoped, dimUsage)
	d.ByManufacturerTop10 = topN(computeDashBreakdown(scoped, dimManufacturer), dashboardTopN)
	// 거래처는 sale/sale_spare 만: 다른 용도는 order_id 없어 customer 가 항상 '미지정'.
	d.ByCustomerTop10 = topN(computeDashBreakdown(filterSaleEligible(scoped), dimCustomer), dashboardTopN)

	d.SaleConversion = computeDashSaleConversion(outbounds)
	return d
}

// computeDashWeekly12 — 현재 주(월요일 시작) 포함 직전 12주의 count + kw 합.
// 인덱스 0 이 가장 과거, 11 이 이번 주.
func computeDashWeekly12(outbounds []Outbound) []OutboundDashWeeklyPoint {
	const weeks = 12
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	dow := int(today.Weekday())
	if dow == 0 {
		dow = 7
	}
	thisWeekStart := today.AddDate(0, 0, -(dow - 1)) // Monday-based
	starts := make([]time.Time, weeks)
	out := make([]OutboundDashWeeklyPoint, weeks)
	for i := 0; i < weeks; i++ {
		s := thisWeekStart.AddDate(0, 0, -7*(weeks-1-i))
		starts[i] = s
		out[i] = OutboundDashWeeklyPoint{WeekStart: s.Format("2006-01-02")}
	}
	for _, o := range outbounds {
		if o.OutboundDate == "" {
			continue
		}
		t, err := time.ParseInLocation("2006-01-02", o.OutboundDate[:10], now.Location())
		if err != nil {
			continue
		}
		t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, now.Location())
		dw := int(t.Weekday())
		if dw == 0 {
			dw = 7
		}
		itemWeekStart := t.AddDate(0, 0, -(dw - 1))
		diffDays := int(thisWeekStart.Sub(itemWeekStart).Hours() / 24)
		diffWeeks := diffDays / 7
		if diffWeeks >= 0 && diffWeeks < weeks {
			idx := weeks - 1 - diffWeeks
			out[idx].Count++
			if o.CapacityKw != nil {
				out[idx].KwSum += *o.CapacityKw
			}
		}
	}
	return out
}

// computeDashYoY3Y — 올해 1월~현재월(같은날까지) 의 월별 kW 를 (2년전, 1년전, 올해) 3 트랙으로.
// last_year_same 은 작년 같은 기간(1월 1일 ~ (현재월,현재일)) 누계, yoy_pct 분모.
func computeDashYoY3Y(outbounds []Outbound) OutboundDashYoY3Y {
	now := time.Now()
	currYear := now.Year()
	currMonth := int(now.Month())
	currDay := now.Day()
	monthsThisYear := currMonth // 1..12
	res := OutboundDashYoY3Y{
		MonthsThisYear: monthsThisYear,
		TwoYearsAgo:    make([]float64, monthsThisYear),
		LastYear:       make([]float64, monthsThisYear),
		CurrentYear:    make([]float64, monthsThisYear),
	}
	lastYear := currYear - 1
	twoYearsAgo := currYear - 2
	year := 0.0
	lastYearSame := 0.0
	lastYearHasAny := false
	for _, o := range outbounds {
		if o.OutboundDate == "" {
			continue
		}
		t, err := time.ParseInLocation("2006-01-02", o.OutboundDate[:10], now.Location())
		if err != nil {
			continue
		}
		y := t.Year()
		m := int(t.Month()) // 1..12
		day := t.Day()
		kw := 0.0
		if o.CapacityKw != nil {
			kw = *o.CapacityKw
		}
		if y == currYear {
			year += kw
		}
		if y == lastYear {
			lastYearHasAny = true
			if m < currMonth || (m == currMonth && day <= currDay) {
				lastYearSame += kw
			}
		}
		if m <= currMonth {
			idx := m - 1 // 0-based
			switch y {
			case twoYearsAgo:
				res.TwoYearsAgo[idx] += kw
			case lastYear:
				res.LastYear[idx] += kw
			case currYear:
				res.CurrentYear[idx] += kw
			}
		}
	}
	res.LastYearSame = lastYearSame
	if lastYearHasAny && lastYearSame > 0 {
		v := (year - lastYearSame) / lastYearSame * 100.0
		res.YoYPct = &v
	}
	return res
}

// filterByPeriod — period 별로 outbounds 를 필터링한다. lifetime 은 그대로 반환.
func filterByPeriod(outbounds []Outbound, period string) []Outbound {
	if period == "lifetime" {
		return outbounds
	}
	now := time.Now()
	var prefix string
	switch period {
	case "prev_month":
		t := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -1, 0)
		prefix = fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
	case "year":
		prefix = fmt.Sprintf("%04d-", now.Year())
	default:
		return outbounds
	}
	out := make([]Outbound, 0, len(outbounds))
	for _, o := range outbounds {
		if len(o.OutboundDate) >= len(prefix) && o.OutboundDate[:len(prefix)] == prefix {
			out = append(out, o)
		}
	}
	return out
}

func computeDashTotals(outbounds []Outbound) OutboundDashTotals {
	t := OutboundDashTotals{Count: len(outbounds)}
	for _, o := range outbounds {
		if o.CapacityKw != nil {
			t.KwSum += *o.CapacityKw
		}
		switch o.Status {
		case "active":
			t.ActiveCount++
		case "cancel_pending":
			t.CancelPendingCount++
		case "cancelled":
			t.CancelledCount++
		}
		if o.Sale != nil {
			if o.Sale.TotalAmount != nil {
				t.SaleAmountSum += *o.Sale.TotalAmount
			}
			if o.Sale.TaxInvoiceDate == nil || *o.Sale.TaxInvoiceDate == "" {
				t.InvoicePendingCount++
			}
		}
	}
	return t
}

// computeDashTrend24 — 현재 시각 기준 직전 24개월 (현재월 포함) 의 월별 count + kw 합계.
// 데이터가 없는 월도 포함 — 프론트가 길이 24의 배열을 전제로 그래프를 그리기 때문.
func computeDashTrend24(outbounds []Outbound) []OutboundTrendPoint {
	now := time.Now()
	labels := make([]string, dashboardTrendMonths)
	idx := make(map[string]int, dashboardTrendMonths)
	for i := 0; i < dashboardTrendMonths; i++ {
		t := now.AddDate(0, -(dashboardTrendMonths - 1 - i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]OutboundTrendPoint, dashboardTrendMonths)
	for i, m := range labels {
		out[i] = OutboundTrendPoint{Month: m}
	}
	for _, o := range outbounds {
		m := handlerutil.MonthOf(o.OutboundDate)
		if m == "" {
			continue
		}
		i, ok := idx[m]
		if !ok {
			continue
		}
		out[i].Count++
		if o.CapacityKw != nil {
			out[i].KwSum += *o.CapacityKw
		}
	}
	return out
}

type breakdownDim int

const (
	dimUsage breakdownDim = iota
	dimManufacturer
	dimCustomer
)

func computeDashBreakdown(outbounds []Outbound, dim breakdownDim) []OutboundBreakdownRow {
	type acc struct {
		label string
		count int
		kw    float64
	}
	m := make(map[string]*acc, 16)
	totalCount := 0
	for _, o := range outbounds {
		var key, label string
		switch dim {
		case dimUsage:
			key = o.UsageCategory
			label = usageLabel(o.UsageCategory)
		case dimManufacturer:
			if o.ManufacturerID != nil && *o.ManufacturerID != "" {
				key = *o.ManufacturerID
			} else {
				key = "__unset__"
			}
			label = handlerutil.StrPtrOr(o.ManufacturerName, "미지정")
		case dimCustomer:
			if o.CustomerID != nil && *o.CustomerID != "" {
				key = *o.CustomerID
			} else {
				key = "__unset__"
			}
			label = handlerutil.StrPtrOr(o.CustomerName, "미지정")
		}
		a, ok := m[key]
		if !ok {
			a = &acc{label: label}
			m[key] = a
		}
		a.count++
		if o.CapacityKw != nil {
			a.kw += *o.CapacityKw
		}
		totalCount++
	}
	rows := make([]OutboundBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		rows = append(rows, OutboundBreakdownRow{
			Key:   k,
			Label: a.label,
			Count: a.count,
			KwSum: a.kw,
			Share: share,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Count != rows[j].Count {
			return rows[i].Count > rows[j].Count
		}
		return rows[i].KwSum > rows[j].KwSum
	})
	return rows
}

func topN(rows []OutboundBreakdownRow, n int) []OutboundBreakdownRow {
	if len(rows) <= n {
		return rows
	}
	return rows[:n]
}

// computeDashSaleConversion — usage_category in (sale, sale_spare) 인 출고 중 sales 레코드 연결된 비율.
// monthly 는 24개월 윈도우. 차원별 분해는 by_usage / by_manufacturer_top10 / by_customer_top10.
func computeDashSaleConversion(outbounds []Outbound) OutboundDashSaleConversion {
	out := OutboundDashSaleConversion{
		ByUsage:             []OutboundSaleConvBreakdownRow{},
		ByManufacturerTop10: []OutboundSaleConvBreakdownRow{},
		ByCustomerTop10:     []OutboundSaleConvBreakdownRow{},
	}
	now := time.Now()
	labels := make([]string, dashboardTrendMonths)
	idx := make(map[string]int, dashboardTrendMonths)
	for i := 0; i < dashboardTrendMonths; i++ {
		t := now.AddDate(0, -(dashboardTrendMonths - 1 - i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	monthly := make([]OutboundDashSaleMonthlyPoint, dashboardTrendMonths)
	for i, m := range labels {
		monthly[i] = OutboundDashSaleMonthlyPoint{Month: m}
	}

	usageMap := make(map[string]*convAcc, 16)
	mfgMap := make(map[string]*convAcc, 32)
	custMap := make(map[string]*convAcc, 64)

	for _, o := range outbounds {
		if !isSaleEligible(o.UsageCategory) {
			continue
		}
		out.EligibleCount++
		linked := o.Sale != nil
		if linked {
			out.LinkedCount++
		}
		m := handlerutil.MonthOf(o.OutboundDate)
		if m != "" {
			if i, ok := idx[m]; ok {
				monthly[i].EligibleCount++
				if linked {
					monthly[i].LinkedCount++
				}
			}
		}
		bumpConv(usageMap, o.UsageCategory, usageLabel(o.UsageCategory), linked)
		mfgKey, mfgLabel := mfgKeyLabel(o)
		bumpConv(mfgMap, mfgKey, mfgLabel, linked)
		custKey, custLabel := custKeyLabel(o)
		bumpConv(custMap, custKey, custLabel, linked)
	}
	out.Monthly = monthly
	out.ByUsage = convRows(usageMap, 0)
	out.ByManufacturerTop10 = convRows(mfgMap, dashboardTopN)
	out.ByCustomerTop10 = convRows(custMap, dashboardTopN)
	return out
}

// convAcc — sale conversion 차원별 누적 버킷.
type convAcc struct {
	label    string
	eligible int
	linked   int
}

func bumpConv(m map[string]*convAcc, key, label string, linked bool) {
	a, ok := m[key]
	if !ok {
		a = &convAcc{label: label}
		m[key] = a
	}
	a.eligible++
	if linked {
		a.linked++
	}
}

func convRows(m map[string]*convAcc, top int) []OutboundSaleConvBreakdownRow {
	rows := make([]OutboundSaleConvBreakdownRow, 0, len(m))
	for k, a := range m {
		rate := 0.0
		if a.eligible > 0 {
			rate = float64(a.linked) / float64(a.eligible) * 100.0
		}
		rows = append(rows, OutboundSaleConvBreakdownRow{
			Key: k, Label: a.label,
			EligibleCount: a.eligible, LinkedCount: a.linked,
			Rate: rate,
		})
	}
	// eligible_count desc 우선 (top N 자르기 의미 있게), 동률 시 rate desc.
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].EligibleCount != rows[j].EligibleCount {
			return rows[i].EligibleCount > rows[j].EligibleCount
		}
		return rows[i].Rate > rows[j].Rate
	})
	if top > 0 && len(rows) > top {
		return rows[:top]
	}
	return rows
}

func mfgKeyLabel(o Outbound) (string, string) {
	if o.ManufacturerID != nil && *o.ManufacturerID != "" {
		return *o.ManufacturerID, handlerutil.StrPtrOr(o.ManufacturerName, "미지정")
	}
	return "__unset__", handlerutil.StrPtrOr(o.ManufacturerName, "미지정")
}

func custKeyLabel(o Outbound) (string, string) {
	if o.CustomerID != nil && *o.CustomerID != "" {
		return *o.CustomerID, handlerutil.StrPtrOr(o.CustomerName, "미지정")
	}
	return "__unset__", handlerutil.StrPtrOr(o.CustomerName, "미지정")
}

func isSaleEligible(usage string) bool {
	return usage == "sale" || usage == "sale_spare"
}

// filterSaleEligible — usage_category in (sale, sale_spare) 인 출고만 반환.
// 거래처 분해의 입력 필터로 사용 (다른 용도는 customer_id 가 항상 NULL 이라
// '미지정' 단일 버킷에만 쌓여 의미가 없다).
func filterSaleEligible(outbounds []Outbound) []Outbound {
	out := make([]Outbound, 0, len(outbounds))
	for _, o := range outbounds {
		if isSaleEligible(o.UsageCategory) {
			out = append(out, o)
		}
	}
	return out
}

// usageLabel — UsageCategory 한국어 라벨. 프론트 USAGE_CATEGORY_LABEL 과 동일.
// breakdown 의 label 을 응답에 직접 담아 클라이언트 의존을 줄인다.
func usageLabel(u string) string {
	switch u {
	case "sale":
		return "상품판매"
	case "sale_spare":
		return "상품판매(스페어)"
	case "construction":
		return "공사현장 출고"
	case "construction_damage":
		return "공사현장 출고(파손)"
	case "repowering":
		return "리파워링 출고"
	case "maintenance":
		return "유지관리"
	case "disposal":
		return "폐기"
	case "transfer":
		return "창고이동"
	case "adjustment":
		return "재고조정"
	case "other":
		return "기타"
	}
	return u
}
