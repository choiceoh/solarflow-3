package model

import "unicode/utf8"

// LCRecord — LC(신용장) 정보를 담는 구조체
// 비유: "LC 개설 서류" — 어느 은행에서, 얼마에, 언제 개설했는지 기록
type LCRecord struct {
	LCID           string   `json:"lc_id"`
	POID           string   `json:"po_id"`
	LCNumber       *string  `json:"lc_number"`
	BankID         string   `json:"bank_id"`
	CompanyID      string   `json:"company_id"`
	OpenDate       *string  `json:"open_date"`
	AmountUSD      float64  `json:"amount_usd"`
	TargetQty      *int     `json:"target_qty"`
	TargetMW       *float64 `json:"target_mw"`
	UsanceDays     *int     `json:"usance_days"`
	UsanceType     *string  `json:"usance_type"`
	MaturityDate   *string  `json:"maturity_date"`
	SettlementDate *string  `json:"settlement_date"`
	RepaymentDate  *string  `json:"repayment_date"`
	Repaid         bool     `json:"repaid"`
	Status         string   `json:"status"`
	Memo           *string  `json:"memo"`
}

// LCWithRelations — 은행/법인/PO 정보를 포함한 LC 목록 조회 결과
// 비유: LC 서류에 은행 명함, 법인 도장, PO번호가 함께 붙어 있는 것
type LCWithRelations struct {
	LCRecord
	Banks          *LCBankSummary    `json:"banks"`
	Companies      *CompanySummary   `json:"companies"`
	PurchaseOrders *LCPOSummary      `json:"purchase_orders"`
}

// LCBankSummary — LC 목록 조회 시 은행 요약 정보
type LCBankSummary struct {
	BankName string `json:"bank_name"`
}

// LCPOSummary — LC 조회 시 PO 요약 정보
type LCPOSummary struct {
	PONumber       *string `json:"po_number"`
	ManufacturerID *string `json:"manufacturer_id"`
}

// LCDetail — LC 상세 조회 시 은행 상세 정보를 포함한 결과
// 비유: LC 서류를 펼쳐서 은행 한도, 수수료율까지 모두 보여주는 것
type LCDetail struct {
	LCRecord
	Banks          *LCBankDetail     `json:"banks"`
	Companies      *CompanySummary   `json:"companies"`
	PurchaseOrders *LCPOSummary      `json:"purchase_orders"`
}

// LCBankDetail — LC 상세 조회 시 은행 상세 정보 (수수료율 포함)
type LCBankDetail struct {
	BankName          string   `json:"bank_name"`
	LCLimitUSD        *float64 `json:"lc_limit_usd"`
	OpeningFeeRate    *float64 `json:"opening_fee_rate"`
	AcceptanceFeeRate *float64 `json:"acceptance_fee_rate"`
}

// 허용되는 LC status 값
var validLCStatuses = map[string]bool{
	"pending":       true,
	"opened":        true,
	"docs_received": true,
	"settled":       true,
}

// 허용되는 usance_type 값
var validUsanceTypes = map[string]bool{
	"buyers":   true,
	"shippers": true,
}

// CreateLCRequest — LC 등록 시 클라이언트가 보내는 데이터
// 비유: "LC 개설 신청서" — PO, 은행, 법인, 개설금액을 필수 기재
type CreateLCRequest struct {
	POID           string   `json:"po_id"`
	LCNumber       *string  `json:"lc_number"`
	BankID         string   `json:"bank_id"`
	CompanyID      string   `json:"company_id"`
	OpenDate       *string  `json:"open_date"`
	AmountUSD      float64  `json:"amount_usd"`
	TargetQty      *int     `json:"target_qty"`
	TargetMW       *float64 `json:"target_mw"`
	UsanceDays     *int     `json:"usance_days"`
	UsanceType     *string  `json:"usance_type"`
	MaturityDate   *string  `json:"maturity_date"`
	SettlementDate *string  `json:"settlement_date"`
	RepaymentDate  *string  `json:"repayment_date"`
	Repaid         bool     `json:"repaid"`
	Status         string   `json:"status"`
	Memo           *string  `json:"memo"`
}

// Validate — LC 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 LC 신청서 필수 항목, 허용 값 확인
func (req *CreateLCRequest) Validate() string {
	if req.POID == "" {
		return "po_id는 필수 항목입니다"
	}
	if req.BankID == "" {
		return "bank_id는 필수 항목입니다"
	}
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.AmountUSD <= 0 {
		return "amount_usd는 양수여야 합니다"
	}
	if req.Status == "" {
		return "status는 필수 항목입니다"
	}
	if !validLCStatuses[req.Status] {
		return "status는 \"pending\", \"opened\", \"docs_received\", \"settled\" 중 하나여야 합니다"
	}
	if req.UsanceType != nil && !validUsanceTypes[*req.UsanceType] {
		return "usance_type은 \"buyers\", \"shippers\" 중 하나여야 합니다"
	}
	if req.TargetQty != nil && *req.TargetQty <= 0 {
		return "target_qty는 양수여야 합니다"
	}
	if req.TargetMW != nil && *req.TargetMW <= 0 {
		return "target_mw는 양수여야 합니다"
	}
	if req.LCNumber != nil && utf8.RuneCountInString(*req.LCNumber) > 30 {
		return "lc_number는 30자를 초과할 수 없습니다"
	}
	return ""
}

// UpdateLCRequest — LC 수정 시 클라이언트가 보내는 데이터
// 비유: "LC 정보 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateLCRequest struct {
	LCNumber       *string  `json:"lc_number,omitempty"`
	BankID         *string  `json:"bank_id,omitempty"`
	CompanyID      *string  `json:"company_id,omitempty"`
	OpenDate       *string  `json:"open_date,omitempty"`
	AmountUSD      *float64 `json:"amount_usd,omitempty"`
	TargetQty      *int     `json:"target_qty,omitempty"`
	TargetMW       *float64 `json:"target_mw,omitempty"`
	UsanceDays     *int     `json:"usance_days,omitempty"`
	UsanceType     *string  `json:"usance_type,omitempty"`
	MaturityDate   *string  `json:"maturity_date,omitempty"`
	SettlementDate *string  `json:"settlement_date,omitempty"`
	RepaymentDate  *string  `json:"repayment_date,omitempty"`
	Repaid         *bool    `json:"repaid,omitempty"`
	Status         *string  `json:"status,omitempty"`
	Memo           *string  `json:"memo,omitempty"`
}

// Validate — LC 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateLCRequest) Validate() string {
	if req.BankID != nil && *req.BankID == "" {
		return "bank_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.AmountUSD != nil && *req.AmountUSD <= 0 {
		return "amount_usd는 양수여야 합니다"
	}
	if req.Status != nil && !validLCStatuses[*req.Status] {
		return "status는 \"pending\", \"opened\", \"docs_received\", \"settled\" 중 하나여야 합니다"
	}
	if req.UsanceType != nil && !validUsanceTypes[*req.UsanceType] {
		return "usance_type은 \"buyers\", \"shippers\" 중 하나여야 합니다"
	}
	if req.TargetQty != nil && *req.TargetQty <= 0 {
		return "target_qty는 양수여야 합니다"
	}
	if req.TargetMW != nil && *req.TargetMW <= 0 {
		return "target_mw는 양수여야 합니다"
	}
	if req.LCNumber != nil && utf8.RuneCountInString(*req.LCNumber) > 30 {
		return "lc_number는 30자를 초과할 수 없습니다"
	}
	return ""
}
