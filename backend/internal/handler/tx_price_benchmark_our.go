package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"solarflow-backend/internal/response"
)

// OurPrices — GET /api/v1/price-benchmarks/our-prices?from=YYYY-MM-DD
//
// 가격예측 차트에 우리 구매 계약가 + 평균 판매가 시리즈를 추가하기 위한
// 월별 가중평균 응답 (D-064 PR 42).
//
// 응답:
//   {
//     "purchases": [{month, count, avg_usd_wp, avg_krw_wp}],
//     "sales":     [{month, count, avg_krw_wp}]
//   }
//
// 데이터 출처:
//   purchases — import_declarations.contract_unit_price_usd_wp (월 평균, USD/Wp)
//                + cost_unit_price_wp (월 평균, KRW/Wp)
//   sales     — sales.unit_price_wp (월 평균, KRW/Wp, status<>'cancelled')
func (h *PriceBenchmarkHandler) OurPrices(w http.ResponseWriter, r *http.Request) {
	from := r.URL.Query().Get("from")
	if from == "" {
		from = time.Now().AddDate(0, -18, 0).Format("2006-01-02")
	}

	// 1) purchases — declarations 의 USD/Wp + KRW/Wp 월 평균
	purchases, err := h.fetchPurchaseAvg(from)
	if err != nil {
		log.Printf("[our-prices] purchases 조회 실패: %v", err)
	}

	// 2) sales — 월 평균 KRW/Wp
	sales, err := h.fetchSalesAvg(from)
	if err != nil {
		log.Printf("[our-prices] sales 조회 실패: %v", err)
	}

	response.RespondJSON(w, http.StatusOK, map[string]any{
		"purchases":    purchases,
		"sales":        sales,
		"generated_at": time.Now().UTC().Format(time.RFC3339),
	})
}

type purchaseAvgRow struct {
	Month     string  `json:"month"`
	Count     int     `json:"count"`
	AvgUSDWp  float64 `json:"avg_usd_wp"`
	AvgKRWWp  float64 `json:"avg_krw_wp"`
}

type salesAvgRow struct {
	Month    string  `json:"month"`
	Count    int     `json:"count"`
	AvgKRWWp float64 `json:"avg_krw_wp"`
}

// fetchPurchaseAvg — import_declarations 월별 평균.
// PostgREST 기본 limit 1000 — 1년치 면장 100~200건이라 충분.
func (h *PriceBenchmarkHandler) fetchPurchaseAvg(from string) ([]purchaseAvgRow, error) {
	data, _, err := h.DB.From("import_declarations").
		Select("declaration_date,contract_unit_price_usd_wp,cost_unit_price_wp", "exact", false).
		Gte("declaration_date", from).
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []struct {
		DeclarationDate           string   `json:"declaration_date"`
		ContractUnitPriceUSDWp    *float64 `json:"contract_unit_price_usd_wp"`
		CostUnitPriceWp           *float64 `json:"cost_unit_price_wp"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}

	type agg struct {
		usdSum, krwSum float64
		usdN, krwN     int
	}
	monthly := map[string]*agg{}
	for _, r := range rows {
		if len(r.DeclarationDate) < 7 {
			continue
		}
		month := r.DeclarationDate[:7] // YYYY-MM
		a, ok := monthly[month]
		if !ok {
			a = &agg{}
			monthly[month] = a
		}
		if r.ContractUnitPriceUSDWp != nil && *r.ContractUnitPriceUSDWp > 0 {
			a.usdSum += *r.ContractUnitPriceUSDWp
			a.usdN++
		}
		if r.CostUnitPriceWp != nil && *r.CostUnitPriceWp > 0 {
			a.krwSum += *r.CostUnitPriceWp
			a.krwN++
		}
	}

	out := make([]purchaseAvgRow, 0, len(monthly))
	for month, a := range monthly {
		row := purchaseAvgRow{Month: month, Count: a.usdN}
		if a.usdN > 0 {
			row.AvgUSDWp = a.usdSum / float64(a.usdN)
		}
		if a.krwN > 0 {
			row.AvgKRWWp = a.krwSum / float64(a.krwN)
		}
		out = append(out, row)
	}
	// 월 오름차순
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Month < out[i].Month {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}

// fetchSalesAvg — sales 월별 평균 unit_price_wp (KRW/Wp).
// 1000행 cap — 우리 sales 가 2000+ 라 청크 페이지네이션 필요.
func (h *PriceBenchmarkHandler) fetchSalesAvg(from string) ([]salesAvgRow, error) {
	data, err := fetchAllFromTable(h.DB, "sales", "tax_invoice_date,unit_price_wp,status")
	if err != nil {
		return nil, err
	}
	var rows []struct {
		TaxInvoiceDate *string  `json:"tax_invoice_date"`
		UnitPriceWp    *float64 `json:"unit_price_wp"`
		Status         *string  `json:"status"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}

	type agg struct {
		sum float64
		n   int
	}
	monthly := map[string]*agg{}
	for _, r := range rows {
		if r.TaxInvoiceDate == nil || len(*r.TaxInvoiceDate) < 7 {
			continue
		}
		if r.Status != nil && *r.Status == "cancelled" {
			continue
		}
		if r.UnitPriceWp == nil || *r.UnitPriceWp <= 0 {
			continue
		}
		// from 이전 행 제외
		if (*r.TaxInvoiceDate)[:10] < from {
			continue
		}
		month := (*r.TaxInvoiceDate)[:7]
		a, ok := monthly[month]
		if !ok {
			a = &agg{}
			monthly[month] = a
		}
		a.sum += *r.UnitPriceWp
		a.n++
	}

	out := make([]salesAvgRow, 0, len(monthly))
	for month, a := range monthly {
		if a.n == 0 {
			continue
		}
		out = append(out, salesAvgRow{Month: month, Count: a.n, AvgKRWWp: a.sum / float64(a.n)})
	}
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].Month < out[i].Month {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}
