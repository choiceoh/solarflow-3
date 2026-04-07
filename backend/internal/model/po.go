package model

// PurchaseOrder — 발주/계약 정보를 담는 구조체
// 비유: "발주 계약서" — 어느 법인이, 어느 제조사에, 어떤 조건으로 계약했는지 기록
type PurchaseOrder struct {
	POID                string   `json:"po_id"`
	PONumber            *string  `json:"po_number"`
	CompanyID           string   `json:"company_id"`
	ManufacturerID      string   `json:"manufacturer_id"`
	ContractType        string   `json:"contract_type"`
	ContractDate        *string  `json:"contract_date"`
	Incoterms           *string  `json:"incoterms"`
	PaymentTerms        *string  `json:"payment_terms"`
	TotalQty            *int     `json:"total_qty"`
	TotalMW             *float64 `json:"total_mw"`
	ContractPeriodStart *string  `json:"contract_period_start"`
	ContractPeriodEnd   *string  `json:"contract_period_end"`
	Status              string   `json:"status"`
	Memo                *string  `json:"memo"`
}

// POWithRelations — 법인/제조사 정보를 포함한 발주 조회 결과
// 비유: 계약서에 법인 도장과 제조사 명함이 함께 붙어 있는 것
type POWithRelations struct {
	PurchaseOrder
	Companies     *CompanySummary      `json:"companies"`
	Manufacturers *ManufacturerSummary `json:"manufacturers"`
}

// PODetail — PO 상세 조회 시 라인아이템, LC, TT를 포함한 전체 결과
// 비유: 계약서 + 품목 명세 + LC 서류 + TT 송금 내역을 한 번에 보여주는 것
// TODO: Rust 계산엔진 연동 — PO 입고현황 집계 (계약량 vs LC개설 vs 선적 vs 입고)
type PODetail struct {
	POWithRelations
	LineItems     []POLineWithProduct `json:"line_items"`
	LCRecords     []LCRecordSummary   `json:"lc_records"`
	TTRemittances []TTSummary         `json:"tt_remittances"`
}

// LCRecordSummary — PO 상세에서 LC 요약 정보를 담는 구조체
// 비유: 계약서 안에 첨부된 LC 개설 내역 요약
type LCRecordSummary struct {
	LCID        string   `json:"lc_id"`
	LCNumber    *string  `json:"lc_number"`
	POID        string   `json:"po_id"`
	BankID      *string  `json:"bank_id"`
	AmountUSD   *float64 `json:"amount_usd"`
	IssuedDate  *string  `json:"issued_date"`
	ExpiryDate  *string  `json:"expiry_date"`
	Status      *string  `json:"status"`
	Banks       *BankSummaryForLC `json:"banks"`
}

// BankSummaryForLC — LC 조회 시 은행 이름만 포함
type BankSummaryForLC struct {
	BankName string `json:"bank_name"`
}

// TTSummary — PO 상세에서 TT 송금 요약 정보를 담는 구조체
// 비유: 계약서 안에 첨부된 TT 송금 내역 요약
type TTSummary struct {
	TTID          string   `json:"tt_id"`
	POID          string   `json:"po_id"`
	RemitDate     *string  `json:"remit_date"`
	AmountUSD     *float64 `json:"amount_usd"`
	Purpose       *string  `json:"purpose"`
	Status        *string  `json:"status"`
}

// 허용되는 contract_type 값 (D-086: 재정의)
// spot/annual_frame/half_year_frame — 독점은 별도 exclusive 플래그로 분리
// general/exclusive/annual은 레거시 호환용으로 유지
var validContractTypes = map[string]bool{
	"spot":            true,
	"annual_frame":    true,
	"half_year_frame": true,
	"general":         true, // legacy
	"exclusive":       true, // legacy
	"annual":          true, // legacy
}

// 허용되는 status 값
var validPOStatuses = map[string]bool{
	"draft":      true,
	"contracted": true,
	"shipping":   true,
	"completed":  true,
}

