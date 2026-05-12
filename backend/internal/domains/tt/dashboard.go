package tt

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

// TT 대시보드 집계 — ProcurementPage TT 탭 KPI/sparkline + 4 TT Insight (Total/Completed/Planned/PoLinked) 의
// client-side aggregation 을 서버에서 한 번에 처리. C-1 procurement 2/4.

const (
	ttDashChunkSize   = 1000
	ttDashMaxChunks   = 50
	ttDashTrendMonths = 24
	ttDashTopN        = 10
)

// TTScope: lifetime|completed|planned. breakdowns 만 좁힘. trend24/totals 는 항상 전체.
type TTDashboard struct {
	Totals              TTDashTotals         `json:"totals"`
	Trend24             []TTDashTrendPoint   `json:"trend24"`
	StatusScope         string               `json:"status_scope"`
	ByStatus            []TTDashBreakdownRow `json:"by_status"`
	ByManufacturerTop10 []TTDashBreakdownRow `json:"by_manufacturer_top10"`
	ByBankTop10         []TTDashBreakdownRow `json:"by_bank_top10"`
	ByPurposeTop10      []TTDashBreakdownRow `json:"by_purpose_top10"`
	ByPoTop10           []TTDashBreakdownRow `json:"by_po_top10"`
}

type TTDashTotals struct {
	Count              int     `json:"count"`
	CompletedCount     int     `json:"completed_count"`
	PlannedCount       int     `json:"planned_count"`
	CompletedAmountUSD float64 `json:"completed_amount_usd"`
	PlannedAmountUSD   float64 `json:"planned_amount_usd"`
	TotalAmountUSD     float64 `json:"total_amount_usd"`
	POCount            int     `json:"po_count"` // distinct po_id
}

// TTDashTrendPoint — remit_date 기반 월별. distinct_pos 는 PO Linked 화면 sparkline 용.
type TTDashTrendPoint struct {
	Month              string  `json:"month"`
	Count              int     `json:"count"`
	CompletedCount     int     `json:"completed_count"`
	PlannedCount       int     `json:"planned_count"`
	CompletedAmountUSD float64 `json:"completed_amount_usd"`
	PlannedAmountUSD   float64 `json:"planned_amount_usd"`
	DistinctPOs        int     `json:"distinct_pos"`
}

type TTDashBreakdownRow struct {
	Key          string  `json:"key"`
	Label        string  `json:"label"`
	Count        int     `json:"count"`
	AmountUSDSum float64 `json:"amount_usd_sum"`
	Share        float64 `json:"share"` // count 기준 0..1
}

// ttDashRow — TT join 결과 평탄화. List 와 동일 select 사용.
type ttDashRow struct {
	TTID           string  `json:"tt_id"`
	POID           string  `json:"po_id"`
	RemitDate      *string `json:"remit_date"`
	AmountUSD      float64 `json:"amount_usd"`
	Purpose        *string `json:"purpose"`
	Status         string  `json:"status"`
	BankName       *string `json:"bank_name"`
	PurchaseOrders *struct {
		PONumber      *string `json:"po_number"`
		Manufacturers *struct {
			NameKR string `json:"name_kr"`
		} `json:"manufacturers"`
	} `json:"purchase_orders"`
}

func (r ttDashRow) poNumber() string {
	if r.PurchaseOrders != nil && r.PurchaseOrders.PONumber != nil {
		return *r.PurchaseOrders.PONumber
	}
	if len(r.POID) >= 8 {
		return r.POID[:8]
	}
	return r.POID
}

func (r ttDashRow) manufacturerName() string {
	if r.PurchaseOrders != nil && r.PurchaseOrders.Manufacturers != nil {
		return r.PurchaseOrders.Manufacturers.NameKR
	}
	return ""
}

// Dashboard — GET /api/v1/tts/dashboard.
//
// tts_dashboard() RPC (migration 079) 우선. 실패 시 fallback.
func (h *TTHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	if dashJSON, ok := h.tryRPCTtsDashboard(r); ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dashJSON)
		return
	}
	rows, err := h.fetchAllForTTDashboard(r)
	if err != nil {
		log.Printf("[TT 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "TT 대시보드 데이터 조회에 실패했습니다")
		return
	}
	scope := normalizeTTScope(r.URL.Query().Get("status_scope"))
	dash := computeTTDashboard(rows, scope)
	response.RespondJSON(w, http.StatusOK, dash)
}

func (h *TTHandler) tryRPCTtsDashboard(r *http.Request) ([]byte, bool) {
	q := r.URL.Query()
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}
	if v := q.Get("status"); v != "" {
		args["p_status"] = v
	}
	if v := q.Get("po_id"); v != "" {
		args["p_po_id"] = v
	}
	args["p_status_scope"] = normalizeTTScope(q.Get("status_scope"))
	data, _, err := h.DB.From("rpc/tts_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[TT 대시보드 RPC 실패 — fallback 사용] %v", err)
		return nil, false
	}
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		var arr []json.RawMessage
		if data[0] == '[' && json.Unmarshal(data, &arr) == nil && len(arr) > 0 {
			var wrap map[string]json.RawMessage
			if json.Unmarshal(arr[0], &wrap) == nil {
				if inner, ok := wrap["tts_dashboard"]; ok {
					return inner, true
				}
			}
			return arr[0], true
		}
		return data, true
	}
	return nil, false
}

func normalizeTTScope(raw string) string {
	switch raw {
	case "completed", "planned":
		return raw
	}
	return "lifetime"
}

