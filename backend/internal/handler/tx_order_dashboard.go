package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"solarflow-backend/internal/handlerutil"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// 수주 대시보드 집계 — OrdersPage 수주 탭 KPI/sparkline + 4 개 Orders Insight (Active/Customers/Partial/UnitPrice)
// 의 client-side aggregation 을 서버에서 한 번에 처리해 wire payload 를 KB 단위로 줄인다 (C-1 orders).
//
// 이전 동작: 프론트가 useOrderListAll 로 전 orders 청크 누적 fetch (수 MB) 후 KPI/sparkline/breakdown 을 브라우저에서 계산.
// 본 핸들러: applyOrderFilters 동일 + 청크 누적 fetch + enrichOrders 재사용 + 메모리 집계.

const (
	orderDashboardChunkSize    = 1000
	orderDashboardMaxChunks    = 50
	orderDashboardTrendMonths  = 24
	orderDashboardTopN         = 10
	orderDashboardMa15Days     = 180 // 15일 이동평균 sparkline 표시 일수
	orderDashboardMa15Window   = 15
	orderDashboardRecent30Days = 30
	orderDashboardDeliveryDays = 7 // delivery_due 도래까지 N 일 이내 = "delivery_soon"
)

// OrderDashboard — /api/v1/orders/dashboard 응답.
//
// breakdowns 의 범위는 ?status_scope 쿼리 파라미터에 따라 달라진다:
//   - status_scope=lifetime (기본) — 필터 적용된 전체
//   - status_scope=active — !completed && !cancelled (OrdersActiveInsight)
//   - status_scope=partial — status='partial' (OrdersPartialInsight)
//
// totals / trend24 / unit_price_ma15_180 는 status_scope 와 무관하게 항상 전체.
type OrderDashboard struct {
	Totals              OrderDashTotals         `json:"totals"`
	Trend24             []OrderDashTrendPoint   `json:"trend24"`
	UnitPriceMa15_180   []float64               `json:"unit_price_ma15_180"`
	StatusScope         string                  `json:"status_scope"`
	ByStatus            []OrderDashBreakdownRow `json:"by_status"`
	ByCustomerTop10     []OrderDashBreakdownRow `json:"by_customer_top10"`
	ByManufacturerTop10 []OrderDashBreakdownRow `json:"by_manufacturer_top10"`
	ByCategory          []OrderDashBreakdownRow `json:"by_category"`
}

type OrderDashTotals struct {
	Count                  int     `json:"count"`
	ActiveCount            int     `json:"active_count"` // !completed && !cancelled
	ReceivedCount          int     `json:"received_count"`
	PartialCount           int     `json:"partial_count"`
	CompletedCount         int     `json:"completed_count"`
	CancelledCount         int     `json:"cancelled_count"`
	KwSum                  float64 `json:"kw_sum"`                 // active 만
	CustomersCount         int     `json:"customers_count"`        // distinct (전체)
	ActiveCustomersCount   int     `json:"active_customers_count"` // distinct of active
	AvgUnitPriceWp         float64 `json:"avg_unit_price_wp"`
	Recent30AvgUnitPriceWp float64 `json:"recent_30_avg_unit_price_wp"`
	Recent30Count          int     `json:"recent_30_count"`
	DeliverySoonCount      int     `json:"delivery_soon_count"` // received|partial + delivery_due ≤ N 일 + remaining > 0
	NoSiteCount            int     `json:"no_site_count"`       // active + site_name 비어있음
}

// OrderDashTrendPoint — 월별 시계열 한 점. order_date 기반 binning.
type OrderDashTrendPoint struct {
	Month             string  `json:"month"`
	Count             int     `json:"count"`
	ActiveCount       int     `json:"active_count"`
	PartialCount      int     `json:"partial_count"`
	DistinctCustomers int     `json:"distinct_customers"`
	AvgUnitPriceWp    float64 `json:"avg_unit_price_wp"` // priced > 0 only
}

// OrderDashBreakdownRow — 차원별 분해. avg_unit_price_wp 는 priced ≥ 3 일 때만.
type OrderDashBreakdownRow struct {
	Key            string  `json:"key"`
	Label          string  `json:"label"`
	Count          int     `json:"count"`
	KwSum          float64 `json:"kw_sum"`
	AvgUnitPriceWp float64 `json:"avg_unit_price_wp"`
	Share          float64 `json:"share"`
}

