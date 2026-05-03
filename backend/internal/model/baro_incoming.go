package model

// BaroIncomingItem — BARO 영업용 입고예정 한 줄
// 비유: 선적 서류에서 가격표를 떼고 "언제, 어떤 모듈이 몇 장 들어오는지"만 남긴 안내 카드
type BaroIncomingItem struct {
	ID                 string  `json:"id"`
	BLID               string  `json:"bl_id"`
	BLNumber           string  `json:"bl_number"`
	CompanyID          string  `json:"company_id"`
	CompanyName        *string `json:"company_name,omitempty"`
	ManufacturerID     string  `json:"manufacturer_id"`
	ManufacturerName   *string `json:"manufacturer_name,omitempty"`
	InboundType        string  `json:"inbound_type"`
	Status             string  `json:"status"`
	ETD                *string `json:"etd,omitempty"`
	ETA                *string `json:"eta,omitempty"`
	ActualArrival      *string `json:"actual_arrival,omitempty"`
	SalesAvailableDate *string `json:"sales_available_date,omitempty"`
	Port               *string `json:"port,omitempty"`
	WarehouseID        *string `json:"warehouse_id,omitempty"`
	WarehouseName      *string `json:"warehouse_name,omitempty"`
	ProductID          string  `json:"product_id"`
	ProductCode        *string `json:"product_code,omitempty"`
	ProductName        *string `json:"product_name,omitempty"`
	SpecWP             *int    `json:"spec_wp,omitempty"`
	ModuleWidthMM      *int    `json:"module_width_mm,omitempty"`
	ModuleHeightMM     *int    `json:"module_height_mm,omitempty"`
	Quantity           int     `json:"quantity"`
	CapacityKW         float64 `json:"capacity_kw"`
}