func (h *TTHandler) fetchAllForTTDashboard(r *http.Request) ([]ttDashRow, error) {
	all := make([]ttDashRow, 0, ttDashChunkSize)
	for chunk := 0; chunk < ttDashMaxChunks; chunk++ {
		q := h.DB.From("tt_remittances").
			Select("*, purchase_orders(po_number, manufacturers(name_kr))", "exact", false)
		var ok bool
		var err error
		q, ok, err = h.applyTTFilters(r, q)
		if err != nil {
			return nil, fmt.Errorf("필터 처리 실패: %w", err)
		}
		if !ok {
			return all, nil
		}
		offset := chunk * ttDashChunkSize
		q = q.Range(offset, offset+ttDashChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("tts 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []ttDashRow
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("tts 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < ttDashChunkSize {
			break
		}
	}
	return all, nil
}

func computeTTDashboard(rows []ttDashRow, scope string) *TTDashboard {
	d := &TTDashboard{
		StatusScope:         scope,
		Trend24:             make([]TTDashTrendPoint, 0, ttDashTrendMonths),
		ByStatus:            []TTDashBreakdownRow{},
		ByManufacturerTop10: []TTDashBreakdownRow{},
		ByBankTop10:         []TTDashBreakdownRow{},
		ByPurposeTop10:      []TTDashBreakdownRow{},
		ByPoTop10:           []TTDashBreakdownRow{},
	}
	d.Totals = computeTTDashTotals(rows)
	d.Trend24 = computeTTDashTrend24(rows)

	scoped := filterTTByScope(rows, scope)
	d.ByStatus = computeTTDashBreakdown(scoped, ttDimStatus, 0)
	d.ByManufacturerTop10 = computeTTDashBreakdown(scoped, ttDimManufacturer, ttDashTopN)
	d.ByBankTop10 = computeTTDashBreakdown(scoped, ttDimBank, ttDashTopN)
	d.ByPurposeTop10 = computeTTDashBreakdown(scoped, ttDimPurpose, ttDashTopN)
	d.ByPoTop10 = computeTTDashBreakdown(scoped, ttDimPO, ttDashTopN)
	return d
}

func filterTTByScope(rows []ttDashRow, scope string) []ttDashRow {
	switch scope {
	case "completed":
		out := make([]ttDashRow, 0, len(rows))
		for _, r := range rows {
			if r.Status == "completed" {
				out = append(out, r)
			}
		}
		return out
	case "planned":
		out := make([]ttDashRow, 0, len(rows))
		for _, r := range rows {
			if r.Status == "planned" {
				out = append(out, r)
			}
		}
		return out
	}
	return rows
}

func computeTTDashTotals(rows []ttDashRow) TTDashTotals {
	t := TTDashTotals{Count: len(rows)}
	pos := make(map[string]struct{}, 32)
	for _, r := range rows {
		t.TotalAmountUSD += r.AmountUSD
		switch r.Status {
		case "completed":
			t.CompletedCount++
			t.CompletedAmountUSD += r.AmountUSD
		case "planned":
			t.PlannedCount++
			t.PlannedAmountUSD += r.AmountUSD
		}
		if r.POID != "" {
			pos[r.POID] = struct{}{}
		}
	}
	t.POCount = len(pos)
	return t
}

func computeTTDashTrend24(rows []ttDashRow) []TTDashTrendPoint {
	now := time.Now()
	labels := make([]string, ttDashTrendMonths)
	idx := make(map[string]int, ttDashTrendMonths)
	for i := 0; i < ttDashTrendMonths; i++ {
		t := now.AddDate(0, -(ttDashTrendMonths - 1 - i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]TTDashTrendPoint, ttDashTrendMonths)
	for i, m := range labels {
		out[i] = TTDashTrendPoint{Month: m}
	}
	pos := make([]map[string]struct{}, ttDashTrendMonths)
	for i := range pos {
		pos[i] = make(map[string]struct{}, 4)
	}
	for _, r := range rows {
		var date string
		if r.RemitDate != nil {
			date = *r.RemitDate
		}
		m := handlerutil.MonthOf(date)
		if m == "" {
			continue
		}
		i, ok := idx[m]
		if !ok {
			continue
		}
		out[i].Count++
		switch r.Status {
		case "completed":
			out[i].CompletedCount++
			out[i].CompletedAmountUSD += r.AmountUSD
		case "planned":
			out[i].PlannedCount++
			out[i].PlannedAmountUSD += r.AmountUSD
		}
		if r.POID != "" {
			pos[i][r.POID] = struct{}{}
		}
	}
	for i := range out {
		out[i].DistinctPOs = len(pos[i])
	}
	return out
}

type ttDashDim int

const (
	ttDimStatus ttDashDim = iota
	ttDimManufacturer
	ttDimBank
	ttDimPurpose
	ttDimPO
)

var ttStatusLabels = map[string]string{
	"planned":   "예정",
	"completed": "완료",
}

func computeTTDashBreakdown(rows []ttDashRow, dim ttDashDim, top int) []TTDashBreakdownRow {
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
		case ttDimStatus:
			key = r.Status
			if l, ok := ttStatusLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		case ttDimManufacturer:
			label = r.manufacturerName()
			if label == "" {
				key = "__unset__"
				label = "미지정"
			} else {
				key = label
			}
		case ttDimBank:
			if r.BankName != nil && *r.BankName != "" {
				key = *r.BankName
				label = key
			} else {
				key = "__unset__"
				label = "미지정"
			}
		case ttDimPurpose:
			if r.Purpose != nil && *r.Purpose != "" {
				key = *r.Purpose
				label = key
			} else {
				key = "__unset__"
				label = "용도 미지정"
			}
		case ttDimPO:
			if r.POID == "" {
				key = "__unset__"
			} else {
				key = r.POID
			}
			label = r.poNumber()
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
	out := make([]TTDashBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		out = append(out, TTDashBreakdownRow{
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