// Dashboard — GET /api/v1/orders/dashboard.
// applyOrderFilters 와 동일한 쿼리 파라미터 (status, customer_id, management_category, q, company_id).
// 페이지·정렬은 무시.
//
// orders_dashboard() RPC (migration 075) 우선. 미배포/실패 시 기존 chunked Go 경로 fallback.
func (h *OrderHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	if dashJSON, ok := h.tryRPCOrdersDashboard(r); ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dashJSON)
		return
	}
	orders, err := h.fetchAllForOrderDashboard(r)
	if err != nil {
		log.Printf("[수주 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수주 대시보드 데이터 조회에 실패했습니다")
		return
	}
	h.enrichOrders(orders)
	scope := normalizeOrderScope(r.URL.Query().Get("status_scope"))
	dash := computeOrderDashboard(orders, scope)
	response.RespondJSON(w, http.StatusOK, dash)
}

// tryRPCOrdersDashboard — orders_dashboard() RPC 호출.
func (h *OrderHandler) tryRPCOrdersDashboard(r *http.Request) ([]byte, bool) {
	q := r.URL.Query()
	// 기간/용량 필터는 현재 RPC 시그니처(migration 075)가 모르므로 fallback Go 경로 사용.
	if q.Get("start") != "" || q.Get("end") != "" {
		return nil, false
	}
	if q.Get("min_kw") != "" || q.Get("max_kw") != "" {
		return nil, false
	}
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}
	if v := q.Get("customer_id"); v != "" {
		args["p_customer_id"] = v
	}
	if v := q.Get("status"); v != "" {
		args["p_status"] = v
	}
	if v := q.Get("management_category"); v != "" {
		args["p_management_category"] = v
	}
	if v := q.Get("work_queue"); v != "" {
		args["p_work_queue"] = v
	}
	if v := q.Get("q"); v != "" {
		args["p_q"] = v
	}
	args["p_status_scope"] = normalizeOrderScope(q.Get("status_scope"))

	data, _, err := h.DB.From("rpc/orders_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[수주 대시보드 RPC 실패 — fallback 사용] %v", err)
		return nil, false
	}
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		var arr []json.RawMessage
		if data[0] == '[' && json.Unmarshal(data, &arr) == nil && len(arr) > 0 {
			var wrap map[string]json.RawMessage
			if json.Unmarshal(arr[0], &wrap) == nil {
				if inner, ok := wrap["orders_dashboard"]; ok {
					return inner, true
				}
			}
			return arr[0], true
		}
		return data, true
	}
	return nil, false
}

func normalizeOrderScope(raw string) string {
	switch raw {
	case "active", "partial":
		return raw
	}
	return "lifetime"
}

