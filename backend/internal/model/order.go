package model

// 허용되는 receipt_method 값
var validReceiptMethods = map[string]bool{
	"purchase_order": true,
	"phone":          true,
	"email":          true,
	"other":          true,
}

// 허용되는 order status 값
var validOrderStatuses = map[string]bool{
	"received":  true,
	"partial":   true,
	"completed": true,
	"cancelled": true,
}

// 허용되는 management_category 값
var validManagementCategories = map[string]bool{
	"sale":         true,
	"construction": true,
	"spare":        true,
	"repowering":   true,
	"maintenance":  true,
	"other":        true,
}

// 허용되는 fulfillment_source 값
var validFulfillmentSources = map[string]bool{
	"stock":    true,
	"incoming": true,
}

// Order — 수주(판매 주문) 정보를 담는 구조체
// 비유: "수주 계약서" — 어느 고객이, 어떤 품번을, 몇 장, 얼마에 주문했는지 기록
type Order struct {
	OrderID       string   `json:"order_id"`
	OrderNumber   *string  `json:"order_number"`
	CompanyID     string   `json:"company_id"`
	CustomerID    string   `json:"customer_id"`
	OrderDate     string   `json:"order_date"`
	ReceiptMethod string   `json:"receipt_method"`
	ProductID     string   `json:"product_id"`
	Quantity      int      `json:"quantity"`
	CapacityKw    *float64 `json:"capacity_kw"`
	UnitPriceWp   float64  `json:"unit_price_wp"`
	SiteID        *string  `json:"site_id"`
	SiteName      *string  `json:"site_name"`
	SiteAddress   *string  `json:"site_address"`
	SiteContact   *string  `json:"site_contact"`
	SitePhone     *string  `json:"site_phone"`
	PaymentTerms  *string  `json:"payment_terms"`
	DepositRate   *float64 `json:"deposit_rate"`
	DeliveryDue   *string  `json:"delivery_due"`
	ShippedQty    *int     `json:"shipped_qty"`
	RemainingQty  *int     `json:"remaining_qty"`
	Status             string   `json:"status"`
	ManagementCategory string   `json:"management_category"`
	FulfillmentSource  string   `json:"fulfillment_source"`
	SpareQty           *int     `json:"spare_qty"`
	Memo               *string  `json:"memo"`
}

// CreateOrderRequest — 수주 등록 시 클라이언트가 보내는 데이터
// 비유: "수주 등록 신청서" — 법인, 고객, 주문일, 품번, 수량, 단가를 필수 기재
type CreateOrderRequest struct {
	OrderNumber   *string  `json:"order_number"`
	CompanyID     string   `json:"company_id"`
	CustomerID    string   `json:"customer_id"`
	OrderDate     string   `json:"order_date"`
	ReceiptMethod string   `json:"receipt_method"`
	ProductID     string   `json:"product_id"`
	Quantity      int      `json:"quantity"`
	CapacityKw    *float64 `json:"capacity_kw"`
	UnitPriceWp   float64  `json:"unit_price_wp"`
	SiteID        *string  `json:"site_id,omitempty"`
	SiteName      *string  `json:"site_name"`
	SiteAddress   *string  `json:"site_address"`
	SiteContact   *string  `json:"site_contact"`
	SitePhone     *string  `json:"site_phone"`
	PaymentTerms  *string  `json:"payment_terms"`
	DepositRate   *float64 `json:"deposit_rate"`
	DeliveryDue   *string  `json:"delivery_due"`
	Status             string   `json:"status"`
	ManagementCategory string   `json:"management_category"`
	FulfillmentSource  string   `json:"fulfillment_source"`
	SpareQty           *int     `json:"spare_qty"`
	Memo               *string  `json:"memo"`
}

