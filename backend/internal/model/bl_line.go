package model

import "regexp"

// UUID v4/일반 UUID 형식 검증 (소문자/대문자 허용)
var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// BLLineItem — B/L 라인아이템(화물 명세) 구조체
// 비유: "화물 명세서" — 선적 서류에 붙는 개별 품목(규격, 수량, 단가, 용도) 정보
type BLLineItem struct {
	BLLineID        string   `json:"bl_line_id"`
	BLID            string   `json:"bl_id"`
	ProductID       string   `json:"product_id"`
	POLineID        *string  `json:"po_line_id,omitempty" db:"po_line_id"` // D-087: PO 발주품목과 연결 (nullable)
	Quantity        int      `json:"quantity"`
	CapacityKW      float64  `json:"capacity_kw"`
	ItemType        string   `json:"item_type"`
	PaymentType     string   `json:"payment_type"`
	InvoiceAmountUSD *float64 `json:"invoice_amount_usd"`
	UnitPriceUSDWp  *float64 `json:"unit_price_usd_wp"`
	UnitPriceKRWWp  *float64 `json:"unit_price_krw_wp"`
	UsageCategory   string   `json:"usage_category"`
	Memo            *string  `json:"memo"`
}

// BLLineWithProduct — 품번 정보를 포함한 B/L 라인아이템 조회 결과
// 비유: 화물 명세서에 품번 카탈로그 카드가 함께 붙어 있는 것
type BLLineWithProduct struct {
	BLLineItem
	Products *ProductSummaryForBLLine `json:"products"`
}

// ProductSummaryForBLLine — B/L 라인아이템 조회 시 품번 요약 정보
type ProductSummaryForBLLine struct {
	ProductCode    string `json:"product_code"`
	ProductName    string `json:"product_name"`
	SpecWP         int    `json:"spec_wp"`
	ModuleWidthMM  int    `json:"module_width_mm"`
	ModuleHeightMM int    `json:"module_height_mm"`
}

// 허용되는 item_type 값
var validItemTypes = map[string]bool{
	"main":  true,
	"spare": true,
}

// 허용되는 payment_type 값
var validPaymentTypes = map[string]bool{
	"paid": true,
	"free": true,
}

// 허용되는 usage_category 값
var validUsageCategories = map[string]bool{
	"sale":         true,
	"construction": true,
	"spare":        true,
	"replacement":  true,
	"repowering":   true,
	"transfer":     true,
	"adjustment":   true,
	"maintenance":  true,
	"disposal":     true,
	"other":        true,
}

// CreateBLLineRequest — B/L 라인아이템 등록 시 클라이언트가 보내는 데이터
// 비유: "화물 품목 추가 신청서" — 어떤 B/L에, 어떤 품번을, 몇 장, 어떤 용도로 넣을지 기재
type CreateBLLineRequest struct {
	BLID             string   `json:"bl_id"`
	ProductID        string   `json:"product_id"`
	POLineID         *string  `json:"po_line_id,omitempty"` // D-087: PO 발주품목 연결 (nullable)
	Quantity         int      `json:"quantity"`
	CapacityKW       float64  `json:"capacity_kw"`
	ItemType         string   `json:"item_type"`
	PaymentType      string   `json:"payment_type"`
	InvoiceAmountUSD *float64 `json:"invoice_amount_usd"`
	UnitPriceUSDWp   *float64 `json:"unit_price_usd_wp"`
	UnitPriceKRWWp   *float64 `json:"unit_price_krw_wp"`
	UsageCategory    string   `json:"usage_category"`
	Memo             *string  `json:"memo"`
}

