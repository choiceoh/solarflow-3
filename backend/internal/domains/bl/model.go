package bl

import (
	"slices"
	"strings"
	"unicode/utf8"

	"solarflow-backend/internal/dbschema"
	"solarflow-backend/internal/model"
)

// formatAllowedValues — DB CHECK 슬라이스를 에러 메시지의 \"a\", \"b\", \"c\" 중 하나여야 합니다 형식으로.
// validation 메시지를 dbschema 와 항상 일치시켜 손동기화 누락을 차단.
func formatAllowedValues(vals []string) string {
	quoted := make([]string, len(vals))
	for i, v := range vals {
		quoted[i] = `"` + v + `"`
	}
	return strings.Join(quoted, ", ") + " 중 하나여야 합니다"
}

// BLShipment — B/L(입고/선적) 정보를 담는 구조체
// 비유: "선적 서류" — 어떤 화물이, 어디서 어디로, 언제 도착하는지 기록
type BLShipment struct {
	BLID                 string   `json:"bl_id"`
	BLNumber             string   `json:"bl_number"`
	POID                 *string  `json:"po_id"`
	LCID                 *string  `json:"lc_id"`
	CompanyID            string   `json:"company_id"`
	ManufacturerID       string   `json:"manufacturer_id"`
	InboundType          string   `json:"inbound_type"`
	Currency             string   `json:"currency"`
	ExchangeRate         *float64 `json:"exchange_rate"`
	ETD                  *string  `json:"etd"`
	ETA                  *string  `json:"eta"`
	ActualArrival        *string  `json:"actual_arrival"`
	Port                 *string  `json:"port"`
	Forwarder            *string  `json:"forwarder"`
	WarehouseID          *string  `json:"warehouse_id"`
	InvoiceNumber        *string  `json:"invoice_number"`
	Status               string   `json:"status"`
	ERPRegistered        *bool    `json:"erp_registered"`
	Memo                 *string  `json:"memo"`
	PaymentTerms         *string  `json:"payment_terms"`
	Incoterms            *string  `json:"incoterms"`
	CounterpartCompanyID *string  `json:"counterpart_company_id"`
	DeclarationNumber    *string  `json:"declaration_number"`
	CIFAmountKRW         *int64   `json:"cif_amount_krw,omitempty"` // 면장 CIF 원화금액 (부가세·무상분 과세 제외)
	LineCount            int      `json:"line_count"`               // 목록 전용: 라인아이템 수
	TotalMW              float64  `json:"total_mw"`                 // 목록 전용: 라인아이템 capacity_kw 합계 / 1000
	AvgCentsPerWP        float64  `json:"avg_cents_per_wp"`         // 목록 전용: invoice_amount_usd / 총 Wp * 100
	FirstProductCode     *string  `json:"first_product_code,omitempty"`
	FirstProductName     *string  `json:"first_product_name,omitempty"`
	FirstSpecWP          *int     `json:"first_spec_wp,omitempty"`
}

