package model

import (
	"time"
	"unicode/utf8"
)

// WarehouseLocation — D-139 창고 내 위치(Bin/Location).
//
// 비유: "창고 안 우편번호" — 창고 단위가 아닌 패널 1팔레트 단위 정확 위치.
// Zone(존) > Aisle(통로) > Rack(랙) > Bin(빈) 4단계 — 단계 일부 생략 가능.
type WarehouseLocation struct {
	LocationID       string     `json:"location_id"`
	WarehouseID      string     `json:"warehouse_id"`
	Zone             *string    `json:"zone,omitempty"`
	Aisle            *string    `json:"aisle,omitempty"`
	Rack             *string    `json:"rack,omitempty"`
	Bin              *string    `json:"bin,omitempty"`
	LocationCode     string     `json:"location_code"`
	CapacityQty      *int       `json:"capacity_qty,omitempty"`
	WeightCapacityKg *float64   `json:"weight_capacity_kg,omitempty"`
	LocationType     string     `json:"location_type"` // storage|staging|receiving|shipping|damaged|reserved
	Notes            *string    `json:"notes,omitempty"`
	IsActive         bool       `json:"is_active"`
	CreatedAt        *time.Time `json:"created_at,omitempty"`
	UpdatedAt        *time.Time `json:"updated_at,omitempty"`
}

// CreateWarehouseLocationRequest — 등록 요청.
type CreateWarehouseLocationRequest struct {
	WarehouseID      string   `json:"warehouse_id"`
	LocationCode     string   `json:"location_code"`
	Zone             *string  `json:"zone,omitempty"`
	Aisle            *string  `json:"aisle,omitempty"`
	Rack             *string  `json:"rack,omitempty"`
	Bin              *string  `json:"bin,omitempty"`
	CapacityQty      *int     `json:"capacity_qty,omitempty"`
	WeightCapacityKg *float64 `json:"weight_capacity_kg,omitempty"`
	LocationType     *string  `json:"location_type,omitempty"`
	Notes            *string  `json:"notes,omitempty"`
}

// Validate — 필수값/길이 검증.
func (req *CreateWarehouseLocationRequest) Validate() string {
	if req.WarehouseID == "" {
		return "warehouse_id는 필수입니다"
	}
	if req.LocationCode == "" {
		return "location_code는 필수입니다 (예: A-01-R03-B12)"
	}
	if utf8.RuneCountInString(req.LocationCode) > 64 {
		return "location_code는 64자를 초과할 수 없습니다"
	}
	if req.LocationType != nil {
		switch *req.LocationType {
		case "storage", "staging", "receiving", "shipping", "damaged", "reserved":
		default:
			return "location_type은 storage/staging/receiving/shipping/damaged/reserved 중 하나여야 합니다"
		}
	}
	if req.CapacityQty != nil && *req.CapacityQty < 0 {
		return "capacity_qty는 0 이상이어야 합니다"
	}
	if req.WeightCapacityKg != nil && *req.WeightCapacityKg < 0 {
		return "weight_capacity_kg는 0 이상이어야 합니다"
	}
	return ""
}

// UpdateWarehouseLocationRequest — 수정 요청 (필드 부분 업데이트).
type UpdateWarehouseLocationRequest struct {
	LocationCode     *string  `json:"location_code,omitempty"`
	Zone             *string  `json:"zone,omitempty"`
	Aisle            *string  `json:"aisle,omitempty"`
	Rack             *string  `json:"rack,omitempty"`
	Bin              *string  `json:"bin,omitempty"`
	CapacityQty      *int     `json:"capacity_qty,omitempty"`
	WeightCapacityKg *float64 `json:"weight_capacity_kg,omitempty"`
	LocationType     *string  `json:"location_type,omitempty"`
	Notes            *string  `json:"notes,omitempty"`
	IsActive         *bool    `json:"is_active,omitempty"`
}
