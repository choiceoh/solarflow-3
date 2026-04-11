package model

import "unicode/utf8"

// BLShipment — B/L(입고/선적) 정보를 담는 구조체
// 비유: "선적 서류" — 어떤 화물이, 어디서 어디로, 언제 도착하는지 기록
type BLShipment struct {
	BLID                  string   `json:"bl_id"`
	BLNumber              string   `json:"bl_number"`
	POID                  *string  `json:"po_id"`
	LCID                  *string  `json:"lc_id"`
	CompanyID             string   `json:"company_id"`
	ManufacturerID        string   `json:"manufacturer_id"`
	InboundType           string   `json:"inbound_type"`
	Currency              string   `json:"currency"`
	ExchangeRate          *float64 `json:"exchange_rate"`
	ETD                   *string  `json:"etd"`
	ETA                   *string  `json:"eta"`
	ActualArrival         *string  `json:"actual_arrival"`
	Port                  *string  `json:"port"`
	Forwarder             *string  `json:"forwarder"`
	WarehouseID           *string  `json:"warehouse_id"`
	InvoiceNumber         *string  `json:"invoice_number"`
	Status                string   `json:"status"`
	ERPRegistered         *bool    `json:"erp_registered"`
	Memo                  *string  `json:"memo"`
	PaymentTerms          *string  `json:"payment_terms"`
	Incoterms             *string  `json:"incoterms"`
	CounterpartCompanyID  *string  `json:"counterpart_company_id"`
	DeclarationNumber     *string  `json:"declaration_number"`
}

// BLWithRelations — 법인/제조사/창고 정보를 포함한 B/L 목록 조회 결과
// 비유: 선적 서류에 법인 도장, 제조사 명함, 창고 안내가 함께 붙어 있는 것
type BLWithRelations struct {
	BLShipment
	Companies     *CompanySummary          `json:"companies"`
	Manufacturers *BLManufacturerSummary   `json:"manufacturers"`
	Warehouses    *BLWarehouseSummary      `json:"warehouses"`
}

// BLManufacturerSummary — B/L 목록 조회 시 제조사 요약 정보
type BLManufacturerSummary struct {
	NameKR string `json:"name_kr"`
}

// BLWarehouseSummary — B/L 목록 조회 시 창고 요약 정보
type BLWarehouseSummary struct {
	WarehouseName string `json:"warehouse_name"`
	LocationName  string `json:"location_name"`
}

// BLDetail — B/L 상세 조회 시 라인아이템을 포함한 전체 결과
// 비유: 선적 서류를 펼쳐서 화물 명세까지 모두 보여주는 것
// TODO: Rust 계산엔진 연동 — 재고 집계 (물리적→가용→총확보량)
// TODO: 그룹 내 거래 자동 연동 — 출고 시 상대 법인 입고 자동 생성
type BLDetail struct {
	BLDetailBase
	LineItems []BLLineWithProduct `json:"line_items"`
}

// BLDetailBase — B/L 상세 조회 시 본문 (제조사 상세 포함)
type BLDetailBase struct {
	BLShipment
	Companies     *CompanySummary               `json:"companies"`
	Manufacturers *BLManufacturerDetailSummary   `json:"manufacturers"`
	Warehouses    *BLWarehouseDetailSummary      `json:"warehouses"`
}

// BLManufacturerDetailSummary — B/L 상세 조회 시 제조사 정보 (영문명 포함)
type BLManufacturerDetailSummary struct {
	NameKR string `json:"name_kr"`
	NameEN string `json:"name_en"`
}

// BLWarehouseDetailSummary — B/L 상세 조회 시 창고 상세 정보
type BLWarehouseDetailSummary struct {
	WarehouseName string `json:"warehouse_name"`
	LocationName  string `json:"location_name"`
	WarehouseCode string `json:"warehouse_code"`
	LocationCode  string `json:"location_code"`
}

// 허용되는 inbound_type 값
var validInboundTypes = map[string]bool{
	"import":           true,
	"domestic":         true,
	"domestic_foreign": true,
	"group":            true,
}

// 허용되는 currency 값
var validCurrencies = map[string]bool{
	"USD": true,
	"KRW": true,
}

// 허용되는 B/L status 값
var validBLStatuses = map[string]bool{
	"scheduled": true,
	"shipping":  true,
	"arrived":   true,
	"customs":   true,
	"completed": true,
	"erp_done":  true,
}

