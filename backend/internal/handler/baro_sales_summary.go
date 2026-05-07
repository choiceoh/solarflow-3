package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strconv"
	"time"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BaroSalesSummaryHandler — D-129 BARO 자체 매출 요약 (BARO 전용).
//
// 비유: "내 매출 분기보고서" — 영업담당자별 / 거래처 type별 / 월별 매출 한 페이지.
// module 계열의 `/sales-analysis` 는 매입원가·면장 기반 마진을 다루므로 BARO 차단(D-108).
// BARO 는 cost 노출 없이 매출액만 다양한 cut 으로 집계.
//
// 마진은 PR5.5 에서 baro_purchase_history 평균 매입원가 통합 후 도입.
type BaroSalesSummaryHandler struct {
	DB *supa.Client
}

func NewBaroSalesSummaryHandler(db *supa.Client) *BaroSalesSummaryHandler {
	return &BaroSalesSummaryHandler{DB: db}
}

// SalesSummaryResponse — 응답 합본.
type SalesSummaryResponse struct {
	PeriodMonths    int                      `json:"period_months"`
	StartDate       string                   `json:"start_date"`
	EndDate         string                   `json:"end_date"`
	TotalAmount     float64                  `json:"total_amount"`
	TotalCount      int                      `json:"total_count"`
	UniquePartners  int                      `json:"unique_partners"`
	ByOwner         []SalesSummaryByOwner    `json:"by_owner"`
	ByPartnerType   []SalesSummaryByType     `json:"by_partner_type"`
	ByMonth         []SalesSummaryByMonth    `json:"by_month"`
	TopPartners     []SalesSummaryByPartner  `json:"top_partners"`
}

type SalesSummaryByOwner struct {
	OwnerUserID  *string `json:"owner_user_id"`
	Amount       float64 `json:"amount"`
	Count        int     `json:"count"`
	PartnerCount int     `json:"partner_count"`
}

type SalesSummaryByType struct {
	PartnerType string  `json:"partner_type"`
	Amount      float64 `json:"amount"`
	Count       int     `json:"count"`
}

type SalesSummaryByMonth struct {
	Month  string  `json:"month"` // YYYY-MM
	Amount float64 `json:"amount"`
	Count  int     `json:"count"`
}

type SalesSummaryByPartner struct {
	PartnerID   string  `json:"partner_id"`
	PartnerName string  `json:"partner_name"`
	Amount      float64 `json:"amount"`
	Count       int     `json:"count"`
}

