package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	postgrest "github.com/supabase-community/postgrest-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// 수금 대시보드 집계 — OrdersPage 수금 탭 KPI/sparkline + 4 개 Receipts Insight
// (Total / Remaining / PartialMatch / RecoveryRate) 의 client-side aggregation 을 서버에서 한 번에 처리.
//
// 이전 동작: 프론트가 useReceiptList 의 fetchAllPaginated 로 전 receipts 를 끌어와 client-side 로 KPI/breakdown 계산.
// 본 핸들러: List 와 동일한 필터 + 청크 누적 + enrichReceipts 재사용 + 메모리 집계.

const (
	receiptDashChunkSize    = 1000
	receiptDashMaxChunks    = 50
	receiptDashTrendMonths  = 24
	receiptDashTopN         = 10
	receiptRecoveryMinCount = 3 // 회수율 by_customer 표본 최소 건수
)

// ReceiptDashboard — /api/v1/receipts/dashboard 응답.
type ReceiptDashboard struct {
	Totals          ReceiptDashTotals       `json:"totals"`
	Trend24         []ReceiptDashTrendPoint `json:"trend24"`
	ByCustomerTop10 []ReceiptDashBreakdownRow `json:"by_customer_top10"`
	ByMatchStatus   []ReceiptDashBreakdownRow `json:"by_match_status"`
}

type ReceiptDashTotals struct {
	Count             int     `json:"count"`
	AmountSum         float64 `json:"amount_sum"`         // sum(amount)
	MatchedSum        float64 `json:"matched_sum"`        // sum(amount - remaining), 음수 클램프
	RemainingSum      float64 `json:"remaining_sum"`      // sum(remaining)
	MatchedCount      int     `json:"matched_count"`      // 완전 매칭 (matched > 0 & remaining == 0)
	PartialMatchCount int     `json:"partial_match_count"` // matched > 0 & remaining > 0
	UnmatchedCount    int     `json:"unmatched_count"`    // matched == 0
	CustomersCount    int     `json:"customers_count"`
	RecoveryRate      float64 `json:"recovery_rate"`      // matched_sum / amount_sum * 100
}

// ReceiptDashTrendPoint — 월별 시계열. receipt_date 기반 binning.
// recovery_rate 는 그 달의 (matched / amount) * 100. amount 0 이면 0.
type ReceiptDashTrendPoint struct {
	Month        string  `json:"month"`
	Count        int     `json:"count"`
	AmountSum    float64 `json:"amount_sum"`
	RemainingSum float64 `json:"remaining_sum"`
	MatchedSum   float64 `json:"matched_sum"`
	PartialCount int     `json:"partial_count"` // matched > 0 & remaining > 0
	RecoveryRate float64 `json:"recovery_rate"`
}

// ReceiptDashBreakdownRow — 거래처별 또는 매칭상태별 분해.
// recovery_rate 는 (matched/amount)*100 — by_customer 에서 표본 ≥ 3 일 때만 의미값(아니면 0).
type ReceiptDashBreakdownRow struct {
	Key               string  `json:"key"`
	Label             string  `json:"label"`
	Count             int     `json:"count"`
	AmountSum         float64 `json:"amount_sum"`
	RemainingSum      float64 `json:"remaining_sum"`
	MatchedSum        float64 `json:"matched_sum"`
	PartialMatchCount int     `json:"partial_match_count"`
	RecoveryRate      float64 `json:"recovery_rate"` // 0 if count < min
	Share             float64 `json:"share"`         // count 기준 0..1
}

