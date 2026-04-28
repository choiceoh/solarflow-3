package model

// PurchaseOrder — 발주/계약 정보를 담는 구조체
// 비유: "발주 계약서" — 어느 법인이, 어느 제조사에, 어떤 조건으로 계약했는지 기록
type PurchaseOrder struct {
	POID                string   `json:"po_id"`
	PONumber            *string  `json:"po_number"`
	CompanyID           string   `json:"company_id"`
	ManufacturerID      string   `json:"manufacturer_id"`
	ManufacturerName    *string  `json:"manufacturer_name,omitempty"` // purchase_orders_ext 뷰에서 제공
	ManufacturerNameEN  *string  `json:"manufacturer_name_en,omitempty"`
	FirstSpecWp         *int     `json:"first_spec_wp,omitempty"` // 첫 번째 유상 라인 spec_wp (드롭다운 표시용)
	Currency            *string  `json:"currency,omitempty"`      // D-087: PO 자동채움용 (DB에 없으면 빈 값)
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
	ParentPOID          *string  `json:"parent_po_id,omitempty"`
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
// PO 입고현황은 D-061 패턴에 따라 프론트에서 소규모 합산한다.
type PODetail struct {
	POWithRelations
	LineItems     []POLineWithProduct `json:"line_items"`
	LCRecords     []LCRecordSummary   `json:"lc_records"`
	TTRemittances []TTSummary         `json:"tt_remittances"`
}

// LCRecordSummary — PO 상세에서 LC 요약 정보를 담는 구조체
// 비유: 계약서 안에 첨부된 LC 개설 내역 요약
type LCRecordSummary struct {
	LCID       string            `json:"lc_id"`
	LCNumber   *string           `json:"lc_number"`
	POID       string            `json:"po_id"`
	BankID     *string           `json:"bank_id"`
	AmountUSD  *float64          `json:"amount_usd"`
	IssuedDate *string           `json:"issued_date"`
	ExpiryDate *string           `json:"expiry_date"`
	Status     *string           `json:"status"`
	Banks      *BankSummaryForLC `json:"banks"`
}

// BankSummaryForLC — LC 조회 시 은행 이름만 포함
type BankSummaryForLC struct {
	BankName string `json:"bank_name"`
}

// TTSummary — PO 상세에서 TT 송금 요약 정보를 담는 구조체
// 비유: 계약서 안에 첨부된 TT 송금 내역 요약
type TTSummary struct {
	TTID      string   `json:"tt_id"`
	POID      string   `json:"po_id"`
	RemitDate *string  `json:"remit_date"`
	AmountUSD *float64 `json:"amount_usd"`
	Purpose   *string  `json:"purpose"`
	Status    *string  `json:"status"`
}

// 허용되는 contract_type 값 (D-086: spot/frame 2종으로 단순화)
// 독점 여부는 별도(메모 접두사 또는 향후 is_exclusive 컬럼)로 분리
// 기존 general/exclusive/annual/annual_frame/half_year_frame은 레거시 읽기 호환용
var validContractTypes = map[string]bool{
	"spot":            true,
	"frame":           true,
	"annual_frame":    true, // legacy
	"half_year_frame": true, // legacy
	"general":         true, // legacy
	"exclusive":       true, // legacy
	"annual":          true, // legacy
}

// 허용되는 status 값
// in_progress: LC 1건 이상 개설 시 자동 전환 (shipping 대체)
// shipping: 레거시 호환용 — 신규 등록 불가, 읽기만 허용
var validPOStatuses = map[string]bool{
	"draft":       true,
	"contracted":  true,
	"in_progress": true,
	"completed":   true,
	"cancelled":   true,
	"shipping":    true, // legacy — 기존 데이터 호환용
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
	ParentPOID          *string  `json:"parent_po_id,omitempty"`
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
		return "status는 \"draft\", \"contracted\", \"in_progress\", \"completed\", \"cancelled\" 중 하나여야 합니다"
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
	ParentPOID          *string  `json:"parent_po_id,omitempty"`
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
			return "status는 \"draft\", \"contracted\", \"in_progress\", \"completed\", \"cancelled\" 중 하나여야 합니다"
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
