package model

// ConstructionSite — 공사 현장 마스터
// 자체 현장(own)과 타사 EPC 현장(epc)을 구분하여 관리하고
// 현장별 모듈 공급 이력을 추적하기 위한 마스터 데이터
type ConstructionSite struct {
	SiteID      string   `json:"site_id"`
	CompanyID   string   `json:"company_id"`
	Name        string   `json:"name"`         // 발전소명 (예: "영광 갈동 태양광 1호기")
	Location    *string  `json:"location"`     // 지명    (예: "전남 영광군 갈동리")
	SiteType    string   `json:"site_type"`    // 'own'(자체) | 'epc'(타사 EPC)
	CapacityMw  *float64 `json:"capacity_mw"`  // 발전소 설비용량 MW (선택)
	StartedAt   *string  `json:"started_at"`   // 착공일 (선택)
	CompletedAt *string  `json:"completed_at"` // 준공일 (선택)
	Notes       *string  `json:"notes"`
	IsActive    bool     `json:"is_active"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

var validSiteTypes = map[string]bool{"own": true, "epc": true}

// CreateConstructionSiteRequest — 현장 등록 요청
type CreateConstructionSiteRequest struct {
	CompanyID   string   `json:"company_id"`
	Name        string   `json:"name"`
	Location    *string  `json:"location,omitempty"`
	SiteType    string   `json:"site_type"`
	CapacityMw  *float64 `json:"capacity_mw,omitempty"`
	StartedAt   *string  `json:"started_at,omitempty"`
	CompletedAt *string  `json:"completed_at,omitempty"`
	Notes       *string  `json:"notes,omitempty"`
}

func (req *CreateConstructionSiteRequest) Validate() string {
	if req.CompanyID == "" {
		return "company_id는 필수입니다"
	}
	if req.Name == "" {
		return "name(발전소명)은 필수입니다"
	}
	if !validSiteTypes[req.SiteType] {
		return "site_type은 own(자체) | epc(타사) 중 하나여야 합니다"
	}
	return ""
}

// UpdateConstructionSiteRequest — 현장 수정 요청
type UpdateConstructionSiteRequest struct {
	Name        *string  `json:"name,omitempty"`
	Location    *string  `json:"location,omitempty"`
	SiteType    *string  `json:"site_type,omitempty"`
	CapacityMw  *float64 `json:"capacity_mw,omitempty"`
	StartedAt   *string  `json:"started_at,omitempty"`
	CompletedAt *string  `json:"completed_at,omitempty"`
	Notes       *string  `json:"notes,omitempty"`
	IsActive    *bool    `json:"is_active,omitempty"`
}

func (req *UpdateConstructionSiteRequest) Validate() string {
	if req.SiteType != nil && !validSiteTypes[*req.SiteType] {
		return "site_type은 own(자체) | epc(타사) 중 하나여야 합니다"
	}
	if req.Name != nil && *req.Name == "" {
		return "name은 빈 값일 수 없습니다"
	}
	return ""
}
