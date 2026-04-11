package model

import "unicode/utf8"

// PriceHistory — 단가이력 정보를 담는 구조체
// 비유: "단가 변동 기록부" — 제품별 단가가 언제, 왜, 얼마나 바뀌었는지 기록
type PriceHistory struct {
	PriceHistoryID  string   `json:"price_history_id"`
	ProductID       string   `json:"product_id"`
	ManufacturerID  string   `json:"manufacturer_id"`
	CompanyID       string   `json:"company_id"`
	ChangeDate      string   `json:"change_date"`
	PreviousPrice   *float64 `json:"previous_price"`
	NewPrice        float64  `json:"new_price"`
	Reason          *string  `json:"reason"`
	RelatedPOID     *string  `json:"related_po_id"`
	Memo            *string  `json:"memo"`
}

// PriceHistoryWithRelations — 제조사·제품·PO 정보를 포함한 단가이력 조회 결과
type PriceHistoryWithRelations struct {
	PriceHistory
	Manufacturers  *PHManufacturerSummary `json:"manufacturers"`
	Products       *PHProductSummary      `json:"products"`
	PurchaseOrders *PHPOSummary           `json:"purchase_orders"`
}

// PHManufacturerSummary — 단가이력 조회 시 제조사 요약
type PHManufacturerSummary struct {
	NameKR string `json:"name_kr"`
}

// PHProductSummary — 단가이력 조회 시 제품 요약
type PHProductSummary struct {
	ProductCode string `json:"product_code"`
	ProductName string `json:"product_name"`
	SpecWP      *int   `json:"spec_wp"`
}

// PHPOSummary — 단가이력 조회 시 PO 요약
type PHPOSummary struct {
	PONumber *string `json:"po_number"`
}

// CreatePriceHistoryRequest — 단가이력 등록 시 클라이언트가 보내는 데이터
// 비유: "단가 변동 등록 신청서" — 제품, 변경일, 신규단가를 필수 기재
type CreatePriceHistoryRequest struct {
	ProductID       string   `json:"product_id"`
	ManufacturerID  string   `json:"manufacturer_id"`
	CompanyID       string   `json:"company_id"`
	ChangeDate      string   `json:"change_date"`
	PreviousPrice   *float64 `json:"previous_price"`
	NewPrice        float64  `json:"new_price"`
	Reason          *string  `json:"reason"`
	RelatedPOID     *string  `json:"related_po_id"`
	Memo            *string  `json:"memo"`
}

// Validate — 단가이력 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 단가 변동 신청서 필수 항목 확인
func (req *CreatePriceHistoryRequest) Validate() string {
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.ManufacturerID == "" {
		return "manufacturer_id는 필수 항목입니다"
	}
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.ChangeDate == "" {
		return "change_date는 필수 항목입니다"
	}
	if req.NewPrice <= 0 {
		return "new_price는 양수여야 합니다"
	}
	if req.Reason != nil && utf8.RuneCountInString(*req.Reason) > 200 {
		return "reason은 200자를 초과할 수 없습니다"
	}
	return ""
}

// UpdatePriceHistoryRequest — 단가이력 수정 시 클라이언트가 보내는 데이터
// 비유: "단가 변동 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdatePriceHistoryRequest struct {
	ProductID       *string  `json:"product_id,omitempty"`
	ManufacturerID  *string  `json:"manufacturer_id,omitempty"`
	CompanyID       *string  `json:"company_id,omitempty"`
	ChangeDate      *string  `json:"change_date,omitempty"`
	PreviousPrice   *float64 `json:"previous_price,omitempty"`
	NewPrice        *float64 `json:"new_price,omitempty"`
	Reason          *string  `json:"reason,omitempty"`
	RelatedPOID     *string  `json:"related_po_id,omitempty"`
	Memo            *string  `json:"memo,omitempty"`
}

// Validate — 단가이력 수정 요청의 입력값을 검증
func (req *UpdatePriceHistoryRequest) Validate() string {
	if req.ProductID != nil && *req.ProductID == "" {
		return "product_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.ManufacturerID != nil && *req.ManufacturerID == "" {
		return "manufacturer_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.ChangeDate != nil && *req.ChangeDate == "" {
		return "change_date는 빈 값으로 변경할 수 없습니다"
	}
	if req.NewPrice != nil && *req.NewPrice <= 0 {
		return "new_price는 양수여야 합니다"
	}
	if req.Reason != nil && utf8.RuneCountInString(*req.Reason) > 200 {
		return "reason은 200자를 초과할 수 없습니다"
	}
	return ""
}