// Dashboard — GET /api/v1/receipts/dashboard.
// List 와 동일한 쿼리 파라미터 (customer_id, start, end, month, company_id).
func (h *ReceiptHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	receipts, err := h.fetchAllForReceiptDashboard(r)
	if err != nil {
		log.Printf("[수금 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "수금 대시보드 데이터 조회에 실패했습니다")
		return
	}
	h.enrichReceipts(receipts)
	dash := computeReceiptDashboard(receipts)
	response.RespondJSON(w, http.StatusOK, dash)
}

// applyReceiptFilters — List 의 인라인 필터를 재사용 가능한 형태로 추출.
// company_id 는 receipts 테이블에 직접 컬럼이 없을 가능성 — List 도 적용 안하므로 여기서도 무시.
func applyReceiptFilters(r *http.Request, q *postgrest.FilterBuilder) *postgrest.FilterBuilder {
	if custID := r.URL.Query().Get("customer_id"); custID != "" {
		q = q.Eq("customer_id", custID)
	}
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	if start != "" && end != "" {
		q = q.Gte("receipt_date", start).Lte("receipt_date", end)
	} else if month := r.URL.Query().Get("month"); month != "" {
		q = q.Gte("receipt_date", month+"-01").Lt("receipt_date", nextMonthString(month))
	}
	return q
}

func (h *ReceiptHandler) fetchAllForReceiptDashboard(r *http.Request) ([]model.Receipt, error) {
	all := make([]model.Receipt, 0, receiptDashChunkSize)
	for chunk := 0; chunk < receiptDashMaxChunks; chunk++ {
		q := h.DB.From("receipts").Select("*", "exact", false)
		q = applyReceiptFilters(r, q)
		offset := chunk * receiptDashChunkSize
		q = q.Range(offset, offset+receiptDashChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("receipts 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []model.Receipt
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("receipts 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < receiptDashChunkSize {
			break
		}
	}
	return all, nil
}

func computeReceiptDashboard(receipts []model.Receipt) *ReceiptDashboard {
	d := &ReceiptDashboard{
		Trend24:         make([]ReceiptDashTrendPoint, 0, receiptDashTrendMonths),
		ByCustomerTop10: []ReceiptDashBreakdownRow{},
		ByMatchStatus:   []ReceiptDashBreakdownRow{},
	}
	d.Totals = computeReceiptDashTotals(receipts)
	d.Trend24 = computeReceiptDashTrend24(receipts)
	d.ByCustomerTop10 = computeReceiptDashByCustomer(receipts, receiptDashTopN)
	d.ByMatchStatus = computeReceiptDashByMatchStatus(receipts)
	return d
}

// matchedAmount — 음수 클램프된 (amount - remaining).
func matchedAmount(r model.Receipt) float64 {
	v := r.Amount - r.Remaining
	if v < 0 {
		return 0
	}
	return v
}

// matchStatus — receipt 의 매칭 상태: matched / partial / unmatched.
func matchStatus(r model.Receipt) string {
	matched := r.MatchedTotal
	remaining := r.Remaining
	if matched > 0 && remaining <= 0 {
		return "matched"
	}
	if matched > 0 && remaining > 0 {
		return "partial"
	}
	return "unmatched"
}

func computeReceiptDashTotals(receipts []model.Receipt) ReceiptDashTotals {
	t := ReceiptDashTotals{Count: len(receipts)}
	customers := make(map[string]struct{}, 32)
	for _, rc := range receipts {
		t.AmountSum += rc.Amount
		t.RemainingSum += rc.Remaining
		t.MatchedSum += matchedAmount(rc)
		switch matchStatus(rc) {
		case "matched":
			t.MatchedCount++
		case "partial":
			t.PartialMatchCount++
		default:
			t.UnmatchedCount++
		}
		if rc.CustomerID != "" {
			customers[rc.CustomerID] = struct{}{}
		}
	}
	t.CustomersCount = len(customers)
	if t.AmountSum > 0 {
		t.RecoveryRate = t.MatchedSum / t.AmountSum * 100.0
	}
	return t
}

func computeReceiptDashTrend24(receipts []model.Receipt) []ReceiptDashTrendPoint {
	now := time.Now()
	labels := make([]string, receiptDashTrendMonths)
	idx := make(map[string]int, receiptDashTrendMonths)
	for i := 0; i < receiptDashTrendMonths; i++ {
		t := now.AddDate(0, -(receiptDashTrendMonths-1-i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]ReceiptDashTrendPoint, receiptDashTrendMonths)
	for i, m := range labels {
		out[i] = ReceiptDashTrendPoint{Month: m}
	}
	for _, rc := range receipts {
		m := monthOf(rc.ReceiptDate)
		if m == "" {
			continue
		}
		i, ok := idx[m]
		if !ok {
			continue
		}
		out[i].Count++
		out[i].AmountSum += rc.Amount
		out[i].RemainingSum += rc.Remaining
		out[i].MatchedSum += matchedAmount(rc)
		if matchStatus(rc) == "partial" {
			out[i].PartialCount++
		}
	}
	for i := range out {
		if out[i].AmountSum > 0 {
			out[i].RecoveryRate = out[i].MatchedSum / out[i].AmountSum * 100.0
		}
	}
	return out
}

func computeReceiptDashByCustomer(receipts []model.Receipt, top int) []ReceiptDashBreakdownRow {
	type acc struct {
		label     string
		count     int
		amount    float64
		remaining float64
		matched   float64
		partial   int
	}
	m := make(map[string]*acc, 32)
	totalCount := 0
	for _, rc := range receipts {
		key := rc.CustomerID
		if key == "" {
			key = "__unset__"
		}
		label := strPtrOr(rc.CustomerName, "미지정")
		a, ok := m[key]
		if !ok {
			a = &acc{label: label}
			m[key] = a
		}
		a.count++
		a.amount += rc.Amount
		a.remaining += rc.Remaining
		a.matched += matchedAmount(rc)
		if matchStatus(rc) == "partial" {
			a.partial++
		}
		totalCount++
	}
	rows := make([]ReceiptDashBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		rate := 0.0
		if a.count >= receiptRecoveryMinCount && a.amount > 0 {
			rate = a.matched / a.amount * 100.0
		}
		rows = append(rows, ReceiptDashBreakdownRow{
			Key:               k,
			Label:             a.label,
			Count:             a.count,
			AmountSum:         a.amount,
			RemainingSum:      a.remaining,
			MatchedSum:        a.matched,
			PartialMatchCount: a.partial,
			RecoveryRate:      rate,
			Share:             share,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].AmountSum != rows[j].AmountSum {
			return rows[i].AmountSum > rows[j].AmountSum
		}
		return rows[i].Count > rows[j].Count
	})
	if top > 0 && len(rows) > top {
		return rows[:top]
	}
	return rows
}

func computeReceiptDashByMatchStatus(receipts []model.Receipt) []ReceiptDashBreakdownRow {
	type acc struct {
		count     int
		amount    float64
		remaining float64
		matched   float64
	}
	keys := []string{"matched", "partial", "unmatched"}
	labels := map[string]string{
		"matched":   "완전 매칭",
		"partial":   "부분 매칭",
		"unmatched": "미매칭",
	}
	buckets := map[string]*acc{
		"matched":   {},
		"partial":   {},
		"unmatched": {},
	}
	totalCount := 0
	for _, rc := range receipts {
		s := matchStatus(rc)
		b := buckets[s]
		b.count++
		b.amount += rc.Amount
		b.remaining += rc.Remaining
		b.matched += matchedAmount(rc)
		totalCount++
	}
	rows := make([]ReceiptDashBreakdownRow, 0, len(keys))
	for _, k := range keys {
		b := buckets[k]
		share := 0.0
		if totalCount > 0 {
			share = float64(b.count) / float64(totalCount)
		}
		rate := 0.0
		if b.amount > 0 {
			rate = b.matched / b.amount * 100.0
		}
		rows = append(rows, ReceiptDashBreakdownRow{
			Key:          k,
			Label:        labels[k],
			Count:        b.count,
			AmountSum:    b.amount,
			RemainingSum: b.remaining,
			MatchedSum:   b.matched,
			RecoveryRate: rate,
			Share:        share,
		})
	}
	return rows
}