// CreatePurchaseOrderRequest — 발주 등록 시 클라이언트가 보내는 데이터
// 비유: "발주 계약 신청서" — 법인, 제조사, 계약 유형을 필수 기재
type CreatePurchaseOrderRequest struct {
	PONumber            *string  `json:"po_number"`
	CompanyID           string   `json:"company_id"`
	ManufacturerID      string   `json:"manufacturer_id"`
	ContractType        string   `json:"contract_type"`
	ContractDate        *string  `json:"contract_date"`
	Incoterms           *string  `json:"incoterms"`
	PaymentTerms        *string  `json:"payment_terms"`
	TotalQty            *int     `json:"total_qty"`
	TotalMW             *float64 `json:"total_mw"`
	ContractPeriodStart *string  `json:"contract_period_start"`
	ContractPeriodEnd   *string  `json:"contract_period_end"`
	Status              string   `json:"status"`
	Memo                *string  `json:"memo"`
}

// Validate — 발주 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 계약서 필수 항목, 허용 값 확인
func (req *CreatePurchaseOrderRequest) Validate() string {
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.ManufacturerID == "" {
		return "manufacturer_id는 필수 항목입니다"
	}
	if req.ContractType == "" {
		return "contract_type은 필수 항목입니다"
	}
	if !validContractTypes[req.ContractType] {
		return "contract_type은 \"spot\", \"annual_frame\", \"half_year_frame\" 중 하나여야 합니다"
	}
	if req.CompanyID == "all" {
		return "company_id가 'all'일 수 없습니다 — 단일 법인을 선택해주세요"
	}
	if req.Status == "" {
		return "status는 필수 항목입니다"
	}
	if !validPOStatuses[req.Status] {
		return "status는 \"draft\", \"contracted\", \"shipping\", \"completed\" 중 하나여야 합니다"
	}
	if req.TotalQty != nil && *req.TotalQty <= 0 {
		return "total_qty는 양수여야 합니다"
	}
	if req.TotalMW != nil && *req.TotalMW <= 0 {
		return "total_mw는 양수여야 합니다"
	}
	return ""
}

// UpdatePurchaseOrderRequest — 발주 수정 시 클라이언트가 보내는 데이터
// 비유: "발주 계약 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdatePurchaseOrderRequest struct {
	PONumber            *string  `json:"po_number,omitempty"`
	CompanyID           *string  `json:"company_id,omitempty"`
	ManufacturerID      *string  `json:"manufacturer_id,omitempty"`
	ContractType        *string  `json:"contract_type,omitempty"`
	ContractDate        *string  `json:"contract_date,omitempty"`
	Incoterms           *string  `json:"incoterms,omitempty"`
	PaymentTerms        *string  `json:"payment_terms,omitempty"`
	TotalQty            *int     `json:"total_qty,omitempty"`
	TotalMW             *float64 `json:"total_mw,omitempty"`
	ContractPeriodStart *string  `json:"contract_period_start,omitempty"`
	ContractPeriodEnd   *string  `json:"contract_period_end,omitempty"`
	Status              *string  `json:"status,omitempty"`
	Memo                *string  `json:"memo,omitempty"`
}

// Validate — 발주 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdatePurchaseOrderRequest) Validate() string {
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.ManufacturerID != nil && *req.ManufacturerID == "" {
		return "manufacturer_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.ContractType != nil {
		if !validContractTypes[*req.ContractType] {
			return "contract_type은 \"general\", \"exclusive\", \"annual\", \"spot\" 중 하나여야 합니다"
		}
	}
	if req.Status != nil {
		if !validPOStatuses[*req.Status] {
			return "status는 \"draft\", \"contracted\", \"shipping\", \"completed\" 중 하나여야 합니다"
		}
	}
	if req.TotalQty != nil && *req.TotalQty <= 0 {
		return "total_qty는 양수여야 합니다"
	}
	if req.TotalMW != nil && *req.TotalMW <= 0 {
		return "total_mw는 양수여야 합니다"
	}
	return ""
}
