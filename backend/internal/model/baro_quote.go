package model

import "time"

// BaroQuote — D-135 견적 헤더 (PR2.5b).
//
// status 머신: draft → sent → replied → won/lost/expired.
// snapshot 컬럼 (line 측): 견적 시점 product 정보 보존 — 마스터 변경에 불변.
type BaroQuote struct {
	QuoteID            string     `json:"quote_id"`
	PartnerID          string     `json:"partner_id"`
	CreatedBy          *string    `json:"created_by,omitempty"`
	CreatedAt          *time.Time `json:"created_at,omitempty"`
	UpdatedAt          *time.Time `json:"updated_at,omitempty"`
	ValidUntil         *string    `json:"valid_until,omitempty"`
	Notes              *string    `json:"notes,omitempty"`
	Status             string     `json:"status"`
	SentAt             *time.Time `json:"sent_at,omitempty"`
	SentChannel        *string    `json:"sent_channel,omitempty"` // kakao | sms | email | pdf | manual
	SentTo             *string    `json:"sent_to,omitempty"`
	RepliedAt          *time.Time `json:"replied_at,omitempty"`
	ReplyNote          *string    `json:"reply_note,omitempty"`
	SubtotalKrw        float64    `json:"subtotal_krw"`
	VatKrw             float64    `json:"vat_krw"`
	TotalKrw           float64    `json:"total_krw"`
	EstimatedCostKrw   *float64   `json:"estimated_cost_krw,omitempty"`
	EstimatedMarginPct *float64   `json:"estimated_margin_pct,omitempty"`
}

// BaroQuoteLine — 견적 라인 1건.
type BaroQuoteLine struct {
	LineID        string  `json:"line_id"`
	QuoteID       string  `json:"quote_id"`
	LineNo        int     `json:"line_no"`
	ProductID     *string `json:"product_id,omitempty"`
	ProductCode   *string `json:"product_code,omitempty"`
	ProductName   *string `json:"product_name,omitempty"`
	SpecWp        *int    `json:"spec_wp,omitempty"`
	Quantity      int     `json:"quantity"`
	UnitPriceKrw  float64 `json:"unit_price_krw"`
	LineTotalKrw  float64 `json:"line_total_krw"` // GENERATED 컬럼
	Notes         *string `json:"notes,omitempty"`
}

// CreateBaroQuoteRequest — 견적 생성 요청 (헤더 + 라인 묶음 한 번에).
type CreateBaroQuoteRequest struct {
	PartnerID  string                       `json:"partner_id"`
	ValidUntil *string                      `json:"valid_until,omitempty"`
	Notes      *string                      `json:"notes,omitempty"`
	Lines      []CreateBaroQuoteLineRequest `json:"lines"`
}

type CreateBaroQuoteLineRequest struct {
	ProductID    *string `json:"product_id,omitempty"`
	ProductCode  *string `json:"product_code,omitempty"`
	ProductName  *string `json:"product_name,omitempty"`
	SpecWp       *int    `json:"spec_wp,omitempty"`
	Quantity     int     `json:"quantity"`
	UnitPriceKrw float64 `json:"unit_price_krw"`
	Notes        *string `json:"notes,omitempty"`
}

func (req *CreateBaroQuoteRequest) Validate() string {
	if req.PartnerID == "" {
		return "partner_id는 필수입니다"
	}
	if len(req.Lines) == 0 {
		return "lines는 최소 1개 이상 필요합니다"
	}
	for i, l := range req.Lines {
		if l.Quantity <= 0 {
			return "lines[" + intToStr(i) + "].quantity는 양수여야 합니다"
		}
		if l.UnitPriceKrw < 0 {
			return "lines[" + intToStr(i) + "].unit_price_krw는 0 이상이어야 합니다"
		}
	}
	return ""
}

// UpdateBaroQuoteRequest — 견적 수정 (헤더 필드만 — 라인 변경은 별도 endpoint).
type UpdateBaroQuoteRequest struct {
	ValidUntil *string `json:"valid_until,omitempty"`
	Notes      *string `json:"notes,omitempty"`
	Status     *string `json:"status,omitempty"`
	ReplyNote  *string `json:"reply_note,omitempty"`
}

// QuoteSendRequest — 견적 발송 요청.
type QuoteSendRequest struct {
	Channel string `json:"channel"` // kakao | sms | email | pdf | manual
	SentTo  string `json:"sent_to"` // 전화번호 또는 이메일
}

func (req *QuoteSendRequest) Validate() string {
	switch req.Channel {
	case "kakao", "sms", "email", "pdf", "manual":
	default:
		return "channel은 kakao/sms/email/pdf/manual 중 하나여야 합니다"
	}
	if req.SentTo == "" && req.Channel != "manual" && req.Channel != "pdf" {
		return "sent_to는 필수입니다 (manual/pdf 제외)"
	}
	return ""
}

func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
