package model

// BaroPurchaseHistoryItem — BARO 자체 매입 원가/구매이력 한 줄
type BaroPurchaseHistoryItem struct {
	ID                   string   `json:"id"`
	BLID                 string   `json:"bl_id"`
	BLNumber             string   `json:"bl_number"`
	POID                 *string  `json:"po_id,omitempty"`
	PONumber             *string  `json:"po_number,omitempty"`
	CompanyID            string   `json:"company_id"`
	CompanyName          *string  `json:"company_name,omitempty"`
	ManufacturerID       string   `json:"manufacturer_id"`
	ManufacturerName     *string  `json:"manufacturer_name,omitempty"`
	SourceName           *string  `json:"source_name,omitempty"`
	InboundType          string   `json:"inbound_type"`
	Status               string   `json:"status"`
	Currency             string   `json:"currency"`
	ExchangeRate         *float64 `json:"exchange_rate,omitempty"`
	ETD                  *string  `json:"etd,omitempty"`
	ETA                  *string  `json:"eta,omitempty"`
	ActualArrival        *string  `json:"actual_arrival,omitempty"`
	PurchaseDate         *string  `json:"purchase_date,omitempty"`
	Port                 *string  `json:"port,omitempty"`
	WarehouseID          *string  `json:"warehouse_id,omitempty"`
	WarehouseName        *string  `json:"warehouse_name,omitempty"`
	ProductID            string   `json:"product_id"`
	ProductCode          *string  `json:"product_code,omitempty"`
	ProductName          *string  `json:"product_name,omitempty"`
	SpecWP               *int     `json:"spec_wp,omitempty"`
	ModuleWidthMM        *int     `json:"module_width_mm,omitempty"`
	ModuleHeightMM       *int     `json:"module_height_mm,omitempty"`
	Quantity             int      `json:"quantity"`
	CapacityKW           float64  `json:"capacity_kw"`
	ItemType             string   `json:"item_type"`
	PaymentType          string   `json:"payment_type"`
	UsageCategory        string   `json:"usage_category"`
	UnitPriceUSDWp       *float64 `json:"unit_price_usd_wp,omitempty"`
	UnitPriceKRWWp       *float64 `json:"unit_price_krw_wp,omitempty"`
	InvoiceAmountUSD     *float64 `json:"invoice_amount_usd,omitempty"`
	EstimatedAmountUSD   *float64 `json:"estimated_amount_usd,omitempty"`
	EstimatedAmountKRW   *float64 `json:"estimated_amount_krw,omitempty"`
	PaymentTerms         *string  `json:"payment_terms,omitempty"`
	Incoterms            *string  `json:"incoterms,omitempty"`
	CounterpartCompanyID *string  `json:"counterpart_company_id,omitempty"`
}
