package bl

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"solarflow-backend/internal/response"
)

// BL 대시보드 집계 — ProcurementPage BL 탭 KPI/sparkline + 4 BL Insight (Total/Import/Shipping/Customs) 의
// client-side aggregation 을 서버에서 한 번에. C-1 procurement 4/4 (마지막).

const (
	blDashChunkSize    = 1000
	blDashMaxChunks    = 50
	blDashTrendMonths  = 24
	blDashTopN         = 10
)

// BLScope: lifetime|import|shipping|customs. breakdowns 만 좁힘. trend24/totals 는 항상 전체.
type BLDashboard struct {
	Totals              BLDashTotals          `json:"totals"`
	Trend24             []BLDashTrendPoint    `json:"trend24"`
	StatusScope         string                `json:"status_scope"`
	ByStatus            []BLDashBreakdownRow  `json:"by_status"`
	ByInboundType       []BLDashBreakdownRow  `json:"by_inbound_type"`
	ByManufacturerTop10 []BLDashBreakdownRow  `json:"by_manufacturer_top10"`
	ByPortTop10         []BLDashBreakdownRow  `json:"by_port_top10"`
	ByForwarderTop10    []BLDashBreakdownRow  `json:"by_forwarder_top10"`
}

type BLDashTotals struct {
	Count          int     `json:"count"`
	ImportCount    int     `json:"import_count"`     // inbound_type=import
	ShippingCount  int     `json:"shipping_count"`   // status in (shipping, arrived)
	CustomsCount   int     `json:"customs_count"`    // status=customs
	CompletedCount int     `json:"completed_count"`  // status=completed
	CIFAmountKRW   float64 `json:"cif_amount_krw"`   // sum cif_amount_krw
}

// BLDashTrendPoint — actual_arrival > eta > etd 우선순위 binning. Insight 별 spark 위해 모든 카운트 포함.
type BLDashTrendPoint struct {
	Month         string `json:"month"`
	Count         int    `json:"count"`
	ImportCount   int    `json:"import_count"`
	ShippingCount int    `json:"shipping_count"`
	CustomsCount  int    `json:"customs_count"`
}

type BLDashBreakdownRow struct {
	Key   string  `json:"key"`
	Label string  `json:"label"`
	Count int     `json:"count"`
	Share float64 `json:"share"` // count 기준 0..1
}

// blDashRow — BL join 결과 평탄화 (manufacturers 추가).
type blDashRow struct {
	BLID           string   `json:"bl_id"`
	ManufacturerID string   `json:"manufacturer_id"`
	InboundType    string   `json:"inbound_type"`
	ETD            *string  `json:"etd"`
	ETA            *string  `json:"eta"`
	ActualArrival  *string  `json:"actual_arrival"`
	Port           *string  `json:"port"`
	Forwarder      *string  `json:"forwarder"`
	Status         string   `json:"status"`
	CIFAmountKRW   *int64   `json:"cif_amount_krw,omitempty"`
	Manufacturers  *struct {
		NameKR string `json:"name_kr"`
	} `json:"manufacturers"`
}

// blBinDate — actual_arrival > eta > etd 우선순위.
func (r blDashRow) binDate() string {
	if r.ActualArrival != nil && *r.ActualArrival != "" {
		return *r.ActualArrival
	}
	if r.ETA != nil && *r.ETA != "" {
		return *r.ETA
	}
	if r.ETD != nil && *r.ETD != "" {
		return *r.ETD
	}
	return ""
}

func (r blDashRow) manufacturerName() string {
	if r.Manufacturers != nil && r.Manufacturers.NameKR != "" {
		return r.Manufacturers.NameKR
	}
	return ""
}

// Dashboard — GET /api/v1/bls/dashboard.
//
// bls_dashboard() RPC (migration 080) 우선. 실패 시 fallback.
func (h *BLHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	if dashJSON, ok := h.tryRPCBlsDashboard(r); ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dashJSON)
		return
	}
	rows, err := h.fetchAllForBLDashboard(r)
	if err != nil {
		log.Printf("[BL 대시보드 데이터 수집 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "BL 대시보드 데이터 조회에 실패했습니다")
		return
	}
	scope := normalizeBLScope(r.URL.Query().Get("status_scope"))
	dash := computeBLDashboard(rows, scope)
	response.RespondJSON(w, http.StatusOK, dash)
}

