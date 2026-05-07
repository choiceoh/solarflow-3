package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/supabase-community/postgrest-go"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/dbrpc"
	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

// BaroPartnerCockpitHandler — 거래처 360 (Partner Cockpit) 핸들러 (BARO 전용, D-125).
//
// 비유: "전화 응대 한 화면" — 한 거래처의 신용 / 최근 매출 / CRM 미처리·활동을
// 한 페이로드로 합쳐, 인바운드 응대 30초 안에 화면이 채워지도록 한다.
//
// 데이터 소스(모두 기존 sanitized 경로 재사용 — D-108/D-117 격리 유지):
//   - partners (master.partner)
//   - baro_credit_board RPC (baro.credit_board) → 해당 partner_id 한 행 추출
//   - sales (tx.sale) → customer_id 필터 + 직전 6개월
//   - partner_activities (crm.partner_activity) → 미처리 후속 + 최근 활동
//
// 의도적으로 PR1 에서 빈 배열(stub)로 두는 패널:
//   - quote_ready_skus  : PR2(통합 견적 빌더) 에서 채움
//   - incoming_matches  : PR4(RFM/재활성화) 또는 BL 라인 sanitized 통합 후 채움
type BaroPartnerCockpitHandler struct {
	DB *supa.Client
}

// NewBaroPartnerCockpitHandler — 의존성 주입.
func NewBaroPartnerCockpitHandler(db *supa.Client) *BaroPartnerCockpitHandler {
	return &BaroPartnerCockpitHandler{DB: db}
}

// CockpitResponse — /api/v1/baro/partner-cockpit/{partner_id} 응답.
//
// 클라이언트는 빠진 패널을 null/빈 배열로 받아도 부분 렌더링이 가능해야 한다
// (한 RPC 가 실패해도 다른 패널은 보이도록 설계 — 인바운드 응대 화면이 통째로
// 죽는 것보다 일부 정보라도 즉시 보이는 편이 영업 응대에 낫다).
type CockpitResponse struct {
	Partner          *model.Partner          `json:"partner"`
	Credit           *CockpitCreditPanel     `json:"credit"`
	RecentSales      []CockpitRecentSale     `json:"recent_sales"`
	OpenFollowups    []model.PartnerActivity `json:"open_followups"`
	RecentActivities []model.PartnerActivity `json:"recent_activities"`
	QuoteReadySKUs   []CockpitQuoteReadyRow  `json:"quote_ready_skus"`  // PR2 에서 채움
	IncomingMatches  []CockpitIncomingMatch  `json:"incoming_matches"`  // 후속 PR 에서 채움
}

// CockpitCreditPanel — 신용/한도 요약 (baro_credit_board RPC 의 한 행).
type CockpitCreditPanel struct {
	OutstandingKrw    *float64 `json:"outstanding_krw"`
	CreditLimitKrw    *float64 `json:"credit_limit_krw"`
	RemainingKrw      *float64 `json:"remaining_krw"`
	UtilizationPct    *float64 `json:"utilization_pct"`
	OldestUnpaidDays  *int     `json:"oldest_unpaid_days"`
	CreditPaymentDays *int     `json:"credit_payment_days"`
	LastSaleDate      *string  `json:"last_sale_date"`
	LastReceiptDate   *string  `json:"last_receipt_date"`
}

// CockpitRecentSale — 최근 매출 한 건 (직전 6개월, tax_invoice_date desc).
//
// 상품명 join 은 PR1 에서 생략 — sales 테이블 직접 컬럼만 사용 (응답 속도 우선).
// 영업이 단가/수량/금액을 보고 어떤 SKU 였는지 기억해내는 게 인바운드 응대 패턴.
type CockpitRecentSale struct {
	SaleID         string   `json:"sale_id"`
	TaxInvoiceDate *string  `json:"tax_invoice_date"`
	Quantity       *int     `json:"quantity"`
	UnitPriceWp    float64  `json:"unit_price_wp"`
	TotalAmount    *float64 `json:"total_amount"`
	Status         string   `json:"status"`
}