// Validate — B/L 라인아이템 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 화물 품목 필수 항목, 허용 값 확인
func (req *CreateBLLineRequest) Validate() string {
	if req.BLID == "" {
		return "bl_id는 필수 항목입니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.CapacityKW <= 0 {
		return "capacity_kw는 양수여야 합니다"
	}
	if req.ItemType == "" {
		return "item_type은 필수 항목입니다"
	}
	if !validItemTypes[req.ItemType] {
		return "item_type은 \"main\", \"spare\" 중 하나여야 합니다"
	}
	if req.PaymentType == "" {
		return "payment_type은 필수 항목입니다"
	}
	if !validPaymentTypes[req.PaymentType] {
		return "payment_type은 \"paid\", \"free\" 중 하나여야 합니다"
	}
	if req.UsageCategory == "" {
		return "usage_category는 필수 항목입니다"
	}
	if !validUsageCategories[req.UsageCategory] {
		return "usage_category는 \"sale\", \"construction\", \"spare\", \"replacement\", \"repowering\", \"transfer\", \"adjustment\" 중 하나여야 합니다"
	}
	if req.InvoiceAmountUSD != nil && *req.InvoiceAmountUSD <= 0 {
		return "invoice_amount_usd는 양수여야 합니다"
	}
	if req.UnitPriceUSDWp != nil && *req.UnitPriceUSDWp <= 0 {
		return "unit_price_usd_wp는 양수여야 합니다"
	}
	if req.UnitPriceKRWWp != nil && *req.UnitPriceKRWWp <= 0 {
		return "unit_price_krw_wp는 양수여야 합니다"
	}
	if req.POLineID != nil && *req.POLineID != "" && !uuidRe.MatchString(*req.POLineID) {
		return "po_line_id는 UUID 형식이어야 합니다"
	}
	return ""
}

// UpdateBLLineRequest — B/L 라인아이템 수정 시 클라이언트가 보내는 데이터
// 비유: "화물 품목 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateBLLineRequest struct {
	ProductID        *string  `json:"product_id,omitempty"`
	POLineID         *string  `json:"po_line_id,omitempty"` // D-087
	Quantity         *int     `json:"quantity,omitempty"`
	CapacityKW       *float64 `json:"capacity_kw,omitempty"`
	ItemType         *string  `json:"item_type,omitempty"`
	PaymentType      *string  `json:"payment_type,omitempty"`
	InvoiceAmountUSD *float64 `json:"invoice_amount_usd,omitempty"`
	UnitPriceUSDWp   *float64 `json:"unit_price_usd_wp,omitempty"`
	UnitPriceKRWWp   *float64 `json:"unit_price_krw_wp,omitempty"`
	UsageCategory    *string  `json:"usage_category,omitempty"`
	Memo             *string  `json:"memo,omitempty"`
}

// Validate — B/L 라인아이템 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateBLLineRequest) Validate() string {
	if req.ProductID != nil && *req.ProductID == "" {
		return "product_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.CapacityKW != nil && *req.CapacityKW <= 0 {
		return "capacity_kw는 양수여야 합니다"
	}
	if req.ItemType != nil && !validItemTypes[*req.ItemType] {
		return "item_type은 \"main\", \"spare\" 중 하나여야 합니다"
	}
	if req.PaymentType != nil && !validPaymentTypes[*req.PaymentType] {
		return "payment_type은 \"paid\", \"free\" 중 하나여야 합니다"
	}
	if req.UsageCategory != nil && !validUsageCategories[*req.UsageCategory] {
		return "usage_category는 \"sale\", \"construction\", \"spare\", \"replacement\", \"repowering\", \"transfer\", \"adjustment\" 중 하나여야 합니다"
	}
	if req.InvoiceAmountUSD != nil && *req.InvoiceAmountUSD <= 0 {
		return "invoice_amount_usd는 양수여야 합니다"
	}
	if req.UnitPriceUSDWp != nil && *req.UnitPriceUSDWp <= 0 {
		return "unit_price_usd_wp는 양수여야 합니다"
	}
	if req.UnitPriceKRWWp != nil && *req.UnitPriceKRWWp <= 0 {
		return "unit_price_krw_wp는 양수여야 합니다"
	}
	if req.POLineID != nil && *req.POLineID != "" && !uuidRe.MatchString(*req.POLineID) {
		return "po_line_id는 UUID 형식이어야 합니다"
	}
	return ""
}