// Get — GET /api/v1/baro/sales-summary?months=12
//
// 직전 N개월 매출을 영업담당자/거래처타입/월/거래처별 4개 cut 으로 집계.
// 응답 한 번으로 분석 페이지 전체 렌더 (라운드트립 1회).
func (h *BaroSalesSummaryHandler) Get(w http.ResponseWriter, r *http.Request) {
	months := 12
	if mStr := r.URL.Query().Get("months"); mStr != "" {
		if m, err := strconv.Atoi(mStr); err == nil && m > 0 && m <= 36 {
			months = m
		}
	}
	today := time.Now()
	startDate := today.AddDate(0, -months, 0).Format("2006-01-02")
	endDate := today.Format("2006-01-02")

	// 1. partners 마스터 (owner_user_id, partner_type, partner_name 매핑용)
	partnerData, _, err := h.DB.From("partners").
		Select("partner_id,partner_name,partner_type,owner_user_id", "exact", false).
		Execute()
	if err != nil {
		log.Printf("[sales-summary partners 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 조회에 실패했습니다")
		return
	}
	var partners []model.Partner
	if err := json.Unmarshal(partnerData, &partners); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}
	partnerMap := make(map[string]model.Partner, len(partners))
	for _, p := range partners {
		partnerMap[p.PartnerID] = p
	}

	// 2. 직전 N개월 sales raw 행
	salesData, _, err := h.DB.From("sales").
		Select("customer_id,total_amount,tax_invoice_date", "exact", false).
		Gte("tax_invoice_date", startDate).
		Execute()
	if err != nil {
		log.Printf("[sales-summary sales 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "매출 조회에 실패했습니다")
		return
	}
	var sales []struct {
		CustomerID     string   `json:"customer_id"`
		TotalAmount    *float64 `json:"total_amount"`
		TaxInvoiceDate *string  `json:"tax_invoice_date"`
	}
	if err := json.Unmarshal(salesData, &sales); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 데이터 처리에 실패했습니다")
		return
	}

	// 3. 4 가지 cut 메모리 집계
	type ownerAgg struct {
		amount   float64
		count    int
		partners map[string]struct{}
	}
	byOwner := make(map[string]*ownerAgg)            // key: owner_user_id (or "" for null)
	byType := make(map[string]*SalesSummaryByType)   // key: partner_type
	byMonth := make(map[string]*SalesSummaryByMonth) // key: YYYY-MM
	byPartner := make(map[string]*SalesSummaryByPartner)
	totalAmount := 0.0
	totalCount := 0
	uniquePartnerSet := make(map[string]struct{})

	for _, s := range sales {
		if s.TaxInvoiceDate == nil || *s.TaxInvoiceDate == "" {
			continue
		}
		amt := 0.0
		if s.TotalAmount != nil {
			amt = *s.TotalAmount
		}
		totalAmount += amt
		totalCount++
		uniquePartnerSet[s.CustomerID] = struct{}{}

		// by month (YYYY-MM)
		month := (*s.TaxInvoiceDate)[:7]
		if mEntry, ok := byMonth[month]; ok {
			mEntry.Amount += amt
			mEntry.Count++
		} else {
			byMonth[month] = &SalesSummaryByMonth{Month: month, Amount: amt, Count: 1}
		}

		// partner-driven cuts (owner / type / partner)
		p, ok := partnerMap[s.CustomerID]
		if !ok {
			continue // partners 에 없는 customer_id → 집계 스킵 (deleted/legacy)
		}

		// by owner
		ownerKey := ""
		if p.OwnerUserID != nil {
			ownerKey = *p.OwnerUserID
		}
		if oEntry, ok := byOwner[ownerKey]; ok {
			oEntry.amount += amt
			oEntry.count++
			oEntry.partners[s.CustomerID] = struct{}{}
		} else {
			byOwner[ownerKey] = &ownerAgg{
				amount: amt, count: 1,
				partners: map[string]struct{}{s.CustomerID: {}},
			}
		}

		// by partner_type
		if tEntry, ok := byType[p.PartnerType]; ok {
			tEntry.Amount += amt
			tEntry.Count++
		} else {
			byType[p.PartnerType] = &SalesSummaryByType{PartnerType: p.PartnerType, Amount: amt, Count: 1}
		}

		// by partner
		if pEntry, ok := byPartner[s.CustomerID]; ok {
			pEntry.Amount += amt
			pEntry.Count++
		} else {
			byPartner[s.CustomerID] = &SalesSummaryByPartner{
				PartnerID: s.CustomerID, PartnerName: p.PartnerName, Amount: amt, Count: 1,
			}
		}
	}

	// 4. map → slice + 정렬
	ownerRows := make([]SalesSummaryByOwner, 0, len(byOwner))
	for k, v := range byOwner {
		row := SalesSummaryByOwner{Amount: v.amount, Count: v.count, PartnerCount: len(v.partners)}
		if k != "" {
			id := k
			row.OwnerUserID = &id
		}
		ownerRows = append(ownerRows, row)
	}
	sort.SliceStable(ownerRows, func(i, j int) bool {
		return ownerRows[i].Amount > ownerRows[j].Amount
	})

	typeRows := make([]SalesSummaryByType, 0, len(byType))
	for _, v := range byType {
		typeRows = append(typeRows, *v)
	}
	sort.SliceStable(typeRows, func(i, j int) bool {
		return typeRows[i].Amount > typeRows[j].Amount
	})

	monthRows := make([]SalesSummaryByMonth, 0, len(byMonth))
	for _, v := range byMonth {
		monthRows = append(monthRows, *v)
	}
	sort.SliceStable(monthRows, func(i, j int) bool {
		return monthRows[i].Month < monthRows[j].Month
	})

	partnerRows := make([]SalesSummaryByPartner, 0, len(byPartner))
	for _, v := range byPartner {
		partnerRows = append(partnerRows, *v)
	}
	sort.SliceStable(partnerRows, func(i, j int) bool {
		return partnerRows[i].Amount > partnerRows[j].Amount
	})
	// top 20 만 반환 (응답 크기 ↓)
	if len(partnerRows) > 20 {
		partnerRows = partnerRows[:20]
	}

	resp := SalesSummaryResponse{
		PeriodMonths:   months,
		StartDate:      startDate,
		EndDate:        endDate,
		TotalAmount:    totalAmount,
		TotalCount:     totalCount,
		UniquePartners: len(uniquePartnerSet),
		ByOwner:        ownerRows,
		ByPartnerType:  typeRows,
		ByMonth:        monthRows,
		TopPartners:    partnerRows,
	}
	response.RespondJSON(w, http.StatusOK, resp)
}
