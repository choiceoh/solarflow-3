package model

import "unicode/utf8"

// ImportDeclaration — 수입신고(면장) 정보를 담는 구조체
// 비유: "수입신고 면장" — 세관에 제출하는 수입 신고서
// D-064 PR 24/28: ERP 면장 자료(50컬럼)에서 필수+분석 컬럼 노출. source_payload 는 DB에만.
type ImportDeclaration struct {
	DeclarationID     string  `json:"declaration_id"`
	DeclarationNumber string  `json:"declaration_number"`
	BLID              string  `json:"bl_id"`
	CompanyID         string  `json:"company_id"`
	DeclarationDate   string  `json:"declaration_date"`
	ArrivalDate       *string `json:"arrival_date"`
	ReleaseDate       *string `json:"release_date"`
	HSCode            *string `json:"hs_code"`
	CustomsOffice     *string `json:"customs_office"`
	Port              *string `json:"port"`
	Memo              *string `json:"memo"`
	// 통관·계약 식별 (PR 24)
	LCNo            *string  `json:"lc_no,omitempty"`
	InvoiceNo       *string  `json:"invoice_no,omitempty"`
	BLNumber        *string  `json:"bl_number,omitempty"`
	SupplierNameEN  *string  `json:"supplier_name_en,omitempty"`
	SupplierNameKR  *string  `json:"supplier_name_kr,omitempty"`
	PONumber        *string  `json:"po_number,omitempty"`
	// 환율·금액
	ExchangeRate            *float64 `json:"exchange_rate,omitempty"`
	ContractUnitPriceUSDWp  *float64 `json:"contract_unit_price_usd_wp,omitempty"`
	ContractTotalUSD        *float64 `json:"contract_total_usd,omitempty"`
	ContractTotalKRW        *float64 `json:"contract_total_krw,omitempty"`
	CIFKrw                  *float64 `json:"cif_krw,omitempty"`
	Incoterms               *string  `json:"incoterms,omitempty"`
	// 관세·부가세
	CustomsRate    *float64 `json:"customs_rate,omitempty"`
	CustomsAmount  *float64 `json:"customs_amount,omitempty"`
	VATAmount      *float64 `json:"vat_amount,omitempty"`
	// 유상·무상 분리
	PaidQty     *int     `json:"paid_qty,omitempty"`
	FreeQty     *int     `json:"free_qty,omitempty"`
	FreeRatio   *float64 `json:"free_ratio,omitempty"`
	PaidCIFKrw  *float64 `json:"paid_cif_krw,omitempty"`
	FreeCIFKrw  *float64 `json:"free_cif_krw,omitempty"`
	// 원가단가 (★ 핵심)
	CostUnitPriceWp *float64 `json:"cost_unit_price_wp,omitempty"`
	CostUnitPriceEa *float64 `json:"cost_unit_price_ea,omitempty"`
	// 모델·수량
	ProductID       *string  `json:"product_id,omitempty"`
	Quantity        *int     `json:"quantity,omitempty"`
	CapacityKw      *float64 `json:"capacity_kw,omitempty"`
	// ERP cross-key
	ErpInboundNo       *string `json:"erp_inbound_no,omitempty"`
	DeclarationLineNo  *string `json:"declaration_line_no,omitempty"`
}

// CreateDeclarationRequest — 면장 등록 시 클라이언트가 보내는 데이터
// 비유: "수입신고서 등록 신청서" — 면장번호, B/L, 법인, 신고일을 필수 기재
type CreateDeclarationRequest struct {
	DeclarationNumber string  `json:"declaration_number"`
	BLID              string  `json:"bl_id"`
	CompanyID         string  `json:"company_id"`
	DeclarationDate   string  `json:"declaration_date"`
	ArrivalDate       *string `json:"arrival_date"`
	ReleaseDate       *string `json:"release_date"`
	HSCode            *string `json:"hs_code"`
	CustomsOffice     *string `json:"customs_office"`
	Port              *string `json:"port"`
	Memo              *string `json:"memo"`
}

// Validate — 면장 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 면장 신청서 필수 항목 확인
func (req *CreateDeclarationRequest) Validate() string {
	if req.DeclarationNumber == "" {
		return "declaration_number는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.DeclarationNumber) > 30 {
		return "declaration_number는 30자를 초과할 수 없습니다"
	}
	if req.BLID == "" {
		return "bl_id는 필수 항목입니다"
	}
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.DeclarationDate == "" {
		return "declaration_date는 필수 항목입니다"
	}
	return ""
}

// UpdateDeclarationRequest — 면장 수정 시 클라이언트가 보내는 데이터
// 비유: "수입신고서 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateDeclarationRequest struct {
	DeclarationNumber *string `json:"declaration_number,omitempty"`
	BLID              *string `json:"bl_id,omitempty"`
	CompanyID         *string `json:"company_id,omitempty"`
	DeclarationDate   *string `json:"declaration_date,omitempty"`
	ArrivalDate       *string `json:"arrival_date,omitempty"`
	ReleaseDate       *string `json:"release_date,omitempty"`
	HSCode            *string `json:"hs_code,omitempty"`
	CustomsOffice     *string `json:"customs_office,omitempty"`
	Port              *string `json:"port,omitempty"`
	Memo              *string `json:"memo,omitempty"`
}

// Validate — 면장 수정 요청의 입력값을 검증
func (req *UpdateDeclarationRequest) Validate() string {
	if req.DeclarationNumber != nil {
		if *req.DeclarationNumber == "" {
			return "declaration_number는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.DeclarationNumber) > 30 {
			return "declaration_number는 30자를 초과할 수 없습니다"
		}
	}
	if req.BLID != nil && *req.BLID == "" {
		return "bl_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.DeclarationDate != nil && *req.DeclarationDate == "" {
		return "declaration_date는 빈 값으로 변경할 수 없습니다"
	}
	return ""
}
