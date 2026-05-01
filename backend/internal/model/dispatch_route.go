package model

// DispatchRoute — BARO Phase 4: 일 단위 배차 묶음
// 비유: "배송 일정표" — 같은 날 같은 차량으로 나가는 출고들을 묶는 단위
type DispatchRoute struct {
	RouteID      string  `json:"route_id"`
	RouteDate    string  `json:"route_date"`
	VehicleType  *string `json:"vehicle_type"`
	VehiclePlate *string `json:"vehicle_plate"`
	DriverName   *string `json:"driver_name"`
	DriverPhone  *string `json:"driver_phone"`
	Status       string  `json:"status"`
	Memo         *string `json:"memo"`
	TenantScope  string  `json:"tenant_scope"`
	CreatedBy    *string `json:"created_by"`
	CreatedAt    *string `json:"created_at,omitempty"`
	UpdatedAt    *string `json:"updated_at,omitempty"`
}

// CreateDispatchRouteRequest — 배차 등록 요청
type CreateDispatchRouteRequest struct {
	RouteDate    string  `json:"route_date"`
	VehicleType  *string `json:"vehicle_type,omitempty"`
	VehiclePlate *string `json:"vehicle_plate,omitempty"`
	DriverName   *string `json:"driver_name,omitempty"`
	DriverPhone  *string `json:"driver_phone,omitempty"`
	Memo         *string `json:"memo,omitempty"`
}

// Validate — 등록 요청 검증
func (req *CreateDispatchRouteRequest) Validate() string {
	if req.RouteDate == "" {
		return "route_date는 필수 항목입니다"
	}
	return ""
}

// UpdateDispatchRouteRequest — 배차 수정 요청
type UpdateDispatchRouteRequest struct {
	RouteDate    *string `json:"route_date,omitempty"`
	VehicleType  *string `json:"vehicle_type,omitempty"`
	VehiclePlate *string `json:"vehicle_plate,omitempty"`
	DriverName   *string `json:"driver_name,omitempty"`
	DriverPhone  *string `json:"driver_phone,omitempty"`
	Status       *string `json:"status,omitempty"`
	Memo         *string `json:"memo,omitempty"`
}

// Validate — 수정 요청 검증
func (req *UpdateDispatchRouteRequest) Validate() string {
	if req.Status != nil {
		s := *req.Status
		if s != "planned" && s != "dispatched" && s != "completed" && s != "cancelled" {
			return "status는 planned/dispatched/completed/cancelled 중 하나여야 합니다"
		}
	}
	return ""
}

// AssignOutboundRequest — 출고를 배차에 할당하는 요청 본문
type AssignOutboundRequest struct {
	OutboundID string `json:"outbound_id"`
}