func (h *BLHandler) tryRPCBlsDashboard(r *http.Request) ([]byte, bool) {
	q := r.URL.Query()
	args := map[string]any{}
	if v := q.Get("company_id"); v != "" && v != "all" {
		args["p_company_id"] = v
	}
	if v := q.Get("manufacturer_id"); v != "" {
		args["p_manufacturer_id"] = v
	}
	if v := q.Get("status"); v != "" {
		args["p_status"] = v
	}
	if v := q.Get("inbound_type"); v != "" {
		args["p_inbound_type"] = v
	}
	args["p_status_scope"] = normalizeBLScope(q.Get("status_scope"))
	data, _, err := h.DB.From("rpc/bls_dashboard").Insert(args, false, "", "", "").Execute()
	if err != nil {
		log.Printf("[BL 대시보드 RPC 실패 — fallback 사용] %v", err)
		return nil, false
	}
	if len(data) > 0 && (data[0] == '{' || data[0] == '[') {
		var arr []json.RawMessage
		if data[0] == '[' && json.Unmarshal(data, &arr) == nil && len(arr) > 0 {
			var wrap map[string]json.RawMessage
			if json.Unmarshal(arr[0], &wrap) == nil {
				if inner, ok := wrap["bls_dashboard"]; ok {
					return inner, true
				}
			}
			return arr[0], true
		}
		return data, true
	}
	return nil, false
}

func normalizeBLScope(raw string) string {
	switch raw {
	case "import", "shipping", "customs":
		return raw
	}
	return "lifetime"
}

func (h *BLHandler) fetchAllForBLDashboard(r *http.Request) ([]blDashRow, error) {
	all := make([]blDashRow, 0, blDashChunkSize)
	for chunk := 0; chunk < blDashMaxChunks; chunk++ {
		q := h.DB.From("bl_shipments").Select("*, manufacturers(name_kr)", "exact", false)
		q = h.applyBLFilters(r, q)
		offset := chunk * blDashChunkSize
		q = q.Range(offset, offset+blDashChunkSize-1, "")

		data, _, err := q.Execute()
		if err != nil {
			return nil, fmt.Errorf("bls 청크 #%d 조회 실패: %w", chunk, err)
		}
		var batch []blDashRow
		if err := json.Unmarshal(data, &batch); err != nil {
			return nil, fmt.Errorf("bls 청크 #%d 디코딩 실패: %w", chunk, err)
		}
		all = append(all, batch...)
		if len(batch) < blDashChunkSize {
			break
		}
	}
	return all, nil
}

func computeBLDashboard(rows []blDashRow, scope string) *BLDashboard {
	d := &BLDashboard{
		StatusScope:         scope,
		Trend24:             make([]BLDashTrendPoint, 0, blDashTrendMonths),
		ByStatus:            []BLDashBreakdownRow{},
		ByInboundType:       []BLDashBreakdownRow{},
		ByManufacturerTop10: []BLDashBreakdownRow{},
		ByPortTop10:         []BLDashBreakdownRow{},
		ByForwarderTop10:    []BLDashBreakdownRow{},
	}
	d.Totals = computeBLDashTotals(rows)
	d.Trend24 = computeBLDashTrend24(rows)

	scoped := filterBLByScope(rows, scope)
	d.ByStatus = computeBLDashBreakdown(scoped, blDimStatus, 0)
	d.ByInboundType = computeBLDashBreakdown(scoped, blDimInboundType, 0)
	d.ByManufacturerTop10 = computeBLDashBreakdown(scoped, blDimManufacturer, blDashTopN)
	d.ByPortTop10 = computeBLDashBreakdown(scoped, blDimPort, blDashTopN)
	d.ByForwarderTop10 = computeBLDashBreakdown(scoped, blDimForwarder, blDashTopN)
	return d
}

func filterBLByScope(rows []blDashRow, scope string) []blDashRow {
	switch scope {
	case "import":
		out := make([]blDashRow, 0, len(rows))
		for _, r := range rows {
			if r.InboundType == "import" {
				out = append(out, r)
			}
		}
		return out
	case "shipping":
		out := make([]blDashRow, 0, len(rows))
		for _, r := range rows {
			if r.Status == "shipping" || r.Status == "arrived" {
				out = append(out, r)
			}
		}
		return out
	case "customs":
		out := make([]blDashRow, 0, len(rows))
		for _, r := range rows {
			if r.Status == "customs" {
				out = append(out, r)
			}
		}
		return out
	}
	return rows
}

