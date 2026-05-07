package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"time"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BaroCallbackRecommendHandler — D-133 자동 콜백 추천 엔진 (BARO 전용, PR3.5).
//
// 비유: "오늘 누구에게 카톡 보낼지 추천 보드" — 영업이 출근 후 5분 안에
// 본인 담당 거래처 중 최근 매출 활성 + 적정 콜백 주기 거래처 리스트를 받음.
//
// 데이터 소스 (sanitized 패스스루):
//   - partners (owner_user_id 기반 담당자 매핑)
//   - sales (직전 6개월 활성 거래 판정)
//   - baro_incoming (현재 진행 중인 입고예정 — 안내 트리거 컨텍스트)
//
// 추천 정책 (PR3.5 단순 버전):
//   - "안내 가치 큰 거래처" = 최근 6개월 매출 활성 + 마지막 매출 30일 이상 경과(=다음 발주 시점 가까움)
//   - 본인 담당(`mine=true`) 또는 특정 owner(`owner_user_id=`) 또는 전체
//   - SKU-level 정밀 매칭(이 거래처가 직전에 산 모듈 ↔ 이번 입고 SKU 동일)은 PR3.6 으로 분리:
//     sales → outbound → bl_line → product 다단계 join 필요해 별도 RPC 함수 신설 후 통합.
type BaroCallbackRecommendHandler struct {
	DB *supa.Client
}

func NewBaroCallbackRecommendHandler(db *supa.Client) *BaroCallbackRecommendHandler {
	return &BaroCallbackRecommendHandler{DB: db}
}

// CallbackRecommendResponse — /baro/callback-recommend 응답.
type CallbackRecommendResponse struct {
	IncomingCount  int                          `json:"incoming_count"`
	IncomingSKUs   []CallbackIncomingSKU        `json:"incoming_skus"`
	ByOwner        []CallbackOwnerGroup         `json:"by_owner"`
	TotalCustomers int                          `json:"total_customers"`
}

type CallbackIncomingSKU struct {
	ProductID   string  `json:"product_id"`
	ProductName *string `json:"product_name"`
	Eta         *string `json:"eta"`
	Quantity    int     `json:"quantity"`
}

type CallbackOwnerGroup struct {
	OwnerUserID *string                    `json:"owner_user_id"`
	Customers   []CallbackCustomerCandidate `json:"customers"`
}

type CallbackCustomerCandidate struct {
	PartnerID         string  `json:"partner_id"`
	PartnerName       string  `json:"partner_name"`
	ContactPhone      *string `json:"contact_phone"`
	LastSaleDate      string  `json:"last_sale_date"`
	DaysSinceLastSale int     `json:"days_since_last_sale"`
	SaleCount6mo      int     `json:"sale_count_6mo"`
	SaleAmount6moKrw  float64 `json:"sale_amount_6mo_krw"`
	Reason            string  `json:"reason"`
}