// fetchAllForOrderDashboard — 필터 적용 후 1000 행 청크로 orders 전체를 끌어온다.
func (h *OrderHandler) fetchAllForOrderDashboard(r *http.Request) ([]model.Order, error) {
	all := make([]model.Order, 0, orderDashboardChunkSize)
	for chunk := 0; chunk < orderDashboardMaxChunks; chunk++ {
		q := h.DB.From("orders").Select("*", "exact", false)
		q, ok, err := h.applyOrderFilters(r, q)
		if err != nil {
			return nil, fmt.Errorf("필터 처리 실패: %w", err)
		}
		if !ok {
			return all, nil
		}
		offset := chunk * orderDashboardChunkSize
		q = q.Range(offset, offset+orderDashboardChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("orders 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []model.Order
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("orders 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < orderDashboardChunkSize {
			break
		}
	}
	return all, nil
}

func computeOrderDashboard(orders []model.Order, scope string) *OrderDashboard {
	d := &OrderDashboard{
		StatusScope:         scope,
		Trend24:             make([]OrderDashTrendPoint, 0, orderDashboardTrendMonths),
		ByStatus:            []OrderDashBreakdownRow{},
		ByCustomerTop10:     []OrderDashBreakdownRow{},
		ByManufacturerTop10: []OrderDashBreakdownRow{},
		ByCategory:          []OrderDashBreakdownRow{},
	}
	d.Totals = computeOrderDashTotals(orders)
	d.Trend24 = computeOrderDashTrend24(orders)
	d.UnitPriceMa15_180 = computeOrderDashUnitPriceMa15(orders)

	scoped := filterOrdersByScope(orders, scope)
	d.ByStatus = computeOrderDashBreakdown(scoped, orderDimStatus, 0)
	d.ByCustomerTop10 = computeOrderDashBreakdown(scoped, orderDimCustomer, orderDashboardTopN)
	d.ByManufacturerTop10 = computeOrderDashBreakdown(scoped, orderDimManufacturer, orderDashboardTopN)
	d.ByCategory = computeOrderDashBreakdown(scoped, orderDimCategory, 0)
	return d
}

func filterOrdersByScope(orders []model.Order, scope string) []model.Order {
	switch scope {
	case "active":
		out := make([]model.Order, 0, len(orders))
		for _, o := range orders {
			if o.Status != "completed" && o.Status != "cancelled" {
				out = append(out, o)
			}
		}
		return out
	case "partial":
		out := make([]model.Order, 0, len(orders))
		for _, o := range orders {
			if o.Status == "partial" {
				out = append(out, o)
			}
		}
		return out
	}
	return orders
}

func orderUnitPriceWp(o model.Order) float64 {
	if o.UnitPriceWp > 0 {
		return o.UnitPriceWp
	}
	if o.SpecWp != nil && *o.SpecWp > 0 && o.UnitPriceEa != nil {
		return *o.UnitPriceEa / float64(*o.SpecWp)
	}
	return 0
}

func computeOrderDashTotals(orders []model.Order) OrderDashTotals {
	t := OrderDashTotals{Count: len(orders)}
	customers := make(map[string]struct{}, 32)
	activeCustomers := make(map[string]struct{}, 32)
	priceSum := 0.0
	priceN := 0
	now := time.Now()
	cutoff := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -orderDashboardRecent30Days)
	deliveryCutoff := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, orderDashboardDeliveryDays)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	recentSum := 0.0
	recentN := 0
	for _, o := range orders {
		switch o.Status {
		case "received":
			t.ReceivedCount++
		case "partial":
			t.PartialCount++
		case "completed":
			t.CompletedCount++
		case "cancelled":
			t.CancelledCount++
		}
		isActive := o.Status != "completed" && o.Status != "cancelled"
		if isActive {
			t.ActiveCount++
			if o.CapacityKw != nil {
				t.KwSum += *o.CapacityKw
			} else if o.WattageKw != nil {
				t.KwSum += float64(o.Quantity) * *o.WattageKw
			}
			if o.CustomerID != "" {
				activeCustomers[o.CustomerID] = struct{}{}
			}
			// no_site: active + site_name 비어있음
			if o.SiteName == nil || *o.SiteName == "" {
				t.NoSiteCount++
			}
		}
		if o.CustomerID != "" {
			customers[o.CustomerID] = struct{}{}
		}
		uw := orderUnitPriceWp(o)
		if uw > 0 {
			priceSum += uw
			priceN++
		}
		// recent 30 — order_date 가 최근 30일 이내 + priced
		if uw > 0 && o.OrderDate != "" {
			if d, err := time.ParseInLocation("2006-01-02", o.OrderDate[:10], now.Location()); err == nil {
				if !d.Before(cutoff) {
					recentSum += uw
					recentN++
				}
			}
		}
		// delivery_soon: status received|partial + remaining > 0 + delivery_due ≤ +N일
		if (o.Status == "received" || o.Status == "partial") && o.DeliveryDue != nil && *o.DeliveryDue != "" && o.RemainingQty != nil && *o.RemainingQty > 0 {
			if d, err := time.ParseInLocation("2006-01-02", (*o.DeliveryDue)[:10], now.Location()); err == nil {
				if !d.Before(today) && !d.After(deliveryCutoff) {
					t.DeliverySoonCount++
				}
			}
		}
	}
	t.CustomersCount = len(customers)
	t.ActiveCustomersCount = len(activeCustomers)
	if priceN > 0 {
		t.AvgUnitPriceWp = priceSum / float64(priceN)
	}
	if recentN > 0 {
		t.Recent30AvgUnitPriceWp = recentSum / float64(recentN)
	}
	t.Recent30Count = recentN
	return t
}

