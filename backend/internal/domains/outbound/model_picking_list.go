package outbound

import (
	"strconv"
	"time"
)

// PickingList — D-140 WMS Phase 2 피킹 명세 헤더.
//
// 비유: "창고 작업 지시서" — 출고 1건당 "어디서 몇 장 꺼낼지" 한 장.
// status 머신: pending → in_progress → completed (또는 cancelled).
type PickingList struct {
	PickingListID       string     `json:"picking_list_id"`
	OutboundID          *string    `json:"outbound_id,omitempty"`
	DispatchRouteID     *string    `json:"dispatch_route_id,omitempty"`
	WarehouseID         string     `json:"warehouse_id"`
	PartnerID           *string    `json:"partner_id,omitempty"`
	PartnerNameSnapshot *string    `json:"partner_name_snapshot,omitempty"`
	Status              string     `json:"status"`
	PickerUserID        *string    `json:"picker_user_id,omitempty"`
	CreatedAt           *time.Time `json:"created_at,omitempty"`
	CreatedBy           *string    `json:"created_by,omitempty"`
	StartedAt           *time.Time `json:"started_at,omitempty"`
	CompletedAt         *time.Time `json:"completed_at,omitempty"`
	Notes               *string    `json:"notes,omitempty"`
}

// PickingListItem — 피킹 라인 1건 (위치별 수량).
type PickingListItem struct {
	ItemID               string     `json:"item_id"`
	PickingListID        string     `json:"picking_list_id"`
	LineNo               int        `json:"line_no"`
	ProductID            *string    `json:"product_id,omitempty"`
	ProductCodeSnapshot  *string    `json:"product_code_snapshot,omitempty"`
	ProductNameSnapshot  *string    `json:"product_name_snapshot,omitempty"`
	SpecWpSnapshot       *int       `json:"spec_wp_snapshot,omitempty"`
	LocationID           *string    `json:"location_id,omitempty"`
	LocationCodeSnapshot *string    `json:"location_code_snapshot,omitempty"`
	QuantityPlanned      int        `json:"quantity_planned"`
	QuantityPicked       int        `json:"quantity_picked"`
	IsPicked             bool       `json:"is_picked"`
	PickedAt             *time.Time `json:"picked_at,omitempty"`
	PickedBy             *string    `json:"picked_by,omitempty"`
	VarianceNote         *string    `json:"variance_note,omitempty"`
}

// CreatePickingListRequest — 피킹 명세 생성 요청.
type CreatePickingListRequest struct {
	OutboundID          *string                        `json:"outbound_id,omitempty"`
	DispatchRouteID     *string                        `json:"dispatch_route_id,omitempty"`
	WarehouseID         string                         `json:"warehouse_id"`
	PartnerID           *string                        `json:"partner_id,omitempty"`
	PartnerNameSnapshot *string                        `json:"partner_name_snapshot,omitempty"`
	PickerUserID        *string                        `json:"picker_user_id,omitempty"`
	Notes               *string                        `json:"notes,omitempty"`
	Items               []CreatePickingListItemRequest `json:"items"`
}

type CreatePickingListItemRequest struct {
	ProductID            *string `json:"product_id,omitempty"`
	ProductCodeSnapshot  *string `json:"product_code_snapshot,omitempty"`
	ProductNameSnapshot  *string `json:"product_name_snapshot,omitempty"`
	SpecWpSnapshot       *int    `json:"spec_wp_snapshot,omitempty"`
	LocationID           *string `json:"location_id,omitempty"`
	LocationCodeSnapshot *string `json:"location_code_snapshot,omitempty"`
	QuantityPlanned      int     `json:"quantity_planned"`
}

func (req *CreatePickingListRequest) Validate() string {
	if req.WarehouseID == "" {
		return "warehouse_id는 필수입니다"
	}
	if len(req.Items) == 0 {
		return "items는 최소 1개 필요합니다"
	}
	for i, it := range req.Items {
		if it.QuantityPlanned <= 0 {
			return "items[" + strconv.Itoa(i) + "].quantity_planned는 양수여야 합니다"
		}
	}
	return ""
}

// UpdatePickingListItemRequest — 라인 picked 토글 + 차이 사유.
type UpdatePickingListItemRequest struct {
	QuantityPicked *int    `json:"quantity_picked,omitempty"`
	IsPicked       *bool   `json:"is_picked,omitempty"`
	VarianceNote   *string `json:"variance_note,omitempty"`
}

// UpdatePickingListRequest — 헤더 수정 (status / picker / notes).
type UpdatePickingListRequest struct {
	Status       *string `json:"status,omitempty"`
	PickerUserID *string `json:"picker_user_id,omitempty"`
	Notes        *string `json:"notes,omitempty"`
}
