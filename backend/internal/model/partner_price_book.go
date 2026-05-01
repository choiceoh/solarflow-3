package model

import "time"

// PartnerPrice — BARO Phase 1: 거래처별 품번 표준단가
// 비유: "거래처 단가표" — 같은 패널이라도 거래처마다 가격이 다른 현실을 한 줄로 잠그는 것
type PartnerPrice struct {
	PriceID       string     `json:"price_id"`
	PartnerID     string     `json:"partner_id"`
	ProductID     string     `json:"product_id"`
	UnitPriceWp   float64    `json:"unit_price_wp"`
	DiscountPct   float64    `json:"discount_pct"`
	EffectiveFrom string     `json:"effective_from"`
	EffectiveTo   *string    `json:"effective_to"`
	Memo          *string    `json:"memo"`
	TenantScope   string     `json:"tenant_scope"`
	CreatedBy     *string    `json:"created_by"`
	CreatedAt     *time.Time `json:"created_at,omitempty"`
	UpdatedAt     *time.Time `json:"updated_at,omitempty"`
}

// CreatePartnerPriceRequest — 단가 등록 요청
type CreatePartnerPriceRequest struct {
	PartnerID     string  `json:"partner_id"`
	ProductID     string  `json:"product_id"`
	UnitPriceWp   float64 `json:"unit_price_wp"`
	DiscountPct   float64 `json:"discount_pct"`
	EffectiveFrom string  `json:"effective_from"`
	EffectiveTo   *string `json:"effective_to,omitempty"`
	Memo          *string `json:"memo,omitempty"`
}

// Validate — 등록 요청 검증
func (req *CreatePartnerPriceRequest) Validate() string {
	if req.PartnerID == "" {
		return "partner_id는 필수 항목입니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.UnitPriceWp < 0 {
		return "unit_price_wp는 0 이상이어야 합니다"
	}
	if req.DiscountPct < 0 || req.DiscountPct > 100 {
		return "discount_pct는 0~100 범위여야 합니다"
	}
	if req.EffectiveFrom == "" {
		return "effective_from은 필수 항목입니다"
	}
	if req.EffectiveTo != nil && *req.EffectiveTo != "" && *req.EffectiveTo < req.EffectiveFrom {
		return "effective_to는 effective_from 이후여야 합니다"
	}
	return ""
}

// UpdatePartnerPriceRequest — 단가 수정 요청
type UpdatePartnerPriceRequest struct {
	UnitPriceWp   *float64 `json:"unit_price_wp,omitempty"`
	DiscountPct   *float64 `json:"discount_pct,omitempty"`
	EffectiveFrom *string  `json:"effective_from,omitempty"`
	EffectiveTo   *string  `json:"effective_to,omitempty"`
	Memo          *string  `json:"memo,omitempty"`
}

// Validate — 수정 요청 검증
func (req *UpdatePartnerPriceRequest) Validate() string {
	if req.UnitPriceWp != nil && *req.UnitPriceWp < 0 {
		return "unit_price_wp는 0 이상이어야 합니다"
	}
	if req.DiscountPct != nil && (*req.DiscountPct < 0 || *req.DiscountPct > 100) {
		return "discount_pct는 0~100 범위여야 합니다"
	}
	return ""
}
