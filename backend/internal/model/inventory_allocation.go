package model

// InventoryAllocation — 가용재고 배정 (판매예정/공사예정)
// B/L 입고 전 또는 현재고를 특정 용도로 미리 배정하여 가용재고를 관리
type InventoryAllocation struct {
	AllocID      string   `json:"alloc_id"`
	CompanyID    string   `json:"company_id"`
	ProductID    string   `json:"product_id"`
	ProductName  *string  `json:"product_name,omitempty"`
	ProductCode  *string  `json:"product_code,omitempty"`
	SpecWp       *float64 `json:"spec_wp,omitempty"`
	Quantity     int      `json:"quantity"`
	CapacityKw   *float64 `json:"capacity_kw"`
	Purpose      string   `json:"purpose"`      // sale | construction | other
	SourceType   string   `json:"source_type"`  // stock | incoming
	CustomerName *string  `json:"customer_name"`
	SiteName     *string  `json:"site_name"`
	Notes        *string  `json:"notes"`
	Status       string   `json:"status"`       // pending | confirmed | cancelled
	OutboundID   *string  `json:"outbound_id"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
}

var validAllocPurposes = map[string]bool{"sale": true, "construction": true, "other": true}
var validAllocSources = map[string]bool{"stock": true, "incoming": true}
var validAllocStatuses = map[string]bool{"pending": true, "confirmed": true, "cancelled": true}

// CreateInventoryAllocationRequest — 배정 등록 요청
type CreateInventoryAllocationRequest struct {
	CompanyID    string   `json:"company_id"`
	ProductID    string   `json:"product_id"`
	Quantity     int      `json:"quantity"`
	CapacityKw   *float64 `json:"capacity_kw,omitempty"`
	Purpose      string   `json:"purpose"`
	SourceType   string   `json:"source_type"`
	CustomerName *string  `json:"customer_name,omitempty"`
	SiteName     *string  `json:"site_name,omitempty"`
	Notes        *string  `json:"notes,omitempty"`
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
	if !validAllocPurposes[req.Purpose] {
		return "purpose는 sale | construction | other 중 하나여야 합니다"
	}
	if req.SourceType == "" {
		req.SourceType = "stock"
	}
	if !validAllocSources[req.SourceType] {
		return "source_type은 stock | incoming 중 하나여야 합니다"
	}
	return ""
}

// UpdateInventoryAllocationRequest — 배정 수정/확정/취소 요청
type UpdateInventoryAllocationRequest struct {
	Quantity     *int     `json:"quantity,omitempty"`
	CapacityKw   *float64 `json:"capacity_kw,omitempty"`
	Purpose      *string  `json:"purpose,omitempty"`
	SourceType   *string  `json:"source_type,omitempty"`
	CustomerName *string  `json:"customer_name,omitempty"`
	SiteName     *string  `json:"site_name,omitempty"`
	Notes        *string  `json:"notes,omitempty"`
	Status       *string  `json:"status,omitempty"`
	OutboundID   *string  `json:"outbound_id,omitempty"`
}

func (req *UpdateInventoryAllocationRequest) Validate() string {
	if req.Purpose != nil && !validAllocPurposes[*req.Purpose] {
		return "purpose는 sale | construction | other 중 하나여야 합니다"
	}
	if req.SourceType != nil && !validAllocSources[*req.SourceType] {
		return "source_type은 stock | incoming 중 하나여야 합니다"
	}
	if req.Status != nil && !validAllocStatuses[*req.Status] {
		return "status는 pending | confirmed | cancelled 중 하나여야 합니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	return ""
}
