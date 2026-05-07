package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"time"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BaroRFMHandler — D-128 거래처 RFM/세그먼트 보드 (BARO 전용).
//
// 비유: "200 거래처 한 장 분류표" — 영업 6명이 본인 담당 거래처 중
// 누가 champion / 누가 위험(at_risk) / 누가 침체(lost) 인지를 30초 안에 정렬한다.
//
// 데이터 소스 (모두 sanitized 패스스루 — D-108/D-117 격리 유지):
//   - partners (master.partner): 거래처 마스터
//   - sales (tx.sale): customer_id 별 직전 12개월 집계
//
// 집계 방식: SQL GROUP BY 함수 신설 회피 — Go 메모리 집계.
// 12개월 매출이 1000억 ÷ 평균 ~3억/건 = 연 ~330건 규모라 메모리 처리 비용 미미.
// 향후 매출 폭증 시 별도 RPC 함수(baro_rfm_aggregate) 도입 검토.
type BaroRFMHandler struct {
	DB *supa.Client
}

func NewBaroRFMHandler(db *supa.Client) *BaroRFMHandler {
	return &BaroRFMHandler{DB: db}
}

// RFMRow — 한 거래처의 RFM 집계 + 세그먼트 분류 결과.
type RFMRow struct {
	PartnerID         string   `json:"partner_id"`
	PartnerName       string   `json:"partner_name"`
	PartnerType       string   `json:"partner_type"`
	OwnerUserID       *string  `json:"owner_user_id"`
	LastSaleDate      *string  `json:"last_sale_date"`
	DaysSinceLastSale *int     `json:"days_since_last_sale"`
	SaleCount12mo     int      `json:"sale_count_12mo"`
	SaleAmount12moKrw float64  `json:"sale_amount_12mo_krw"`
	Segment           string   `json:"segment"` // champion / loyal / new / at_risk / lost / inactive
}

// Get — GET /api/v1/baro/rfm
//
// 활성 customer/both 거래처 전체 + 직전 12개월 매출 집계 + 세그먼트 분류.
// 전체 거래처를 한 응답에 담는다 (200곳 규모) — 거래처별 프론트 필터·정렬을 위해.
func (h *BaroRFMHandler) Get(w http.ResponseWriter, r *http.Request) {
	today := time.Now()
	twelveMonthsAgo := today.AddDate(0, -12, 0).Format("2006-01-02")

	// 1. 활성 고객 거래처 전체
	partnerData, _, err := h.DB.From("partners").
		Select("partner_id,partner_name,partner_type,owner_user_id,is_active", "exact", false).
		Eq("is_active", "true").
		In("partner_type", []string{"customer", "both"}).
		Execute()
	if err != nil {
		log.Printf("[RFM partners 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 조회에 실패했습니다")
		return
	}
	var partners []model.Partner
	if err := json.Unmarshal(partnerData, &partners); err != nil {
		log.Printf("[RFM partners 디코딩 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	// 2. 직전 12개월 매출 (customer_id 별 집계용 raw 행)
	salesData, _, err := h.DB.From("sales").
		Select("customer_id,total_amount,tax_invoice_date", "exact", false).
		Gte("tax_invoice_date", twelveMonthsAgo).
		Execute()
	var sales []struct {
		CustomerID     string   `json:"customer_id"`
		TotalAmount    *float64 `json:"total_amount"`
		TaxInvoiceDate *string  `json:"tax_invoice_date"`
	}
	if err != nil {
		log.Printf("[RFM sales 실패] %v — partner-only 응답으로 fallback", err)
		// 부분 실패 허용: sales 가 깨져도 partner 기본 정보는 반환 (모두 inactive)
	} else if err := json.Unmarshal(salesData, &sales); err != nil {
		log.Printf("[RFM sales 디코딩 실패] %v", err)
		sales = nil
	}

	// 3. customer_id 별 메모리 집계
	type agg struct {
		count       int
		amount      float64
		lastSaleStr string
	}
	aggMap := make(map[string]*agg, len(partners))
	for _, s := range sales {
		if s.TaxInvoiceDate == nil || *s.TaxInvoiceDate == "" {
			continue
		}
		a, ok := aggMap[s.CustomerID]
		if !ok {
			a = &agg{}
			aggMap[s.CustomerID] = a
		}
		a.count++
		if s.TotalAmount != nil {
			a.amount += *s.TotalAmount
		}
		if *s.TaxInvoiceDate > a.lastSaleStr {
			a.lastSaleStr = *s.TaxInvoiceDate
		}
	}

	// 4. partner × agg 결합 + 분류
	rows := make([]RFMRow, 0, len(partners))
	for _, p := range partners {
		row := RFMRow{
			PartnerID:   p.PartnerID,
			PartnerName: p.PartnerName,
			PartnerType: p.PartnerType,
			OwnerUserID: p.OwnerUserID,
		}
		if a, ok := aggMap[p.PartnerID]; ok {
			row.SaleCount12mo = a.count
			row.SaleAmount12moKrw = a.amount
			if a.lastSaleStr != "" {
				lastStr := a.lastSaleStr
				row.LastSaleDate = &lastStr
				if t, perr := time.Parse("2006-01-02", a.lastSaleStr); perr == nil {
					days := int(today.Sub(t).Hours() / 24)
					if days < 0 {
						days = 0
					}
					row.DaysSinceLastSale = &days
				}
			}
		}
		row.Segment = classifyRFM(row)
		rows = append(rows, row)
	}

	// 매출 큰 순 정렬 — 영업이 가장 자주 보는 정렬
	sort.SliceStable(rows, func(i, j int) bool {
		return rows[i].SaleAmount12moKrw > rows[j].SaleAmount12moKrw
	})
	response.RespondJSON(w, http.StatusOK, rows)
}

// classifyRFM — 단순 임계값 기반 분류. PR4.5 에서 동적 분위수(quartile) 기반으로 개선 예정.
//
// 임계값 (1000억 매출 / 200거래처 컨텍스트):
//   - champion : 최근 30일 + 5건+ + 1억+
//   - loyal    : 최근 60일 + 3건+
//   - new      : 최근 30일 + 2건 이하 (거래 시작 단계)
//   - at_risk  : 90일+ 미주문 + 5천만+ 매출 이력 (재활성화 후보)
//   - lost     : 그 외 침체
//   - inactive : 12개월 매출 0건
func classifyRFM(r RFMRow) string {
	if r.SaleCount12mo == 0 {
		return "inactive"
	}
	days := 999
	if r.DaysSinceLastSale != nil {
		days = *r.DaysSinceLastSale
	}
	switch {
	case days <= 30 && r.SaleCount12mo >= 5 && r.SaleAmount12moKrw >= 100_000_000:
		return "champion"
	case days <= 60 && r.SaleCount12mo >= 3:
		return "loyal"
	case days <= 30 && r.SaleCount12mo <= 2:
		return "new"
	case days >= 90 && r.SaleAmount12moKrw >= 50_000_000:
		return "at_risk"
	default:
		return "lost"
	}
}
