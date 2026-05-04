package model

// Sale — 판매(세금계산서) 정보를 담는 구조체
// 비유: "판매 전표" — 출고에 연결된 판매 금액, 세금계산서 정보
type Sale struct {
	SaleID          string   `json:"sale_id"`
	OutboundID      *string  `json:"outbound_id,omitempty"`
	OrderID         *string  `json:"order_id,omitempty"`
	CustomerID      string   `json:"customer_id"`
	CustomerName    *string  `json:"customer_name,omitempty"`
	Quantity        *int     `json:"quantity,omitempty"`
	CapacityKw      *float64 `json:"capacity_kw,omitempty"`
	UnitPriceWp     float64  `json:"unit_price_wp"`
	UnitPriceEa     *float64 `json:"unit_price_ea"`
	SupplyAmount    *float64 `json:"supply_amount"`
	VatAmount       *float64 `json:"vat_amount"`
	TotalAmount     *float64 `json:"total_amount"`
	TaxInvoiceDate  *string  `json:"tax_invoice_date"`
	TaxInvoiceEmail *string  `json:"tax_invoice_email"`
	ErpClosed       *bool    `json:"erp_closed"`
	ErpClosedDate   *string  `json:"erp_closed_date"`
	Status          string   `json:"status"`
	Memo            *string  `json:"memo"`
	// D-064 PR 22: ERP 매출 시트 backfill 식별/원자료 보존.
	ErpSalesNo *string `json:"erp_sales_no,omitempty"`
	ErpLineNo  *int    `json:"erp_line_no,omitempty"`
	Currency   *string `json:"currency,omitempty"`
}

// SaleListItem — 매출 현황 화면용 응답
// 비유: "계산서 카드" — 계산서 원본(sale)과 수주/출고 문맥을 한 줄에 같이 표시
type SaleListItem struct {
	SaleID         string   `json:"sale_id"`
	OutboundID     *string  `json:"outbound_id,omitempty"`
	OrderID        *string  `json:"order_id,omitempty"`
	OutboundDate   *string  `json:"outbound_date,omitempty"`
	OutboundStatus *string  `json:"outbound_status,omitempty"`
	OrderDate      *string  `json:"order_date,omitempty"`
	OrderNumber    *string  `json:"order_number,omitempty"`
	CompanyID      *string  `json:"company_id,omitempty"`
	CustomerID     string   `json:"customer_id"`
	CustomerName   *string  `json:"customer_name,omitempty"`
	ProductID      *string  `json:"product_id,omitempty"`
	ProductName    *string  `json:"product_name,omitempty"`
	ProductCode    *string  `json:"product_code,omitempty"`
	SpecWp         *float64 `json:"spec_wp,omitempty"`
	Quantity       int      `json:"quantity"`
	CapacityKw     *float64 `json:"capacity_kw,omitempty"`
	SiteName       *string  `json:"site_name,omitempty"`
	UnitPriceWp    float64  `json:"unit_price_wp"`
	UnitPriceEa    *float64 `json:"unit_price_ea,omitempty"`
	SupplyAmount   *float64 `json:"supply_amount,omitempty"`
	VatAmount      *float64 `json:"vat_amount,omitempty"`
	TotalAmount    *float64 `json:"total_amount,omitempty"`
	TaxInvoiceDate *string  `json:"tax_invoice_date,omitempty"`
	Status         string   `json:"status"`
	Sale           Sale     `json:"sale"`
}

// CreateSaleRequest — 판매 등록 시 클라이언트가 보내는 데이터
// 비유: "판매 등록 신청서" — 출고 전이면 수주, 출고 후이면 출고 전표와 연결
type CreateSaleRequest struct {
	OutboundID      *string  `json:"outbound_id,omitempty"`
	OrderID         *string  `json:"order_id,omitempty"`
	CustomerID      string   `json:"customer_id"`
	Quantity        *int     `json:"quantity,omitempty"`
	CapacityKw      *float64 `json:"capacity_kw,omitempty"`
	UnitPriceWp     float64  `json:"unit_price_wp"`
	UnitPriceEa     *float64 `json:"unit_price_ea"`
	SupplyAmount    *float64 `json:"supply_amount"`
	VatAmount       *float64 `json:"vat_amount"`
	TotalAmount     *float64 `json:"total_amount"`
	TaxInvoiceDate  *string  `json:"tax_invoice_date"`
	TaxInvoiceEmail *string  `json:"tax_invoice_email"`
	ErpClosed       *bool    `json:"erp_closed"`
	ErpClosedDate   *string  `json:"erp_closed_date"`
	Memo            *string  `json:"memo"`
}

// Validate — 판매 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 판매 신청서 필수 항목 확인
func (req *CreateSaleRequest) Validate() string {
	if (req.OutboundID == nil || *req.OutboundID == "") && (req.OrderID == nil || *req.OrderID == "") {
		return "order_id 또는 outbound_id 중 하나는 필수 항목입니다"
	}
	if req.CustomerID == "" {
		return "customer_id는 필수 항목입니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.UnitPriceWp <= 0 {
		return "unit_price_wp는 양수여야 합니다"
	}
	return ""
}

// UpdateSaleRequest — 판매 수정 시 클라이언트가 보내는 데이터
// 비유: "판매 전표 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateSaleRequest struct {
	OutboundID      *string  `json:"outbound_id,omitempty"`
	OrderID         *string  `json:"order_id,omitempty"`
	CustomerID      *string  `json:"customer_id,omitempty"`
	Quantity        *int     `json:"quantity,omitempty"`
	CapacityKw      *float64 `json:"capacity_kw,omitempty"`
	UnitPriceWp     *float64 `json:"unit_price_wp,omitempty"`
	UnitPriceEa     *float64 `json:"unit_price_ea,omitempty"`
	SupplyAmount    *float64 `json:"supply_amount,omitempty"`
	VatAmount       *float64 `json:"vat_amount,omitempty"`
	TotalAmount     *float64 `json:"total_amount,omitempty"`
	TaxInvoiceDate  *string  `json:"tax_invoice_date,omitempty"`
	TaxInvoiceEmail *string  `json:"tax_invoice_email,omitempty"`
	ErpClosed       *bool    `json:"erp_closed,omitempty"`
	ErpClosedDate   *string  `json:"erp_closed_date,omitempty"`
	Memo            *string  `json:"memo,omitempty"`
}

// Validate — 판매 수정 요청의 입력값을 검증
func (req *UpdateSaleRequest) Validate() string {
	if req.OutboundID != nil && *req.OutboundID == "" {
		return "outbound_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.OrderID != nil && *req.OrderID == "" {
		return "order_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.CustomerID != nil && *req.CustomerID == "" {
		return "customer_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.UnitPriceWp != nil && *req.UnitPriceWp <= 0 {
		return "unit_price_wp는 양수여야 합니다"
	}
	return ""
}
