package model

// POLineItem — 발주 라인아이템(품목 명세) 구조체
// 비유: "발주 품목 명세서" — 계약서에 붙는 개별 품목(규격, 수량, 단가) 정보
type POLineItem struct {
	POLineID      string   `json:"po_line_id"`
	POID          string   `json:"po_id"`
	ProductID     string   `json:"product_id"`
	Quantity      int      `json:"quantity"`
	UnitPriceUSD  *float64 `json:"unit_price_usd"`
	UnitPriceUSDWp *float64 `json:"unit_price_usd_wp,omitempty"` // D-087: PO 자동채움용 ($/Wp)
	TotalAmountUSD *float64 `json:"total_amount_usd"`
	ItemType      *string  `json:"item_type,omitempty"`    // D-087: 본품/스페어 (선택)
	PaymentType   *string  `json:"payment_type,omitempty"` // D-087: 유상/무상 (선택)
	Memo          *string  `json:"memo"`
}

// POLineWithProduct — 품번 정보를 포함한 라인아이템 조회 결과
// 비유: 품목 명세서에 품번 카탈로그 카드가 함께 붙어 있는 것
type POLineWithProduct struct {
	POLineItem
	Products *ProductSummaryForPOLine `json:"products"`
}

// ProductSummaryForPOLine — 라인아이템 조회 시 함께 반환되는 품번 요약 정보
type ProductSummaryForPOLine struct {
	ProductCode   string `json:"product_code"`
	ProductName   string `json:"product_name"`
	SpecWP        int    `json:"spec_wp"`
	ModuleWidthMM int    `json:"module_width_mm"`
	ModuleHeightMM int   `json:"module_height_mm"`
}

// CreatePOLineRequest — 라인아이템 등록 시 클라이언트가 보내는 데이터
// 비유: "품목 추가 신청서" — 어떤 PO에, 어떤 품번을, 몇 장 넣을지 기재
type CreatePOLineRequest struct {
	POID          string   `json:"po_id"`
	ProductID     string   `json:"product_id"`
	Quantity      int      `json:"quantity"`
	UnitPriceUSD  *float64 `json:"unit_price_usd"`
	TotalAmountUSD *float64 `json:"total_amount_usd"`
	ItemType      *string  `json:"item_type,omitempty"`    // "main" | "spare"
	PaymentType   *string  `json:"payment_type,omitempty"` // "paid" | "free"
	Memo          *string  `json:"memo"`
}

// Validate — 라인아이템 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 품번, 수량 필수 여부 확인
func (req *CreatePOLineRequest) Validate() string {
	if req.POID == "" {
		return "po_id는 필수 항목입니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	return ""
}

// UpdatePOLineRequest — 라인아이템 수정 시 클라이언트가 보내는 데이터
// 비유: "품목 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdatePOLineRequest struct {
	ProductID      *string  `json:"product_id,omitempty"`
	Quantity       *int     `json:"quantity,omitempty"`
	UnitPriceUSD   *float64 `json:"unit_price_usd,omitempty"`
	TotalAmountUSD *float64 `json:"total_amount_usd,omitempty"`
	ItemType       *string  `json:"item_type,omitempty"`
	PaymentType    *string  `json:"payment_type,omitempty"`
	Memo           *string  `json:"memo,omitempty"`
}

// Validate — 라인아이템 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdatePOLineRequest) Validate() string {
	if req.ProductID != nil && *req.ProductID == "" {
		return "product_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	return ""
}
