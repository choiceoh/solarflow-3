package baro

// BaroOutboundItem — BARO 영업·창고팀이 보는 sanitized 출고 라인 한 줄.
//
// 비유: 탑솔라가 등록한 출고 전표에서 단가/공급가/부가세/합계와 외부 양식 원본을 가린
//       복사본. 창고팀이 피킹·배송·검수 준비에 쓸 정보만 남긴다 (D-039, D-116 패턴).
//
// 노출 정책:
//   - 가격(unit_price_wp, supply/vat/total) · memo · source_payload 컬럼 모두 응답에 미포함
//   - 거래처(customer_name), 현장명/주소, 워크플로우 4 체크박스는 그대로 노출
//   - status='cancelled' 는 기본 제외 (scope=all 쿼리 시에만 포함)
type BaroOutboundItem struct {
	OutboundID        string  `json:"outbound_id"`
	OutboundDate      string  `json:"outbound_date"`
	CompanyID         string  `json:"company_id"`
	CompanyName       *string `json:"company_name,omitempty"`
	ProductID         string  `json:"product_id"`
	ProductCode       *string `json:"product_code,omitempty"`
	ProductName       *string `json:"product_name,omitempty"`
	SpecWP            *int    `json:"spec_wp,omitempty"`
	Quantity          int     `json:"quantity"`
	CapacityKW        float64 `json:"capacity_kw"`
	WarehouseID       *string `json:"warehouse_id,omitempty"`
	WarehouseName     *string `json:"warehouse_name,omitempty"`
	UsageCategory     string  `json:"usage_category"`
	CustomerID        *string `json:"customer_id,omitempty"`
	CustomerName      *string `json:"customer_name,omitempty"`
	SiteName          *string `json:"site_name,omitempty"`
	SiteAddress       *string `json:"site_address,omitempty"`
	SpareQty          *int    `json:"spare_qty,omitempty"`
	OrderNumber       *string `json:"order_number,omitempty"`
	GroupTrade        *bool   `json:"group_trade,omitempty"`
	TargetCompanyID   *string `json:"target_company_id,omitempty"`
	TargetCompanyName *string `json:"target_company_name,omitempty"`
	ErpOutboundNo     *string `json:"erp_outbound_no,omitempty"`
	Status            string  `json:"status"`
	// 워크플로우 4 체크박스 (D-055) — 거래명세서/인수검수요청서/결재요청/계산서발행.
	TxStatementReady      bool `json:"tx_statement_ready"`
	InspectionRequestSent bool `json:"inspection_request_sent"`
	ApprovalRequested     bool `json:"approval_requested"`
	TaxInvoiceIssued      bool `json:"tax_invoice_issued"`
}