// BLWithRelations — 법인/제조사/창고 정보를 포함한 B/L 목록 조회 결과
// 비유: 선적 서류에 법인 도장, 제조사 명함, 창고 안내가 함께 붙어 있는 것
type BLWithRelations struct {
	BLShipment
	Companies     *model.CompanySummary  `json:"companies"`
	Manufacturers *BLManufacturerSummary `json:"manufacturers"`
	Warehouses    *BLWarehouseSummary    `json:"warehouses"`
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
// Rust 재고 집계는 /api/v1/calc/inventory 프록시가 담당한다.
// TODO: 그룹 내 거래 자동 연동 — 출고 시 상대 법인 입고 자동 생성.
type BLDetail struct {
	BLDetailBase
	LineItems []BLLineWithProduct `json:"line_items"`
}

// BLDetailBase — B/L 상세 조회 시 본문 (제조사 상세 포함)
type BLDetailBase struct {
	BLShipment
	Companies     *model.CompanySummary        `json:"companies"`
	Manufacturers *BLManufacturerDetailSummary `json:"manufacturers"`
	Warehouses    *BLWarehouseDetailSummary    `json:"warehouses"`
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

// 허용 값 정본은 dbschema 가 자동 생성한 슬라이스:
//   - inbound_type → dbschema.BlShipmentsInboundTypeValues
//   - currency     → dbschema.BlShipmentsCurrencyValues
//   - status       → dbschema.BlShipmentsStatusValues
// 이전엔 validInboundTypes/validCurrencies/validBLStatuses map 손코딩 → DB CHECK 와 드리프트
// 위험이 있었다. 이제 운영 DB CHECK 가 바뀌면 generator 가 슬라이스를 갱신, 검증·메시지가
// 자동 따라감.

// CreateBLRequest — B/L 등록 시 클라이언트가 보내는 데이터
// 비유: "선적 서류 등록 신청서" — B/L번호, 법인, 제조사, 유형을 필수 기재
type CreateBLRequest struct {
	BLNumber             string   `json:"bl_number"`
	POID                 *string  `json:"po_id"`
	LCID                 *string  `json:"lc_id"`
	CompanyID            string   `json:"company_id"`
	ManufacturerID       string   `json:"manufacturer_id"`
	InboundType          string   `json:"inbound_type"`
	Currency             string   `json:"currency"`
	ExchangeRate         *float64 `json:"exchange_rate"`
	ETD                  *string  `json:"etd"`
	ETA                  *string  `json:"eta"`
	ActualArrival        *string  `json:"actual_arrival"`
	Port                 *string  `json:"port"`
	Forwarder            *string  `json:"forwarder"`
	WarehouseID          *string  `json:"warehouse_id"`
	InvoiceNumber        *string  `json:"invoice_number"`
	Status               string   `json:"status"`
	ERPRegistered        *bool    `json:"erp_registered"`
	Memo                 *string  `json:"memo"`
	PaymentTerms         *string  `json:"payment_terms"`
	Incoterms            *string  `json:"incoterms"`
	CounterpartCompanyID *string  `json:"counterpart_company_id"`
	DeclarationNumber    *string  `json:"declaration_number"`
	CIFAmountKRW         *int64   `json:"cif_amount_krw,omitempty"`
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
	if !slices.Contains(dbschema.BlShipmentsInboundTypeValues, req.InboundType) {
		return "inbound_type은 " + formatAllowedValues(dbschema.BlShipmentsInboundTypeValues)
	}
	if req.Currency == "" {
		return "currency는 필수 항목입니다"
	}
	if !slices.Contains(dbschema.BlShipmentsCurrencyValues, req.Currency) {
		return "currency는 " + formatAllowedValues(dbschema.BlShipmentsCurrencyValues)
	}
	if req.Status == "" {
		return "status는 필수 항목입니다"
	}
	if !slices.Contains(dbschema.BlShipmentsStatusValues, req.Status) {
		return "status는 " + formatAllowedValues(dbschema.BlShipmentsStatusValues)
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	return ""
}

// UpdateBLRequest — B/L 수정 시 클라이언트가 보내는 데이터
// 비유: "선적 서류 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateBLRequest struct {
	BLNumber             *string  `json:"bl_number,omitempty"`
	POID                 *string  `json:"po_id,omitempty"`
	LCID                 *string  `json:"lc_id,omitempty"`
	CompanyID            *string  `json:"company_id,omitempty"`
	ManufacturerID       *string  `json:"manufacturer_id,omitempty"`
	InboundType          *string  `json:"inbound_type,omitempty"`
	Currency             *string  `json:"currency,omitempty"`
	ExchangeRate         *float64 `json:"exchange_rate,omitempty"`
	ETD                  *string  `json:"etd,omitempty"`
	ETA                  *string  `json:"eta,omitempty"`
	ActualArrival        *string  `json:"actual_arrival,omitempty"`
	Port                 *string  `json:"port,omitempty"`
	Forwarder            *string  `json:"forwarder,omitempty"`
	WarehouseID          *string  `json:"warehouse_id,omitempty"`
	InvoiceNumber        *string  `json:"invoice_number,omitempty"`
	Status               *string  `json:"status,omitempty"`
	ERPRegistered        *bool    `json:"erp_registered,omitempty"`
	Memo                 *string  `json:"memo,omitempty"`
	PaymentTerms         *string  `json:"payment_terms,omitempty"`
	Incoterms            *string  `json:"incoterms,omitempty"`
	CounterpartCompanyID *string  `json:"counterpart_company_id,omitempty"`
	DeclarationNumber    *string  `json:"declaration_number,omitempty"`
	CIFAmountKRW         *int64   `json:"cif_amount_krw,omitempty"`
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
	if req.InboundType != nil && !slices.Contains(dbschema.BlShipmentsInboundTypeValues, *req.InboundType) {
		return "inbound_type은 " + formatAllowedValues(dbschema.BlShipmentsInboundTypeValues)
	}
	if req.Currency != nil && !slices.Contains(dbschema.BlShipmentsCurrencyValues, *req.Currency) {
		return "currency는 " + formatAllowedValues(dbschema.BlShipmentsCurrencyValues)
	}
	if req.Status != nil && !slices.Contains(dbschema.BlShipmentsStatusValues, *req.Status) {
		return "status는 " + formatAllowedValues(dbschema.BlShipmentsStatusValues)
	}
	if req.ExchangeRate != nil && *req.ExchangeRate <= 0 {
		return "exchange_rate는 양수여야 합니다"
	}
	return ""
}
