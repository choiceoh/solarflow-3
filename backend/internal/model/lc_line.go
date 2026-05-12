package model

import "regexp"

// LC 라인아이템 유효성 검증 spec. PR-C 시점 BL (domains/bl/model_line.go) 의
// 동일 spec 과 dup — PR-D 에서 공통 lib (예: internal/validation) 분리 검토.
var validItemTypes = map[string]bool{
	"main":  true,
	"spare": true,
}

var validPaymentTypes = map[string]bool{
	"paid": true,
	"free": true,
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// LCLineItem — LC 라인아이템 구조체
// 비유: LC 서류에 붙는 품목별 명세표 — 어떤 PO 품목을 몇 장 개설했는지 기록
type LCLineItem struct {
	LCLineID       string   `json:"lc_line_id"`
	LCID           string   `json:"lc_id"`
	POLineID       *string  `json:"po_line_id,omitempty"`
	ProductID      string   `json:"product_id"`
	Quantity       int      `json:"quantity"`
	CapacityKW     float64  `json:"capacity_kw"`
	AmountUSD      *float64 `json:"amount_usd"`
	UnitPriceUSDWp *float64 `json:"unit_price_usd_wp"`
	ItemType       string   `json:"item_type"`
	PaymentType    string   `json:"payment_type"`
	Memo           *string  `json:"memo"`
}

// LCLineWithProduct — 품번 정보를 포함한 LC 라인아이템 조회 결과
// 비유: LC 품목 명세표에 품번 카탈로그 카드가 함께 붙어 있는 것
type LCLineWithProduct struct {
	LCLineItem
	Products *ProductSummaryForPOLine `json:"products"`
}

// CreateLCLineRequest — LC 라인아이템 등록 요청
// 비유: LC에 넣을 품목 한 줄 — 어떤 품번을 몇 장 개설할지 기재
type CreateLCLineRequest struct {
	POLineID       *string  `json:"po_line_id,omitempty"`
	ProductID      string   `json:"product_id"`
	Quantity       int      `json:"quantity"`
	CapacityKW     float64  `json:"capacity_kw"`
	AmountUSD      *float64 `json:"amount_usd"`
	UnitPriceUSDWp *float64 `json:"unit_price_usd_wp"`
	ItemType       string   `json:"item_type"`
	PaymentType    string   `json:"payment_type"`
	Memo           *string  `json:"memo"`
}

// Validate — LC 라인아이템 입력값 검증
// 비유: 품목 명세표에서 품번, 수량, 용량이 빠졌는지 확인
func (req *CreateLCLineRequest) Validate() string {
	if req.ProductID == "" {
		return "LC 품목의 product_id는 필수 항목입니다"
	}
	if req.Quantity <= 0 {
		return "LC 품목 수량은 양수여야 합니다"
	}
	if req.CapacityKW <= 0 {
		return "LC 품목 용량은 양수여야 합니다"
	}
	if req.ItemType == "" {
		req.ItemType = "main"
	}
	if !validItemTypes[req.ItemType] {
		return "LC 품목 item_type은 \"main\", \"spare\" 중 하나여야 합니다"
	}
	if req.PaymentType == "" {
		req.PaymentType = "paid"
	}
	if !validPaymentTypes[req.PaymentType] {
		return "LC 품목 payment_type은 \"paid\", \"free\" 중 하나여야 합니다"
	}
	if req.POLineID != nil && *req.POLineID != "" && !uuidRe.MatchString(*req.POLineID) {
		return "LC 품목 po_line_id는 UUID 형식이어야 합니다"
	}
	if req.AmountUSD != nil && *req.AmountUSD < 0 {
		return "LC 품목 금액은 0 이상이어야 합니다"
	}
	if req.UnitPriceUSDWp != nil && *req.UnitPriceUSDWp <= 0 {
		return "LC 품목 단가는 양수여야 합니다"
	}
	return ""
}

// LCLineInsert — lc_line_items INSERT payload
// 비유: DB 보관용 LC 품목 명세표
type LCLineInsert struct {
	LCID           string   `json:"lc_id"`
	POLineID       *string  `json:"po_line_id,omitempty"`
	ProductID      string   `json:"product_id"`
	Quantity       int      `json:"quantity"`
	CapacityKW     float64  `json:"capacity_kw"`
	AmountUSD      *float64 `json:"amount_usd,omitempty"`
	UnitPriceUSDWp *float64 `json:"unit_price_usd_wp,omitempty"`
	ItemType       string   `json:"item_type"`
	PaymentType    string   `json:"payment_type"`
	Memo           *string  `json:"memo,omitempty"`
}
