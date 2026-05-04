package model

// FifoMatch — ERP FIFO 매칭 (D-064 PR 26).
// 한 입고 LOT 이 어떤 출고에 어떤 비율로 배분됐는지 + 원가/이익.
// PR 29: GET /api/v1/outbounds/:id/fifo-matches 응답.
type FifoMatch struct {
	MatchID            string   `json:"match_id"`
	// 입고 식별
	ErpInboundNo       *string  `json:"erp_inbound_no,omitempty"`
	ErpInboundLineNo   *int     `json:"erp_inbound_line_no,omitempty"`
	InboundID          *string  `json:"inbound_id,omitempty"`
	InboundDate        *string  `json:"inbound_date,omitempty"`
	InboundKind        *string  `json:"inbound_kind,omitempty"`
	SupplierName       *string  `json:"supplier_name,omitempty"`
	// 출고 식별
	ErpOutboundNo      *string  `json:"erp_outbound_no,omitempty"`
	OutboundID         *string  `json:"outbound_id,omitempty"`
	OutboundDate       *string  `json:"outbound_date,omitempty"`
	CustomerName       *string  `json:"customer_name,omitempty"`
	// 품번
	ProductID          string   `json:"product_id"`
	// 수량
	LotInboundQty      *int     `json:"lot_inbound_qty,omitempty"`
	OutboundQtyOrigin  *int     `json:"outbound_qty_origin,omitempty"`
	AllocatedQty       *int     `json:"allocated_qty,omitempty"`
	// 단가/금액
	WpUnitPrice        *float64 `json:"wp_unit_price,omitempty"`
	EaUnitCost         *float64 `json:"ea_unit_cost,omitempty"`
	CostAmount         *float64 `json:"cost_amount,omitempty"`
	SalesUnitPriceEa   *float64 `json:"sales_unit_price_ea,omitempty"`
	SalesAmount        *float64 `json:"sales_amount,omitempty"`
	ProfitAmount       *float64 `json:"profit_amount,omitempty"`
	ProfitRatio        *float64 `json:"profit_ratio,omitempty"`
	// ERP 메타
	UsageCategoryRaw   *string  `json:"usage_category_raw,omitempty"`
	Project            *string  `json:"project,omitempty"`
	ProcurementType    *string  `json:"procurement_type,omitempty"`
	Corporation        *string  `json:"corporation,omitempty"`
	ManufacturerNameKR *string  `json:"manufacturer_name_kr,omitempty"`
	ManufacturerNameEN *string  `json:"manufacturer_name_en,omitempty"`
	// 통관 cross-key
	DeclarationID      *string  `json:"declaration_id,omitempty"`
	DeclarationNumber  *string  `json:"declaration_number,omitempty"`
	BLNumber           *string  `json:"bl_number,omitempty"`
	LCNumber           *string  `json:"lc_number,omitempty"`
	CategoryNo         *string  `json:"category_no,omitempty"`
	PONumber           *string  `json:"po_number,omitempty"`
	Source             string   `json:"source"`
}

// FifoMatchSummary — 출고 한 건의 FIFO 매칭 합계
// 비유: 출고 상세 카드 하단의 "총 원가/이익" 표.
type FifoMatchSummary struct {
	MatchCount         int     `json:"match_count"`
	TotalAllocatedQty  int     `json:"total_allocated_qty"`
	TotalCostAmount    float64 `json:"total_cost_amount"`
	TotalSalesAmount   float64 `json:"total_sales_amount"`
	TotalProfitAmount  float64 `json:"total_profit_amount"`
	AvgProfitRatio     float64 `json:"avg_profit_ratio"` // 가중평균 (sales 기준)
}

// OutboundFifoMatchesResponse — 출고 FIFO 매칭 조회 응답
type OutboundFifoMatchesResponse struct {
	Matches []FifoMatch       `json:"matches"`
	Summary FifoMatchSummary  `json:"summary"`
}
