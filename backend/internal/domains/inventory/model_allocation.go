package inventory

import (
	"slices"

	"solarflow-backend/internal/dbschema"
	"solarflow-backend/internal/validation"
)

// InventoryAllocation — 가용재고 배정 (판매예정/공사예정)
// B/L 입고 전 또는 현재고를 특정 용도로 미리 배정하여 가용재고를 관리
type InventoryAllocation struct {
	AllocID            string   `json:"alloc_id"`
	CompanyID          string   `json:"company_id"`
	ProductID          string   `json:"product_id"`
	ProductName        *string  `json:"product_name,omitempty"`
	ProductCode        *string  `json:"product_code,omitempty"`
	SpecWp             *float64 `json:"spec_wp,omitempty"`
	Quantity           int      `json:"quantity"`
	CapacityKw         *float64 `json:"capacity_kw"`
	Purpose            string   `json:"purpose"`     // sale | construction | other
	SourceType         string   `json:"source_type"` // stock | incoming
	CustomerName       *string  `json:"customer_name"`
	SiteName           *string  `json:"site_name"`
	Notes              *string  `json:"notes"`
	ExpectedPricePerWp *float64 `json:"expected_price_per_wp,omitempty"`
	FreeSpareQty       int      `json:"free_spare_qty"`
	Status             string   `json:"status"` // pending | confirmed | cancelled | hold
	OutboundID         *string  `json:"outbound_id"`
	OrderID            *string  `json:"order_id"`
	GroupID            *string  `json:"group_id,omitempty"`
	SiteID             *string  `json:"site_id,omitempty"`
	BLID               *string  `json:"bl_id,omitempty"`     // 원가 추적용 BL 연결
	BLNumber           *string  `json:"bl_number,omitempty"` // 조회용 (JOIN 없이 표시)
	LocationID         *string  `json:"location_id,omitempty"`
	CreatedAt          string   `json:"created_at"`
	UpdatedAt          string   `json:"updated_at"`
}

// 허용 값 정본: inventory_allocations 테이블 CHECK 자동 추출:
//   - purpose     → dbschema.InventoryAllocationsPurposeValues
//   - source_type → dbschema.InventoryAllocationsSourceTypeValues
//   - status      → dbschema.InventoryAllocationsStatusValues

// CreateInventoryAllocationRequest — 배정 등록 요청
type CreateInventoryAllocationRequest struct {
	CompanyID          string   `json:"company_id"`
	ProductID          string   `json:"product_id"`
	Quantity           int      `json:"quantity"`
	CapacityKw         *float64 `json:"capacity_kw,omitempty"`
	Purpose            string   `json:"purpose"`
	SourceType         string   `json:"source_type"`
	CustomerName       *string  `json:"customer_name,omitempty"`
	SiteName           *string  `json:"site_name,omitempty"`
	Notes              *string  `json:"notes,omitempty"`
	ExpectedPricePerWp *float64 `json:"expected_price_per_wp,omitempty"`
	FreeSpareQty       int      `json:"free_spare_qty,omitempty"`
	GroupID            *string  `json:"group_id,omitempty"`
	SiteID             *string  `json:"site_id,omitempty"`
	BLID               *string  `json:"bl_id,omitempty"`
	Status             string   `json:"status,omitempty"`
	OutboundID         *string  `json:"outbound_id,omitempty"`
	OrderID            *string  `json:"order_id,omitempty"`
	LocationID         *string  `json:"location_id,omitempty"`
}

func (req *CreateInventoryAllocationRequest) Validate() string {
	if req.CompanyID == "" {
		return "company_id는 필수입니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수입니다"
	}
	if req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if !slices.Contains(dbschema.InventoryAllocationsPurposeValues, req.Purpose) {
		return "purpose는 " + validation.FormatAllowedValues(dbschema.InventoryAllocationsPurposeValues)
	}
	if req.SourceType == "" {
		req.SourceType = "stock"
	}
	if !slices.Contains(dbschema.InventoryAllocationsSourceTypeValues, req.SourceType) {
		return "source_type은 " + validation.FormatAllowedValues(dbschema.InventoryAllocationsSourceTypeValues)
	}
	if req.Status != "" && !slices.Contains(dbschema.InventoryAllocationsStatusValues, req.Status) {
		return "status는 " + validation.FormatAllowedValues(dbschema.InventoryAllocationsStatusValues)
	}
	return ""
}

// UpdateInventoryAllocationRequest — 배정 수정/확정/취소/보류 요청
type UpdateInventoryAllocationRequest struct {
	Quantity           *int     `json:"quantity,omitempty"`
	CapacityKw         *float64 `json:"capacity_kw,omitempty"`
	Purpose            *string  `json:"purpose,omitempty"`
	SourceType         *string  `json:"source_type,omitempty"`
	CustomerName       *string  `json:"customer_name,omitempty"`
	SiteName           *string  `json:"site_name,omitempty"`
	Notes              *string  `json:"notes,omitempty"`
	ExpectedPricePerWp *float64 `json:"expected_price_per_wp,omitempty"`
	FreeSpareQty       *int     `json:"free_spare_qty,omitempty"`
	Status             *string  `json:"status,omitempty"`
	OutboundID         *string  `json:"outbound_id,omitempty"`
	OrderID            *string  `json:"order_id,omitempty"`
	BLID               *string  `json:"bl_id,omitempty"`
	LocationID         *string  `json:"location_id,omitempty"`
}

func (req *UpdateInventoryAllocationRequest) Validate() string {
	if req.Purpose != nil && !slices.Contains(dbschema.InventoryAllocationsPurposeValues, *req.Purpose) {
		return "purpose는 " + validation.FormatAllowedValues(dbschema.InventoryAllocationsPurposeValues)
	}
	if req.SourceType != nil && !slices.Contains(dbschema.InventoryAllocationsSourceTypeValues, *req.SourceType) {
		return "source_type은 " + validation.FormatAllowedValues(dbschema.InventoryAllocationsSourceTypeValues)
	}
	if req.Status != nil && !slices.Contains(dbschema.InventoryAllocationsStatusValues, *req.Status) {
		return "status는 " + validation.FormatAllowedValues(dbschema.InventoryAllocationsStatusValues)
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	return ""
}
