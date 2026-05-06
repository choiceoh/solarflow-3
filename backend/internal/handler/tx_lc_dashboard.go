package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"solarflow-backend/internal/response"
)

// LC 대시보드 집계 — ProcurementPage LC 탭 KPI/sparkline + 5 LC Insight (Total/Amount/Banks/Linked/Maturity) 의
// client-side aggregation 을 서버에서 한 번에. C-1 procurement 3/4.

const (
	lcDashChunkSize    = 1000
	lcDashMaxChunks    = 50
	lcDashTrendMonths  = 24
	lcDashTopN         = 10
	lcMaturitySoonDays = 30 // 만기 30일 이내 (overdue 포함)
)

// LCScope: lifetime|active|maturity_soon. breakdowns 만 좁힘. trend24/totals 는 항상 전체.
//   - active        = !cancelled
//   - maturity_soon = maturity_date 가 오늘 ± 30일 이내, !settled, !repaid
type LCDashboard struct {
	Totals         LCDashTotals          `json:"totals"`
	Trend24        []LCDashTrendPoint    `json:"trend24"`
	StatusScope    string                `json:"status_scope"`
	ByStatus       []LCDashBreakdownRow  `json:"by_status"`
	ByBankTop10    []LCDashBreakdownRow  `json:"by_bank_top10"`
	ByUrgency      []LCDashBreakdownRow  `json:"by_urgency"` // maturity_soon 만 의미. lifetime/active 면 빈 배열.
}

type LCDashTotals struct {
	Count            int     `json:"count"`
	ActiveCount      int     `json:"active_count"`        // !cancelled
	OpenedCount      int     `json:"opened_count"`
	SettledCount     int     `json:"settled_count"`
	CancelledCount   int     `json:"cancelled_count"`
	TotalAmountUSD   float64 `json:"total_amount_usd"`
	ActiveAmountUSD  float64 `json:"active_amount_usd"`
	BanksCount       int     `json:"banks_count"`         // distinct bank
	MaturitySoonCount int    `json:"maturity_soon_count"` // 30일 이내 미정산
	OverdueCount     int     `json:"overdue_count"`       // 이미 만기 지났는데 미정산
}

// LCDashTrendPoint — open_date 기반 월별. distinct_banks 는 LC Banks 화면 sparkline 용.
type LCDashTrendPoint struct {
	Month         string  `json:"month"`
	Count         int     `json:"count"`
	ActiveCount   int     `json:"active_count"`
	AmountUSD     float64 `json:"amount_usd"`
	DistinctBanks int     `json:"distinct_banks"`
}

type LCDashBreakdownRow struct {
	Key          string  `json:"key"`
	Label        string  `json:"label"`
	Count        int     `json:"count"`
	AmountUSDSum float64 `json:"amount_usd_sum"`
	Share        float64 `json:"share"` // count 기준 0..1
}

// lcDashRow — LC join 결과 평탄화.
type lcDashRow struct {
	LCID         string   `json:"lc_id"`
	BankID       string   `json:"bank_id"`
	OpenDate     *string  `json:"open_date"`
	MaturityDate *string  `json:"maturity_date"`
	AmountUSD    float64  `json:"amount_usd"`
	Status       string   `json:"status"`
	Repaid       bool     `json:"repaid"`
	Banks        *struct {
		BankName string `json:"bank_name"`
	} `json:"banks"`
}

func (r lcDashRow) bankLabel() string {
	if r.Banks != nil && r.Banks.BankName != "" {
		return r.Banks.BankName
	}
	return "미지정"
}

// Dashboard — GET /api/v1/lcs/dashboard.
//
// lcs_dashboard() RPC (migration 078) 우선. 실패 시 fallback.
func (h *LCHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	if dashJSON, ok := h.tryRPCLcsDashboard(r); ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dashJSON)
		return
	}
	rows, err := h.fetchAllForLCDashboard(r)
	if err != nil {
		log.Printf("[LC 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "LC 대시보드 데이터 조회에 실패했습니다")
		return
	}
	scope := normalizeLCScope(r.URL.Query().Get("status_scope"))
	dash := computeLCDashboard(rows, scope)
	response.RespondJSON(w, http.StatusOK, dash)
}

