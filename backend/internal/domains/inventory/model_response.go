package inventory

// InventoryResponse — Rust 재고 집계 엔진의 응답 구조체 (Go 측)
// 비유: "재고 현황 보고서" — Rust에서 계산한 결과를 Go가 받아 전달
type InventoryResponse struct {
	Items        []InventoryItem  `json:"items"`
	Summary      InventorySummary `json:"summary"`
	CalculatedAt string           `json:"calculated_at"`
}

// InventoryItem — 품번별 재고 상세
type InventoryItem struct {
	ProductID           string  `json:"product_id"`
	ProductCode         string  `json:"product_code"`
	ProductName         string  `json:"product_name"`
	ManufacturerName    string  `json:"manufacturer_name"`
	SpecWP              int     `json:"spec_wp"`
	ModuleWidthMM       int     `json:"module_width_mm"`
	ModuleHeightMM      int     `json:"module_height_mm"`
	PhysicalKW          float64 `json:"physical_kw"`
	ReservedKW          float64 `json:"reserved_kw"`
	AllocatedKW         float64 `json:"allocated_kw"`
	AvailableKW         float64 `json:"available_kw"`
	IncomingKW          float64 `json:"incoming_kw"`
	IncomingReservedKW  float64 `json:"incoming_reserved_kw"`
	AvailableIncomingKW float64 `json:"available_incoming_kw"`
	TotalSecuredKW      float64 `json:"total_secured_kw"`
	LongTermStatus      string  `json:"long_term_status"`
}

// InventorySummary — 전체 합계
type InventorySummary struct {
	TotalPhysicalKW  float64 `json:"total_physical_kw"`
	TotalAvailableKW float64 `json:"total_available_kw"`
	TotalIncomingKW  float64 `json:"total_incoming_kw"`
	TotalSecuredKW   float64 `json:"total_secured_kw"`
}