// CockpitQuoteReadyRow — PR2 stub.
type CockpitQuoteReadyRow struct {
	ProductID    string   `json:"product_id"`
	ProductName  string   `json:"product_name"`
	AvailableQty int      `json:"available_qty"`
	UnitPriceKrw float64  `json:"unit_price_krw"`
	MarginPct    *float64 `json:"margin_pct"`
}

// CockpitIncomingMatch — 후속 PR stub.
type CockpitIncomingMatch struct {
	ProductID       string  `json:"product_id"`
	ProductName     string  `json:"product_name"`
	Eta             *string `json:"eta"`
	Qty             int     `json:"qty"`
	LastPurchasedAt *string `json:"last_purchased_at"`
}

// Get — GET /api/v1/baro/partner-cockpit/{partner_id}
//
// 4개 sub-fetch 를 합쳐 한 응답. 어느 하나가 실패해도 나머지는 채운다(부분 렌더링).
func (h *BaroPartnerCockpitHandler) Get(w http.ResponseWriter, r *http.Request) {
	partnerID := chi.URLParam(r, "partner_id")
	if partnerID == "" {
		response.RespondError(w, http.StatusBadRequest, "partner_id가 필요합니다")
		return
	}

	// 1. 거래처 기본 — 없으면 404 로 즉시 반환(나머지 패널이 의미 없음)
	partner, err := h.fetchPartner(partnerID)
	if err != nil {
		log.Printf("[cockpit partner 조회 실패] partner=%s, err=%v", partnerID, err)
		response.RespondError(w, http.StatusInternalServerError, "거래처 조회에 실패했습니다")
		return
	}
	if partner == nil {
		response.RespondError(w, http.StatusNotFound, "거래처를 찾을 수 없습니다")
		return
	}

	// 2~4. 나머지 패널은 부분 실패 허용 (실패 시 nil/[]). 로그만 남긴다.
	credit := h.fetchCredit(r.Context(), partnerID)
	recentSales := h.fetchRecentSales(partnerID)
	openFollowups := h.fetchOpenFollowups(partnerID)
	recentActivities := h.fetchRecentActivities(partnerID)

	resp := CockpitResponse{
		Partner:          partner,
		Credit:           credit,
		RecentSales:      recentSales,
		OpenFollowups:    openFollowups,
		RecentActivities: recentActivities,
		QuoteReadySKUs:   []CockpitQuoteReadyRow{},
		IncomingMatches:  []CockpitIncomingMatch{},
	}
	response.RespondJSON(w, http.StatusOK, resp)
}