func computeBLDashTotals(rows []blDashRow) BLDashTotals {
	t := BLDashTotals{Count: len(rows)}
	for _, r := range rows {
		if r.InboundType == "import" {
			t.ImportCount++
		}
		switch r.Status {
		case "shipping", "arrived":
			t.ShippingCount++
		case "customs":
			t.CustomsCount++
		case "completed":
			t.CompletedCount++
		}
		if r.CIFAmountKRW != nil {
			t.CIFAmountKRW += float64(*r.CIFAmountKRW)
		}
	}
	return t
}

func computeBLDashTrend24(rows []blDashRow) []BLDashTrendPoint {
	now := time.Now()
	labels := make([]string, blDashTrendMonths)
	idx := make(map[string]int, blDashTrendMonths)
	for i := 0; i < blDashTrendMonths; i++ {
		t := now.AddDate(0, -(blDashTrendMonths-1-i), 0)
		key := fmt.Sprintf("%04d-%02d", t.Year(), int(t.Month()))
		labels[i] = key
		idx[key] = i
	}
	out := make([]BLDashTrendPoint, blDashTrendMonths)
	for i, m := range labels {
		out[i] = BLDashTrendPoint{Month: m}
	}
	for _, r := range rows {
		m := monthOf(r.binDate())
		if m == "" {
			continue
		}
		i, ok := idx[m]
		if !ok {
			continue
		}
		out[i].Count++
		if r.InboundType == "import" {
			out[i].ImportCount++
		}
		switch r.Status {
		case "shipping", "arrived":
			out[i].ShippingCount++
		case "customs":
			out[i].CustomsCount++
		}
	}
	return out
}

type blDashDim int

const (
	blDimStatus blDashDim = iota
	blDimInboundType
	blDimManufacturer
	blDimPort
	blDimForwarder
)

var blStatusLabels = map[string]string{
	"draft":     "초안",
	"shipping":  "선적",
	"arrived":   "입항",
	"customs":   "통관중",
	"completed": "완료",
	"cancelled": "취소",
}

var blInboundTypeLabels = map[string]string{
	"import":           "해외직수입",
	"domestic":         "국내",
	"intercompany":     "그룹내거래",
	"transfer":         "창고이동",
}

func computeBLDashBreakdown(rows []blDashRow, dim blDashDim, top int) []BLDashBreakdownRow {
	type acc struct {
		label string
		count int
	}
	m := make(map[string]*acc, 16)
	totalCount := 0
	for _, r := range rows {
		var key, label string
		switch dim {
		case blDimStatus:
			key = r.Status
			if l, ok := blStatusLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		case blDimInboundType:
			key = r.InboundType
			if l, ok := blInboundTypeLabels[key]; ok {
				label = l
			} else {
				label = key
			}
		case blDimManufacturer:
			label = r.manufacturerName()
			if label == "" {
				key = "__unset__"
				label = "미지정"
			} else {
				key = r.ManufacturerID
				if key == "" {
					key = label
				}
			}
		case blDimPort:
			if r.Port != nil && *r.Port != "" {
				key = *r.Port
				label = key
			} else {
				key = "__unset__"
				label = "미지정"
			}
		case blDimForwarder:
			if r.Forwarder != nil && *r.Forwarder != "" {
				key = *r.Forwarder
				label = key
			} else {
				key = "__unset__"
				label = "미지정"
			}
		}
		a, ok := m[key]
		if !ok {
			a = &acc{label: label}
			m[key] = a
		}
		a.count++
		totalCount++
	}
	out := make([]BLDashBreakdownRow, 0, len(m))
	for k, a := range m {
		share := 0.0
		if totalCount > 0 {
			share = float64(a.count) / float64(totalCount)
		}
		out = append(out, BLDashBreakdownRow{
			Key: k, Label: a.label, Count: a.count, Share: share,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Count > out[j].Count
	})
	if top > 0 && len(out) > top {
		return out[:top]
	}
	return out
}
