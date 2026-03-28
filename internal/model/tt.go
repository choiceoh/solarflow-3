package model

import "unicode/utf8"

// TTRemittance — TT(전신송금) 정보를 담는 구조체
// 비유: "TT 송금 전표" — 언제, 얼마를, 어떤 목적으로 송금했는지 기록
type TTRemittance struct {
	TTID         string   `json:"tt_id"`
	POID         string   `json:"po_id"`
	RemitDate    *string  `json:"remit_date"`
	AmountUSD    float64  `json:"amount_usd"`
	AmountKRW    *float64 `json:"amount_krw"`
	ExchangeRate *float64 `json:"exchange_rate"`
	Purpose      *string  `json:"purpose"`
	Status       string   `json:"status"`
	BankName     *string  `json:"bank_name"`
	Memo         *string  `json:"memo"`
}

// TTWithRelations — PO 정보를 포함한 TT 목록 조회 결과
// 비유: 송금 전표에 PO 계약서 번호와 제조사가 함께 표시되는 것
type TTWithRelations struct {
	TTRemittance
	PurchaseOrders *TTPOSummary `json:"purchase_orders"`
}

// TTPOSummary — TT 조회 시 PO 요약 정보 (제조사 포함)
type TTPOSummary struct {
	PONumber      *string              `json:"po_number"`
	Manufacturers *TTManufacturerSummary `json:"manufacturers"`
}

// TTManufacturerSummary — TT 조회 시 제조사 이름만 포함
type TTManufacturerSummary struct {
	NameKR string `json:"name_kr"`
}

// 허용되는 TT status 값
var validTTStatuses = map[string]bool{
	"planned":   true,
	"completed": true,
}

// CreateTTRequest — TT 등록 시 클라이언트가 보내는 데이터
// 비유: "TT 송금 신청서" — PO, 송금액, 상태를 필수 기재
type CreateTTRequest struct {
	POID         string   `json:"po_id"`
	RemitDate    *string  `json:"remit_date"`
	AmountUSD    float64  `json:"amount_usd"`
	AmountKRW    *float64 `json:"amount_krw"`
	ExchangeRate *float64 `json:"exchange_rate"`
	Purpose      *string  `json:"purpose"`
	Status       string   `json:"status"`
	BankName     *string  `json:"bank_name"`
	Memo         *string  `json:"memo"`
}

// Validate — TT 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 송금 신청서 필수 항목 확인
func (req *CreateTTRequest) Validate() string {
	if req.POID == "" {
		return "po_id는 필수 항목입니다"
	}
	if req.AmountUSD <= 0 {
		return "amount_usd는 양수여야 합니다"
	}
	if req.Status == "" {
		return "status는 필수 항목입니다"
	}
	if !validTTStatuses[req.Status] {
		return "status는 \"planned\", \"completed\" 중 하나여야 합니다"
	}
	if req.AmountKRW != nil && *req.AmountKRW <= 0 {
		return "amount_krw는 양수여야 합니다"
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	if req.Purpose != nil && utf8.RuneCountInString(*req.Purpose) > 50 {
		return "purpose는 50자를 초과할 수 없습니다"
	}
	if req.BankName != nil && utf8.RuneCountInString(*req.BankName) > 50 {
		return "bank_name은 50자를 초과할 수 없습니다"
	}
	return ""
}

// UpdateTTRequest — TT 수정 시 클라이언트가 보내는 데이터
// 비유: "TT 송금 정보 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateTTRequest struct {
	RemitDate    *string  `json:"remit_date"`
	AmountUSD    *float64 `json:"amount_usd"`
	AmountKRW    *float64 `json:"amount_krw"`
	ExchangeRate *float64 `json:"exchange_rate"`
	Purpose      *string  `json:"purpose"`
	Status       *string  `json:"status"`
	BankName     *string  `json:"bank_name"`
	Memo         *string  `json:"memo"`
}

// Validate — TT 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateTTRequest) Validate() string {
	if req.AmountUSD != nil && *req.AmountUSD <= 0 {
		return "amount_usd는 양수여야 합니다"
	}
	if req.Status != nil && !validTTStatuses[*req.Status] {
		return "status는 \"planned\", \"completed\" 중 하나여야 합니다"
	}
	if req.AmountKRW != nil && *req.AmountKRW <= 0 {
		return "amount_krw는 양수여야 합니다"
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	if req.Purpose != nil && utf8.RuneCountInString(*req.Purpose) > 50 {
		return "purpose는 50자를 초과할 수 없습니다"
	}
	if req.BankName != nil && utf8.RuneCountInString(*req.BankName) > 50 {
		return "bank_name은 50자를 초과할 수 없습니다"
	}
	return ""
}
