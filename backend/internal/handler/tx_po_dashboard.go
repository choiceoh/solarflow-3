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

// PO 대시보드 집계 — ProcurementPage PO 탭 KPI/sparkline + 3 PO Insight (Active/ContractTypes/Shipping) 의
// client-side aggregation 을 서버에서 한 번에 처리.
//
// 이전: usePOList → fetchAllPaginated(/api/v1/pos) (수 MB)
// 이후: useFooDashboard → /api/v1/pos/dashboard (~수 KB)

const (
	poDashChunkSize    = 1000
	poDashMaxChunks    = 50
	poDashTrendMonths  = 24
	poDashTopN         = 10
)

// POScope: lifetime|active|shipping. breakdowns 만 좁힘. trend24/totals 는 항상 전체 기준.
//   - active   = !completed && !cancelled
//   - shipping = status in (shipping, in_progress)
type PODashboard struct {
	Totals              PODashTotals          `json:"totals"`
	Trend24             []PODashTrendPoint    `json:"trend24"`
	StatusScope         string                `json:"status_scope"`
	ByStatus            []PODashBreakdownRow  `json:"by_status"`
	ByContractType      []PODashBreakdownRow  `json:"by_contract_type"`
	ByManufacturerTop10 []PODashBreakdownRow  `json:"by_manufacturer_top10"`
}

type PODashTotals struct {
	Count                int     `json:"count"`
	ActiveCount          int     `json:"active_count"`           // !completed && !cancelled
	ShippingCount        int     `json:"shipping_count"`         // shipping | in_progress
	CompletedCount       int     `json:"completed_count"`
	CancelledCount       int     `json:"cancelled_count"`
	TotalMw              float64 `json:"total_mw"`               // sum total_mw (전체)
	ActiveMw             float64 `json:"active_mw"`              // active 만
	ContractTypesCount   int     `json:"contract_types_count"`   // distinct contract_type
}

// PODashTrendPoint — contract_date 기반 월별 binning. distinct_contract_types 는 ContractTypes 화면 sparkline 용.
type PODashTrendPoint struct {
	Month                  string  `json:"month"`
	Count                  int     `json:"count"`
	ActiveCount            int     `json:"active_count"`
	ShippingCount          int     `json:"shipping_count"`
	TotalMw                float64 `json:"total_mw"`
	DistinctContractTypes  int     `json:"distinct_contract_types"`
}

type PODashBreakdownRow struct {
	Key     string  `json:"key"`
	Label   string  `json:"label"`
	Count   int     `json:"count"`
	TotalMw float64 `json:"total_mw"`
	Share   float64 `json:"share"` // count 기준 0..1
}