// CreateBLRequest — B/L 등록 시 클라이언트가 보내는 데이터
// 비유: "선적 서류 등록 신청서" — B/L번호, 법인, 제조사, 유형을 필수 기재
type CreateBLRequest struct {
	BLNumber              string   `json:"bl_number"`
	POID                  *string  `json:"po_id"`
	LCID                  *string  `json:"lc_id"`
	CompanyID             string   `json:"company_id"`
	ManufacturerID        string   `json:"manufacturer_id"`
	InboundType           string   `json:"inbound_type"`
	Currency              string   `json:"currency"`
	ExchangeRate          *float64 `json:"exchange_rate"`
	ETD                   *string  `json:"etd"`
	ETA                   *string  `json:"eta"`
	ActualArrival         *string  `json:"actual_arrival"`
	Port                  *string  `json:"port"`
	Forwarder             *string  `json:"forwarder"`
	WarehouseID           *string  `json:"warehouse_id"`
	InvoiceNumber         *string  `json:"invoice_number"`
	Status                string   `json:"status"`
	ERPRegistered         *bool    `json:"erp_registered"`
	Memo                  *string  `json:"memo"`
	PaymentTerms          *string  `json:"payment_terms"`
	Incoterms             *string  `json:"incoterms"`
	CounterpartCompanyID  *string  `json:"counterpart_company_id"`
	DeclarationNumber     *string  `json:"declaration_number"`
}

// Validate — B/L 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 선적 서류 필수 항목, 허용 값 확인
func (req *CreateBLRequest) Validate() string {
	if req.BLNumber == "" {
		return "bl_number는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.BLNumber) > 30 {
		return "bl_number는 30자를 초과할 수 없습니다"
	}
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	// 그룹내구매는 제조사 선택 불필요 (상대법인 기준)
	if req.InboundType != "group" && req.ManufacturerID == "" {
		return "manufacturer_id는 필수 항목입니다"
	}
	if req.InboundType == "" {
		return "inbound_type은 필수 항목입니다"
	}
	if !validInboundTypes[req.InboundType] {
		return "inbound_type은 \"import\", \"domestic\", \"domestic_foreign\", \"group\" 중 하나여야 합니다"
	}
	if req.Currency == "" {
		return "currency는 필수 항목입니다"
	}
	if !validCurrencies[req.Currency] {
		return "currency는 \"USD\", \"KRW\" 중 하나여야 합니다"
	}
	if req.Status == "" {
		return "status는 필수 항목입니다"
	}
	if !validBLStatuses[req.Status] {
		return "status는 \"scheduled\", \"shipping\", \"arrived\", \"customs\", \"completed\", \"erp_done\" 중 하나여야 합니다"
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	return ""
}

// UpdateBLRequest — B/L 수정 시 클라이언트가 보내는 데이터
// 비유: "선적 서류 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateBLRequest struct {
	BLNumber              *string  `json:"bl_number,omitempty"`
	POID                  *string  `json:"po_id,omitempty"`
	LCID                  *string  `json:"lc_id,omitempty"`
	CompanyID             *string  `json:"company_id,omitempty"`
	ManufacturerID        *string  `json:"manufacturer_id,omitempty"`
	InboundType           *string  `json:"inbound_type,omitempty"`
	Currency              *string  `json:"currency,omitempty"`
	ExchangeRate          *float64 `json:"exchange_rate,omitempty"`
	ETD                   *string  `json:"etd,omitempty"`
	ETA                   *string  `json:"eta,omitempty"`
	ActualArrival         *string  `json:"actual_arrival,omitempty"`
	Port                  *string  `json:"port,omitempty"`
	Forwarder             *string  `json:"forwarder,omitempty"`
	WarehouseID           *string  `json:"warehouse_id,omitempty"`
	InvoiceNumber         *string  `json:"invoice_number,omitempty"`
	Status                *string  `json:"status,omitempty"`
	ERPRegistered         *bool    `json:"erp_registered,omitempty"`
	Memo                  *string  `json:"memo,omitempty"`
	PaymentTerms          *string  `json:"payment_terms,omitempty"`
	Incoterms             *string  `json:"incoterms,omitempty"`
	CounterpartCompanyID  *string  `json:"counterpart_company_id,omitempty"`
	DeclarationNumber     *string  `json:"declaration_number,omitempty"`
}

// Validate — B/L 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateBLRequest) Validate() string {
	if req.BLNumber != nil {
		if *req.BLNumber == "" {
			return "bl_number는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.BLNumber) > 30 {
			return "bl_number는 30자를 초과할 수 없습니다"
		}
	}
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.ManufacturerID != nil && *req.ManufacturerID == "" {
		return "manufacturer_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.InboundType != nil && !validInboundTypes[*req.InboundType] {
		return "inbound_type은 \"import\", \"domestic\", \"domestic_foreign\", \"group\" 중 하나여야 합니다"
	}
	if req.Currency != nil && !validCurrencies[*req.Currency] {
		return "currency는 \"USD\", \"KRW\" 중 하나여야 합니다"
	}
	if req.Status != nil && !validBLStatuses[*req.Status] {
		return "status는 \"scheduled\", \"shipping\", \"arrived\", \"customs\", \"completed\", \"erp_done\" 중 하나여야 합니다"
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	return ""
}