// Validate — 수주 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 수주 신청서 필수 항목, 허용 값 확인
func (req *CreateOrderRequest) Validate() string {
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.CustomerID == "" {
		return "customer_id는 필수 항목입니다"
	}
	if req.OrderDate == "" {
		return "order_date는 필수 항목입니다"
	}
	if req.ReceiptMethod == "" {
		return "receipt_method는 필수 항목입니다"
	}
	if !validReceiptMethods[req.ReceiptMethod] {
		return "receipt_method는 \"purchase_order\", \"phone\", \"email\", \"other\" 중 하나여야 합니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.UnitPriceWp <= 0 {
		return "unit_price_wp는 양수여야 합니다"
	}
	if req.Status == "" {
		return "status는 필수 항목입니다"
	}
	if !validOrderStatuses[req.Status] {
		return "status는 \"received\", \"partial\", \"completed\", \"cancelled\" 중 하나여야 합니다"
	}
	// 비유: management_category는 기본값 "sale" — 입력 시에만 검증
	if req.ManagementCategory != "" && !validManagementCategories[req.ManagementCategory] {
		return "management_category는 \"sale\", \"construction\", \"spare\", \"repowering\", \"maintenance\", \"other\" 중 하나여야 합니다"
	}
	// 비유: fulfillment_source는 기본값 "stock" — 입력 시에만 검증
	if req.FulfillmentSource != "" && !validFulfillmentSources[req.FulfillmentSource] {
		return "fulfillment_source는 \"stock\", \"incoming\" 중 하나여야 합니다"
	}
	if req.DepositRate != nil && (*req.DepositRate < 0 || *req.DepositRate > 100) {
		return "deposit_rate는 0~100 범위여야 합니다"
	}
	if req.SpareQty != nil && *req.SpareQty <= 0 {
		return "spare_qty는 양수여야 합니다"
	}
	return ""
}

// UpdateOrderRequest — 수주 수정 시 클라이언트가 보내는 데이터
// 비유: "수주 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateOrderRequest struct {
	OrderNumber   *string  `json:"order_number,omitempty"`
	CompanyID     *string  `json:"company_id,omitempty"`
	CustomerID    *string  `json:"customer_id,omitempty"`
	OrderDate     *string  `json:"order_date,omitempty"`
	ReceiptMethod *string  `json:"receipt_method,omitempty"`
	ProductID     *string  `json:"product_id,omitempty"`
	Quantity      *int     `json:"quantity,omitempty"`
	CapacityKw    *float64 `json:"capacity_kw,omitempty"`
	UnitPriceWp   *float64 `json:"unit_price_wp,omitempty"`
	SiteID        *string  `json:"site_id,omitempty"`
	SiteName      *string  `json:"site_name,omitempty"`
	SiteAddress   *string  `json:"site_address,omitempty"`
	SiteContact   *string  `json:"site_contact,omitempty"`
	SitePhone     *string  `json:"site_phone,omitempty"`
	PaymentTerms  *string  `json:"payment_terms,omitempty"`
	DepositRate   *float64 `json:"deposit_rate,omitempty"`
	DeliveryDue   *string  `json:"delivery_due,omitempty"`
	ShippedQty    *int     `json:"shipped_qty,omitempty"`
	RemainingQty  *int     `json:"remaining_qty,omitempty"`
	Status             *string  `json:"status,omitempty"`
	ManagementCategory *string  `json:"management_category,omitempty"`
	FulfillmentSource  *string  `json:"fulfillment_source,omitempty"`
	SpareQty           *int     `json:"spare_qty,omitempty"`
	Memo               *string  `json:"memo,omitempty"`
}

// Validate — 수주 수정 요청의 입력값을 검증
func (req *UpdateOrderRequest) Validate() string {
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.CustomerID != nil && *req.CustomerID == "" {
		return "customer_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.ReceiptMethod != nil && !validReceiptMethods[*req.ReceiptMethod] {
		return "receipt_method는 \"purchase_order\", \"phone\", \"email\", \"other\" 중 하나여야 합니다"
	}
	if req.ProductID != nil && *req.ProductID == "" {
		return "product_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.UnitPriceWp != nil && *req.UnitPriceWp <= 0 {
		return "unit_price_wp는 양수여야 합니다"
	}
	if req.Status != nil && !validOrderStatuses[*req.Status] {
		return "status는 \"received\", \"partial\", \"completed\", \"cancelled\" 중 하나여야 합니다"
	}
	if req.ManagementCategory != nil && !validManagementCategories[*req.ManagementCategory] {
		return "management_category는 \"sale\", \"construction\", \"spare\", \"repowering\", \"maintenance\", \"other\" 중 하나여야 합니다"
	}
	if req.FulfillmentSource != nil && !validFulfillmentSources[*req.FulfillmentSource] {
		return "fulfillment_source는 \"stock\", \"incoming\" 중 하나여야 합니다"
	}
	if req.DepositRate != nil && (*req.DepositRate < 0 || *req.DepositRate > 100) {
		return "deposit_rate는 0~100 범위여야 합니다"
	}
	if req.SpareQty != nil && *req.SpareQty <= 0 {
		return "spare_qty는 양수여야 합니다"
	}
	return ""
}