// Dashboard — GET /api/v1/pos/dashboard.
func (h *POHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	pos, err := h.fetchAllForPODashboard(r)
	if err != nil {
		log.Printf("[PO 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "PO 대시보드 데이터 조회에 실패했습니다")
		return
	}
	scope := normalizePOScope(r.URL.Query().Get("status_scope"))
	dash := computePODashboard(pos, scope)
	response.RespondJSON(w, http.StatusOK, dash)
}

func normalizePOScope(raw string) string {
	switch raw {
	case "active", "shipping":
		return raw
	}
	return "lifetime"
}

func (h *POHandler) fetchAllForPODashboard(r *http.Request) ([]model.PurchaseOrder, error) {
	all := make([]model.PurchaseOrder, 0, poDashChunkSize)
	for chunk := 0; chunk < poDashMaxChunks; chunk++ {
		q := h.DB.From("purchase_orders_ext").Select("*", "exact", false)
		q = h.applyPOFilters(r, q)
		offset := chunk * poDashChunkSize
		q = q.Range(offset, offset+poDashChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("pos 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []model.PurchaseOrder
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("pos 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < poDashChunkSize {
			break
		}
	}
	return all, nil
}

func computePODashboard(pos []model.PurchaseOrder, scope string) *PODashboard {
	d := &PODashboard{
		StatusScope:         scope,
		Trend24:             make([]PODashTrendPoint, 0, poDashTrendMonths),
		ByStatus:            []PODashBreakdownRow{},
		ByContractType:      []PODashBreakdownRow{},
		ByManufacturerTop10: []PODashBreakdownRow{},
	}
	d.Totals = computePODashTotals(pos)
	d.Trend24 = computePODashTrend24(pos)

	scoped := filterPOsByScope(pos, scope)
	d.ByStatus = computePODashBreakdown(scoped, poDimStatus, 0)
	d.ByContractType = computePODashBreakdown(scoped, poDimContractType, 0)
	d.ByManufacturerTop10 = computePODashBreakdown(scoped, poDimManufacturer, poDashTopN)
	return d
}

func filterPOsByScope(pos []model.PurchaseOrder, scope string) []model.PurchaseOrder {
	switch scope {
	case "active":
		out := make([]model.PurchaseOrder, 0, len(pos))
		for _, p := range pos {
			if p.Status != "completed" && p.Status != "cancelled" {
				out = append(out, p)
			}
		}
		return out
	case "shipping":
		out := make([]model.PurchaseOrder, 0, len(pos))
		for _, p := range pos {
			if p.Status == "shipping" || p.Status == "in_progress" {
				out = append(out, p)
			}
		}
		return out
	}
	return pos
}

func computePODashTotals(pos []model.PurchaseOrder) PODashTotals {
	t := PODashTotals{Count: len(pos)}
	contractTypes := make(map[string]struct{}, 4)
	for _, p := range pos {
		isActive := p.Status != "completed" && p.Status != "cancelled"
		if isActive {
			t.ActiveCount++
			if p.TotalMW != nil {
				t.ActiveMw += *p.TotalMW
			}
		}
		if p.Status == "shipping" || p.Status == "in_progress" {
			t.ShippingCount++
		}
		switch p.Status {
		case "completed":
			t.CompletedCount++
		case "cancelled":
			t.CancelledCount++
		}
		if p.TotalMW != nil {
			t.TotalMw += *p.TotalMW
		}
		if p.ContractType != "" {
			contractTypes[p.ContractType] = struct{}{}
		}
	}
	t.ContractTypesCount = len(contractTypes)
	return t
}

func computePODashTrend24(pos []model.PurchaseOrder) []PODashTrendPoint {
	now := time.Now()
	labels := make([]string, poDashTrendMonths)
	idx := make(map[string]int, poDashTrendMonths)
	for i := 0; i < poDashTrendMonths; i++ {
		t := now.AddDate(0, -(poDashTrendMonths-1-i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]PODashTrendPoint, poDashTrendMonths)
	for i, m := range labels {
		out[i] = PODashTrendPoint{Month: m}
	}
	contractTypes := make([]map[string]struct{}, poDashTrendMonths)
	for i := range contractTypes {
		contractTypes[i] = make(map[string]struct{}, 4)
	}
	for _, p := range pos {
		var date string
		if p.ContractDate != nil {
			date = *p.ContractDate
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
		if p.Status != "completed" && p.Status != "cancelled" {
			out[i].ActiveCount++
		}
		if p.Status == "shipping" || p.Status == "in_progress" {
			out[i].ShippingCount++
		}
		if p.TotalMW != nil {
			out[i].TotalMw += *p.TotalMW
		}
		if p.ContractType != "" {
			contractTypes[i][p.ContractType] = struct{}{}
		}
	}
	for i := range out {
		out[i].DistinctContractTypes = len(contractTypes[i])
	}
	return out
}

type poDashDim int

const (
	poDimStatus poDashDim = iota
	poDimContractType
	poDimManufacturer
)

var poStatusLabels = map[string]string{
	"contracted":  "계약",
	"in_progress": "진행",
	"shipping":    "운송중",
	"completed":   "완료",
	"cancelled":   "취소",
}

var poContractTypeLabels = map[string]string{
	"spot":  "스팟",
	"frame": "프레임",
}

func computePODashBreakdown(pos []model.PurchaseOrder, dim poDashDim, top int) []PODashBreakdownRow {
	type acc struct {
		label string
		count int
		mw    float64
	}
	m := make(map[string]*acc, 16)
	totalCount := 0
	for _, p := range pos {
		var key, label string
		switch dim {
		case poDimStatus:
			key = p.Status
			if l, ok := poStatusLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		case poDimContractType:
			key = p.ContractType
			if l, ok := poContractTypeLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		case poDimManufacturer:
			if p.ManufacturerID == "" {
				key = "__unset__"
			} else {
				key = p.ManufacturerID
			}
			label = strPtrOr(p.ManufacturerName, "미지정")
		}
		a, ok := m[key]
		if !ok {
			a = &acc{label: label}
			m[key] = a
		}
		a.count++
		if p.TotalMW != nil {
			a.mw += *p.TotalMW
		}
		totalCount++
	}
	rows := make([]PODashBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		rows = append(rows, PODashBreakdownRow{
			Key: k, Label: a.label, Count: a.count, TotalMw: a.mw, Share: share,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Count != rows[j].Count {
			return rows[i].Count > rows[j].Count
		}
		return rows[i].TotalMw > rows[j].TotalMw
	})
	if top > 0 && len(rows) > top {
		return rows[:top]
	}
	return rows
}