func computeOrderDashTrend24(orders []model.Order) []OrderDashTrendPoint {
	now := time.Now()
	labels := make([]string, orderDashboardTrendMonths)
	idx := make(map[string]int, orderDashboardTrendMonths)
	for i := 0; i < orderDashboardTrendMonths; i++ {
		t := now.AddDate(0, -(orderDashboardTrendMonths - 1 - i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]OrderDashTrendPoint, orderDashboardTrendMonths)
	for i, m := range labels {
		out[i] = OrderDashTrendPoint{Month: m}
	}
	customers := make([]map[string]struct{}, orderDashboardTrendMonths)
	priceSum := make([]float64, orderDashboardTrendMonths)
	priceN := make([]int, orderDashboardTrendMonths)
	for i := range customers {
		customers[i] = make(map[string]struct{}, 4)
	}
	for _, o := range orders {
		m := handlerutil.MonthOf(o.OrderDate)
		if m == "" {
			continue
		}
		i, ok := idx[m]
		if !ok {
			continue
		}
		out[i].Count++
		if o.Status != "completed" && o.Status != "cancelled" {
			out[i].ActiveCount++
		}
		if o.Status == "partial" {
			out[i].PartialCount++
		}
		if o.CustomerID != "" {
			customers[i][o.CustomerID] = struct{}{}
		}
		uw := orderUnitPriceWp(o)
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

// computeOrderDashUnitPriceMa15 — 직전 N일(orderDashboardMa15Days, 기본 180일) 의 일별 평균 unit_price_wp 에
// 15일 슬라이딩 평균을 적용한 sparkline. 결과 길이 = orderDashboardMa15Days.
// 데이터 없는 날은 단가 기여 없음 (그날 분모도 0). 슬라이딩 윈도우는 누적 분자/분모로 계산해 노이즈 안정화.
func computeOrderDashUnitPriceMa15(orders []model.Order) []float64 {
	const totalDays = orderDashboardMa15Days
	const window = orderDashboardMa15Window
	bufLen := totalDays + window - 1
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	dailySum := make([]float64, bufLen)
	dailyN := make([]int, bufLen)
	any := false
	for _, o := range orders {
		if o.OrderDate == "" {
			continue
		}
		d, err := time.ParseInLocation("2006-01-02", o.OrderDate[:10], now.Location())
		if err != nil {
			continue
		}
		dayStart := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, now.Location())
		diff := int(today.Sub(dayStart).Hours() / 24)
		if diff < 0 || diff >= bufLen {
			continue
		}
		idx := bufLen - 1 - diff
		uw := orderUnitPriceWp(o)
		if uw <= 0 {
			continue
		}
		dailySum[idx] += uw
		dailyN[idx]++
		any = true
	}
	if !any {
		return []float64{}
	}
	out := make([]float64, 0, totalDays)
	wSum := 0.0
	wN := 0
	for i := 0; i < bufLen; i++ {
		wSum += dailySum[i]
		wN += dailyN[i]
		if i-window >= 0 {
			wSum -= dailySum[i-window]
			wN -= dailyN[i-window]
		}
		if i >= window-1 {
			if wN > 0 {
				out = append(out, wSum/float64(wN))
			} else {
				out = append(out, 0)
			}
		}
	}
	return out
}

type orderDashDim int

const (
	orderDimStatus orderDashDim = iota
	orderDimCustomer
	orderDimManufacturer
	orderDimCategory
)

var orderStatusLabels = map[string]string{
	"received":  "접수",
	"partial":   "분할출고",
	"completed": "완료",
	"cancelled": "취소",
}

var orderCategoryLabels = map[string]string{
	"sale":         "판매",
	"sale_spare":   "판매(스페어)",
	"construction": "공사",
	"adjustment":   "재고조정",
	"transfer":     "창고이동",
	"other":        "기타",
}

func computeOrderDashBreakdown(orders []model.Order, dim orderDashDim, top int) []OrderDashBreakdownRow {
	type acc struct {
		label    string
		count    int
		kw       float64
		priceSum float64
		priceN   int
	}
	m := make(map[string]*acc, 32)
	totalCount := 0
	for _, o := range orders {
		var key, label string
		switch dim {
		case orderDimStatus:
			key = o.Status
			if l, ok := orderStatusLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		case orderDimCustomer:
			if o.CustomerID == "" {
				key = "__unset__"
			} else {
				key = o.CustomerID
			}
			label = handlerutil.StrPtrOr(o.CustomerName, "미지정")
		case orderDimManufacturer:
			label = handlerutil.StrPtrOr(o.ManufacturerName, "미지정")
			key = label // manufacturer_id 가 Order 모델에 없어 name 을 키로 사용 (기존 insights 와 동일).
			if o.ManufacturerName == nil || *o.ManufacturerName == "" {
				key = "__unset__"
			}
		case orderDimCategory:
			key = o.ManagementCategory
			if l, ok := orderCategoryLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		}
		a, ok := m[key]
		if !ok {
			a = &acc{label: label}
			m[key] = a
		}
		a.count++
		if o.CapacityKw != nil {
			a.kw += *o.CapacityKw
		} else if o.WattageKw != nil {
			a.kw += float64(o.Quantity) * *o.WattageKw
		}
		uw := orderUnitPriceWp(o)
		if uw > 0 {
			a.priceSum += uw
			a.priceN++
		}
		totalCount++
	}
	rows := make([]OrderDashBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		avg := 0.0
		if a.priceN >= 3 {
			avg = a.priceSum / float64(a.priceN)
		}
		rows = append(rows, OrderDashBreakdownRow{
			Key:            k,
			Label:          a.label,
			Count:          a.count,
			KwSum:          a.kw,
			AvgUnitPriceWp: avg,
			Share:          share,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Count != rows[j].Count {
			return rows[i].Count > rows[j].Count
		}
		return rows[i].KwSum > rows[j].KwSum
	})
	if top > 0 && len(rows) > top {
		return rows[:top]
	}
	return rows
}