// fetchPartner — 거래처 단건 조회 (없으면 nil, 오류 시 err).
func (h *BaroPartnerCockpitHandler) fetchPartner(id string) (*model.Partner, error) {
	data, _, err := h.DB.From("partners").
		Select("*", "exact", false).
		Eq("partner_id", id).
		Limit(1, "").
		Execute()
	if err != nil {
		return nil, err
	}
	var rows []model.Partner
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// fetchCredit — baro_credit_board RPC 결과에서 해당 partner_id 한 행 추출.
//
// RPC 가 거래처 전체를 반환하므로 in-memory 필터. 거래처 200곳 규모라 비용 미미.
// 향후 RPC 시그니처에 partner_id 파라미터를 추가하면 바꾼다(별도 D-NNN).
func (h *BaroPartnerCockpitHandler) fetchCredit(ctx context.Context, partnerID string) *CockpitCreditPanel {
	body, err := dbrpc.Call(ctx, "baro_credit_board", map[string]interface{}{})
	if err != nil {
		log.Printf("[cockpit credit RPC 실패] partner=%s, err=%v", partnerID, err)
		return nil
	}
	var rows []struct {
		PartnerID         string   `json:"partner_id"`
		OutstandingKrw    *float64 `json:"outstanding_krw"`
		CreditLimitKrw    *float64 `json:"credit_limit_krw"`
		RemainingKrw      *float64 `json:"remaining_krw"`
		UtilizationPct    *float64 `json:"utilization_pct"`
		OldestUnpaidDays  *int     `json:"oldest_unpaid_days"`
		CreditPaymentDays *int     `json:"credit_payment_days"`
		LastSaleDate      *string  `json:"last_sale_date"`
		LastReceiptDate   *string  `json:"last_receipt_date"`
	}
	if err := json.Unmarshal(body, &rows); err != nil {
		log.Printf("[cockpit credit 디코딩 실패] %v", err)
		return nil
	}
	for _, row := range rows {
		if row.PartnerID == partnerID {
			return &CockpitCreditPanel{
				OutstandingKrw:    row.OutstandingKrw,
				CreditLimitKrw:    row.CreditLimitKrw,
				RemainingKrw:      row.RemainingKrw,
				UtilizationPct:    row.UtilizationPct,
				OldestUnpaidDays:  row.OldestUnpaidDays,
				CreditPaymentDays: row.CreditPaymentDays,
				LastSaleDate:      row.LastSaleDate,
				LastReceiptDate:   row.LastReceiptDate,
			}
		}
	}
	return nil
}

// fetchRecentSales — 직전 6개월 매출, tax_invoice_date desc, 최대 30건.
func (h *BaroPartnerCockpitHandler) fetchRecentSales(partnerID string) []CockpitRecentSale {
	sixMonthsAgo := time.Now().AddDate(0, -6, 0).Format("2006-01-02")
	data, _, err := h.DB.From("sales").
		Select("sale_id,tax_invoice_date,quantity,unit_price_wp,total_amount,status", "exact", false).
		Eq("customer_id", partnerID).
		Gte("tax_invoice_date", sixMonthsAgo).
		Order("tax_invoice_date", &postgrest.OrderOpts{Ascending: false, NullsFirst: false}).
		Limit(30, "").
		Execute()
	if err != nil {
		log.Printf("[cockpit recent sales 실패] partner=%s, err=%v", partnerID, err)
		return []CockpitRecentSale{}
	}
	var rows []CockpitRecentSale
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[cockpit recent sales 디코딩 실패] %v", err)
		return []CockpitRecentSale{}
	}
	if rows == nil {
		return []CockpitRecentSale{}
	}
	return rows
}

// fetchOpenFollowups — 이 거래처의 미처리 후속 (마감 빠른 순).
func (h *BaroPartnerCockpitHandler) fetchOpenFollowups(partnerID string) []model.PartnerActivity {
	data, _, err := h.DB.From("partner_activities").
		Select("*", "exact", false).
		Eq("partner_id", partnerID).
		Eq("follow_up_required", "true").
		Eq("follow_up_done", "false").
		Order("follow_up_due", &postgrest.OrderOpts{Ascending: true, NullsFirst: false}).
		Limit(20, "").
		Execute()
	if err != nil {
		log.Printf("[cockpit open followups 실패] partner=%s, err=%v", partnerID, err)
		return []model.PartnerActivity{}
	}
	var rows []model.PartnerActivity
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[cockpit open followups 디코딩 실패] %v", err)
		return []model.PartnerActivity{}
	}
	if rows == nil {
		return []model.PartnerActivity{}
	}
	return rows
}

// fetchRecentActivities — 이 거래처 최근 활동 10건 (timeline 미니).
func (h *BaroPartnerCockpitHandler) fetchRecentActivities(partnerID string) []model.PartnerActivity {
	data, _, err := h.DB.From("partner_activities").
		Select("*", "exact", false).
		Eq("partner_id", partnerID).
		Order("created_at", &postgrest.OrderOpts{Ascending: false}).
		Limit(10, "").
		Execute()
	if err != nil {
		log.Printf("[cockpit recent activities 실패] partner=%s, err=%v", partnerID, err)
		return []model.PartnerActivity{}
	}
	var rows []model.PartnerActivity
	if err := json.Unmarshal(data, &rows); err != nil {
		log.Printf("[cockpit recent activities 디코딩 실패] %v", err)
		return []model.PartnerActivity{}
	}
	if rows == nil {
		return []model.PartnerActivity{}
	}
	return rows
}