// Get — GET /api/v1/baro/callback-recommend
//
// Query:
//   - mine=true            : 본인 담당 거래처만
//   - owner_user_id=<uuid> : 특정 owner 거래처만
func (h *BaroCallbackRecommendHandler) Get(w http.ResponseWriter, r *http.Request) {
	today := time.Now()
	sixMonthsAgo := today.AddDate(0, -6, 0).Format("2006-01-02")

	ownerFilter := r.URL.Query().Get("owner_user_id")
	if r.URL.Query().Get("mine") == "true" {
		ownerFilter = middleware.GetUserID(r.Context())
	}

	// 1. 활성 customer/both 거래처 (owner 필터 적용)
	pq := h.DB.From("partners").
		Select("partner_id,partner_name,partner_type,owner_user_id,contact_phone,is_active", "exact", false).
		Eq("is_active", "true").
		In("partner_type", []string{"customer", "both"})
	if ownerFilter != "" {
		pq = pq.Eq("owner_user_id", ownerFilter)
	}
	partnerData, _, err := pq.Execute()
	if err != nil {
		log.Printf("[callback-recommend partners 실패] %v", err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 조회 실패")
		return
	}
	var partners []model.Partner
	if err := json.Unmarshal(partnerData, &partners); err != nil {
		response.RespondError(w, http.StatusInternalServerError, "응답 처리 실패")
		return
	}
	partnerMap := make(map[string]model.Partner, len(partners))
	for _, p := range partners {
		partnerMap[p.PartnerID] = p
	}

	// 2. 직전 6개월 sales (전체 — 거래처별 필터는 in-memory 에서)
	salesData, _, err := h.DB.From("sales").
		Select("customer_id,total_amount,tax_invoice_date", "exact", false).
		Gte("tax_invoice_date", sixMonthsAgo).
		Execute()
	if err != nil {
		log.Printf("[callback-recommend sales 실패] %v", err)
		// fallback: empty sales — 추천 0
		salesData = []byte("[]")
	}
	var sales []struct {
		CustomerID     string   `json:"customer_id"`
		TotalAmount    *float64 `json:"total_amount"`
		TaxInvoiceDate *string  `json:"tax_invoice_date"`
	}
	if err := json.Unmarshal(salesData, &sales); err != nil {
		log.Printf("[callback-recommend sales 디코딩 실패] %v", err)
		sales = nil
	}

	// 3. partner 별 최근 매출 집계
	type agg struct {
		count  int
		amount float64
		last   string
	}
	aggMap := make(map[string]*agg)
	for _, s := range sales {
		if s.TaxInvoiceDate == nil || *s.TaxInvoiceDate == "" {
			continue
		}
		if _, ok := partnerMap[s.CustomerID]; !ok {
			continue // owner 필터에서 빠진 거래처는 스킵
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
		if *s.TaxInvoiceDate > a.last {
			a.last = *s.TaxInvoiceDate
		}
	}

	// 4. 콜백 후보 생성 — "마지막 매출 30일+ 경과 + 매출 이력 있음" 만 채택
	type ownerKey string
	byOwner := make(map[ownerKey][]CallbackCustomerCandidate)
	totalCustomers := 0
	for _, p := range partners {
		a, ok := aggMap[p.PartnerID]
		if !ok || a.last == "" {
			continue
		}
		t, perr := time.Parse("2006-01-02", a.last)
		if perr != nil {
			continue
		}
		days := int(today.Sub(t).Hours() / 24)
		if days < 30 {
			continue // 너무 최근 거래 — 콜백 불필요
		}
		reason := "정기 콜백 후보"
		switch {
		case days >= 90:
			reason = "오래 미주문 — 재활성화 후보"
		case days >= 60:
			reason = "다음 발주 주기 도래"
		}
		cand := CallbackCustomerCandidate{
			PartnerID:         p.PartnerID,
			PartnerName:       p.PartnerName,
			ContactPhone:      p.ContactPhone,
			LastSaleDate:      a.last,
			DaysSinceLastSale: days,
			SaleCount6mo:      a.count,
			SaleAmount6moKrw:  a.amount,
			Reason:            reason,
		}
		key := ownerKey("")
		if p.OwnerUserID != nil {
			key = ownerKey(*p.OwnerUserID)
		}
		byOwner[key] = append(byOwner[key], cand)
		totalCustomers++
	}

	// 5. owner 별 정렬 — days_since_last_sale 큰 순 (오래된 거 먼저)
	for k := range byOwner {
		sort.SliceStable(byOwner[k], func(i, j int) bool {
			return byOwner[k][i].DaysSinceLastSale > byOwner[k][j].DaysSinceLastSale
		})
	}
	ownerGroups := make([]CallbackOwnerGroup, 0, len(byOwner))
	for k, v := range byOwner {
		grp := CallbackOwnerGroup{Customers: v}
		if k != "" {
			id := string(k)
			grp.OwnerUserID = &id
		}
		ownerGroups = append(ownerGroups, grp)
	}
	sort.SliceStable(ownerGroups, func(i, j int) bool {
		return len(ownerGroups[i].Customers) > len(ownerGroups[j].Customers)
	})

	// 6. 입고예정 SKU 컨텍스트 — frontend 가 트리거 보드에 같이 표시
	incomingData, _, ierr := h.DB.From("bl_line").
		Select("product_id,quantity,eta,product:products(product_name)", "exact", false).
		In("status", []string{"scheduled", "shipping", "arrived"}).
		Order("eta", nil).
		Limit(20, "").
		Execute()
	var incomingRows []struct {
		ProductID string  `json:"product_id"`
		Quantity  int     `json:"quantity"`
		Eta       *string `json:"eta"`
		Product   *struct {
			ProductName string `json:"product_name"`
		} `json:"product"`
	}
	if ierr == nil {
		_ = json.Unmarshal(incomingData, &incomingRows)
	}
	skus := make([]CallbackIncomingSKU, 0, len(incomingRows))
	for _, ir := range incomingRows {
		row := CallbackIncomingSKU{
			ProductID: ir.ProductID,
			Eta:       ir.Eta,
			Quantity:  ir.Quantity,
		}
		if ir.Product != nil {
			n := ir.Product.ProductName
			row.ProductName = &n
		}
		skus = append(skus, row)
	}

	resp := CallbackRecommendResponse{
		IncomingCount:  len(skus),
		IncomingSKUs:   skus,
		ByOwner:        ownerGroups,
		TotalCustomers: totalCustomers,
	}
	response.RespondJSON(w, http.StatusOK, resp)
}