func (h *LCHandler) tryRPCLcsDashboard(r *http.Request) ([]byte, bool) {
	q := r.URL.Query()
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}
	if v := q.Get("po_id"); v != "" {
		args["p_po_id"] = v
	}
	if v := q.Get("bank_id"); v != "" {
		args["p_bank_id"] = v
	}
	if v := q.Get("status"); v != "" {
		args["p_status"] = v
	}
	args["p_status_scope"] = normalizeLCScope(q.Get("status_scope"))
	data, _, err := h.DB.From("rpc/lcs_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[LC 대시보드 RPC 실패 — fallback 사용] %v", err)
		return nil, false
	}
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		var arr []json.RawMessage
		if data[0] == '[' && json.Unmarshal(data, &arr) == nil && len(arr) > 0 {
			var wrap map[string]json.RawMessage
			if json.Unmarshal(arr[0], &wrap) == nil {
				if inner, ok := wrap["lcs_dashboard"]; ok {
					return inner, true
				}
			}
			return arr[0], true
		}
		return data, true
	}
	return nil, false
}

func normalizeLCScope(raw string) string {
	switch raw {
	case "active", "maturity_soon":
		return raw
	}
	return "lifetime"
}

func (h *LCHandler) fetchAllForLCDashboard(r *http.Request) ([]lcDashRow, error) {
	all := make([]lcDashRow, 0, lcDashChunkSize)
	for chunk := 0; chunk < lcDashMaxChunks; chunk++ {
		q := h.DB.From("lc_records").Select("*, banks(bank_name)", "exact", false)
		q = h.applyLCFilters(r, q)
		offset := chunk * lcDashChunkSize
		q = q.Range(offset, offset+lcDashChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("lcs 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []lcDashRow
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("lcs 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < lcDashChunkSize {
			break
		}
	}
	return all, nil
}

func computeLCDashboard(rows []lcDashRow, scope string) *LCDashboard {
	d := &LCDashboard{
		StatusScope: scope,
		Trend24:     make([]LCDashTrendPoint, 0, lcDashTrendMonths),
		ByStatus:    []LCDashBreakdownRow{},
		ByBankTop10: []LCDashBreakdownRow{},
		ByUrgency:   []LCDashBreakdownRow{},
	}
	d.Totals = computeLCDashTotals(rows)
	d.Trend24 = computeLCDashTrend24(rows)

	scoped := filterLCByScope(rows, scope)
	d.ByStatus = computeLCDashBreakdown(scoped, lcDimStatus, 0)
	d.ByBankTop10 = computeLCDashBreakdown(scoped, lcDimBank, lcDashTopN)
	if scope == "maturity_soon" {
		d.ByUrgency = computeLCDashUrgency(scoped)
	}
	return d
}

func filterLCByScope(rows []lcDashRow, scope string) []lcDashRow {
	now := time.Now()
	switch scope {
	case "active":
		out := make([]lcDashRow, 0, len(rows))
		for _, r := range rows {
			if r.Status != "cancelled" {
				out = append(out, r)
			}
		}
		return out
	case "maturity_soon":
		out := make([]lcDashRow, 0)
		for _, r := range rows {
			if isLCMaturitySoon(r, now) {
				out = append(out, r)
			}
		}
		return out
	}
	return rows
}

// isLCMaturitySoon — settled/repaid 가 아니고 maturity_date 가 오늘 ± 30일 이내 (overdue 포함).
func isLCMaturitySoon(r lcDashRow, now time.Time) bool {
	if r.Status == "settled" || r.Repaid {
		return false
	}
	if r.MaturityDate == nil || *r.MaturityDate == "" {
		return false
	}
	d, err := time.ParseInLocation("2006-01-02", (*r.MaturityDate)[:10], now.Location())
	if err != nil {
		return false
	}
	diff := d.Sub(now)
	day := time.Hour * 24
	soon := time.Duration(lcMaturitySoonDays) * day
	return diff <= soon && diff >= -soon
}

func computeLCDashTotals(rows []lcDashRow) LCDashTotals {
	t := LCDashTotals{Count: len(rows)}
	banks := make(map[string]struct{}, 16)
	now := time.Now()
	for _, r := range rows {
		t.TotalAmountUSD += r.AmountUSD
		switch r.Status {
		case "opened":
			t.OpenedCount++
		case "settled":
			t.SettledCount++
		case "cancelled":
			t.CancelledCount++
		}
		if r.Status != "cancelled" {
			t.ActiveCount++
			t.ActiveAmountUSD += r.AmountUSD
		}
		if r.BankID != "" {
			banks[r.BankID] = struct{}{}
		}
		// maturity_soon (포함 overdue)
		if isLCMaturitySoon(r, now) {
			t.MaturitySoonCount++
			if r.MaturityDate != nil {
				if d, err := time.ParseInLocation("2006-01-02", (*r.MaturityDate)[:10], now.Location()); err == nil {
					if d.Before(now) {
						t.OverdueCount++
					}
				}
			}
		}
	}
	t.BanksCount = len(banks)
	return t
}

func computeLCDashTrend24(rows []lcDashRow) []LCDashTrendPoint {
	now := time.Now()
	labels := make([]string, lcDashTrendMonths)
	idx := make(map[string]int, lcDashTrendMonths)
	for i := 0; i < lcDashTrendMonths; i++ {
		t := now.AddDate(0, -(lcDashTrendMonths-1-i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]LCDashTrendPoint, lcDashTrendMonths)
	for i, m := range labels {
		out[i] = LCDashTrendPoint{Month: m}
	}
	banks := make([]map[string]struct{}, lcDashTrendMonths)
	for i := range banks {
		banks[i] = make(map[string]struct{}, 4)
	}
	for _, r := range rows {
		var date string
		if r.OpenDate != nil {
			date = *r.OpenDate
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
		out[i].AmountUSD += r.AmountUSD
		if r.Status != "cancelled" {
			out[i].ActiveCount++
		}
		if r.BankID != "" {
			banks[i][r.BankID] = struct{}{}
		}
	}
	for i := range out {
		out[i].DistinctBanks = len(banks[i])
	}
	return out
}

type lcDashDim int

const (
	lcDimStatus lcDashDim = iota
	lcDimBank
)

var lcStatusLabels = map[string]string{
	"opened":    "개설",
	"settled":   "정산",
	"cancelled": "취소",
}

func computeLCDashBreakdown(rows []lcDashRow, dim lcDashDim, top int) []LCDashBreakdownRow {
	type acc struct {
		label  string
		count  int
		amount float64
	}
	m := make(map[string]*acc, 16)
	totalCount := 0
	for _, r := range rows {
		var key, label string
		switch dim {
		case lcDimStatus:
			key = r.Status
			if l, ok := lcStatusLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		case lcDimBank:
			if r.BankID == "" {
				key = "__unset__"
			} else {
				key = r.BankID
			}
			label = r.bankLabel()
		}
		a, ok := m[key]
		if !ok {
			a = &acc{label: label}
			m[key] = a
		}
		a.count++
		a.amount += r.AmountUSD
		totalCount++
	}
	out := make([]LCDashBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		out = append(out, LCDashBreakdownRow{
			Key: k, Label: a.label, Count: a.count, AmountUSDSum: a.amount, Share: share,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].AmountUSDSum != out[j].AmountUSDSum {
			return out[i].AmountUSDSum > out[j].AmountUSDSum
		}
		return out[i].Count > out[j].Count
	})
	if top > 0 && len(out) > top {
		return out[:top]
	}
	return out
}

// computeLCDashUrgency — maturity_soon 결과를 4 buckets (overdue/urgent/soon14/later) 로 분류.
// maturity_soon scope 일 때만 호출.
func computeLCDashUrgency(rows []lcDashRow) []LCDashBreakdownRow {
	now := time.Now()
	day := time.Hour * 24
	type acc struct {
		count  int
		amount float64
	}
	buckets := map[string]*acc{
		"overdue": {},
		"urgent":  {},
		"soon14":  {},
		"later":   {},
	}
	for _, r := range rows {
		if r.MaturityDate == nil {
			continue
		}
		d, err := time.ParseInLocation("2006-01-02", (*r.MaturityDate)[:10], now.Location())
		if err != nil {
			continue
		}
		diffDays := d.Sub(now) / day
		var key string
		if diffDays < 0 {
			key = "overdue"
		} else if diffDays <= 7 {
			key = "urgent"
		} else if diffDays <= 14 {
			key = "soon14"
		} else {
			key = "later"
		}
		buckets[key].count++
		buckets[key].amount += r.AmountUSD
	}
	keys := []string{"overdue", "urgent", "soon14", "later"}
	labels := map[string]string{
		"overdue": "연체",
		"urgent":  "긴급 (7일 이내)",
		"soon14":  "주의 (8~14일)",
		"later":   "여유 (15~30일)",
	}
	total := 0
	for _, k := range keys {
		total += buckets[k].count
	}
	out := make([]LCDashBreakdownRow, 0, len(keys))
	for _, k := range keys {
		b := buckets[k]
		share := 0.0
		if total > 0 {
			share = float64(b.count) / float64(total)
		}
		out = append(out, LCDashBreakdownRow{
			Key: k, Label: labels[k], Count: b.count, AmountUSDSum: b.amount, Share: share,
		})
	}
	return out
}
