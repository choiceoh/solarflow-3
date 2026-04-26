package model

// OutboundBLItem — 출고-BL 연결 항목 (분할선적 지원)
type OutboundBLItem struct {
	OutboundBLItemID string  `json:"outbound_bl_item_id"`
	OutboundID       string  `json:"outbound_id"`
	BLID             string  `json:"bl_id"`
	BLNumber         *string `json:"bl_number,omitempty"`
	Quantity         int     `json:"quantity"`
}

// OutboundBLItemInput — 출고 등록/수정 시 BL 연결 입력
type OutboundBLItemInput struct {
	BLID     string `json:"bl_id"`
	Quantity int    `json:"quantity"`
}

// Outbound — 출고 정보를 담는 구조체
// 비유: "출고 전표" — 어떤 품번을, 어디서, 몇 장, 어떤 용도로 출고했는지 기록
type Outbound struct {
	OutboundID        string           `json:"outbound_id"`
	OutboundDate      string           `json:"outbound_date"`
	CompanyID         string           `json:"company_id"`
	CompanyName       *string          `json:"company_name,omitempty"`
	ProductID         string           `json:"product_id"`
	ProductName       *string          `json:"product_name,omitempty"`
	ProductCode       *string          `json:"product_code,omitempty"`
	SpecWp            *float64         `json:"spec_wp,omitempty"`
	WattageKw         *float64         `json:"wattage_kw,omitempty"`
	Quantity          int              `json:"quantity"`
	CapacityKw        *float64         `json:"capacity_kw"`
	WarehouseID       string           `json:"warehouse_id"`
	WarehouseName     *string          `json:"warehouse_name,omitempty"`
	UsageCategory     string           `json:"usage_category"`
	OrderID           *string          `json:"order_id"`
	OrderNumber       *string          `json:"order_number,omitempty"`
	CustomerID        *string          `json:"customer_id,omitempty"`
	CustomerName      *string          `json:"customer_name,omitempty"`
	UnitPriceWp       *float64         `json:"unit_price_wp,omitempty"`
	SiteName          *string          `json:"site_name"`
	SiteAddress       *string          `json:"site_address"`
	SpareQty          *int             `json:"spare_qty"`
	GroupTrade        *bool            `json:"group_trade"`
	TargetCompanyID   *string          `json:"target_company_id"`
	TargetCompanyName *string          `json:"target_company_name,omitempty"`
	ErpOutboundNo     *string          `json:"erp_outbound_no"`
	Status            string           `json:"status"`
	Memo              *string          `json:"memo"`
	BLID              *string          `json:"bl_id"`
	BLItems           []OutboundBLItem `json:"bl_items,omitempty"`
	Sale              *Sale            `json:"sale,omitempty"`
}

// 허용되는 출고 usage_category 값 (ERP 관리구분 기반 재설계)
var validOutboundUsageCategories = map[string]bool{
	"sale":                true,
	"sale_spare":          true,
	"construction":        true,
	"construction_damage": true,
	"repowering":          true,
	"maintenance":         true,
	"disposal":            true,
	"transfer":            true,
	"adjustment":          true,
	"other":               true,
}

// 허용되는 출고 status 값 (3단계: 활성/취소대기/취소완료)
var validOutboundStatuses = map[string]bool{
	"active":         true,
	"cancel_pending": true,
	"cancelled":      true,
}

// CreateOutboundRequest — 출고 등록 시 클라이언트가 보내는 데이터
// 비유: "출고 등록 신청서" — 출고일, 법인, 품번, 수량, 창고, 용도를 필수 기재
type CreateOutboundRequest struct {
	OutboundDate    string                `json:"outbound_date"`
	CompanyID       string                `json:"company_id"`
	ProductID       string                `json:"product_id"`
	Quantity        int                   `json:"quantity"`
	CapacityKw      *float64              `json:"capacity_kw"`
	WarehouseID     string                `json:"warehouse_id"`
	UsageCategory   string                `json:"usage_category"`
	OrderID         *string               `json:"order_id"`
	SiteName        *string               `json:"site_name"`
	SiteAddress     *string               `json:"site_address"`
	SpareQty        *int                  `json:"spare_qty"`
	GroupTrade      *bool                 `json:"group_trade"`
	TargetCompanyID *string               `json:"target_company_id"`
	ErpOutboundNo   *string               `json:"erp_outbound_no"`
	Status          string                `json:"status"`
	Memo            *string               `json:"memo"`
	BLID            *string               `json:"bl_id"`
	BLItems         []OutboundBLItemInput `json:"bl_items,omitempty"`
}

// Validate — 출고 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 출고 신청서 필수 항목, 허용 값, 그룹 내 거래 조건 확인
func (req *CreateOutboundRequest) Validate() string {
	if req.OutboundDate == "" {
		return "outbound_date는 필수 항목입니다"
	}
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.WarehouseID == "" {
		return "warehouse_id는 필수 항목입니다"
	}
	if req.UsageCategory == "" {
		return "usage_category는 필수 항목입니다"
	}
	if !validOutboundUsageCategories[req.UsageCategory] {
		return "usage_category는 허용된 값이 아닙니다 (sale/sale_spare/construction/construction_damage/repowering/maintenance/disposal/transfer/adjustment/other)"
	}
	// 비유: status는 기본값 "active" — 입력 시에만 검증
	if req.Status != "" && !validOutboundStatuses[req.Status] {
		return "status는 \"active\", \"cancel_pending\", \"cancelled\" 중 하나여야 합니다"
	}
	if req.SpareQty != nil && *req.SpareQty <= 0 {
		return "spare_qty는 양수여야 합니다"
	}
	// 비유: 그룹 내 거래이면 상대 법인을 반드시 지정해야 함
	if req.GroupTrade != nil && *req.GroupTrade && (req.TargetCompanyID == nil || *req.TargetCompanyID == "") {
		return "group_trade가 true이면 target_company_id는 필수입니다"
	}
	return ""
}

// UpdateOutboundRequest — 출고 수정 시 클라이언트가 보내는 데이터
// 비유: "출고 전표 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateOutboundRequest struct {
	OutboundDate    *string               `json:"outbound_date,omitempty"`
	CompanyID       *string               `json:"company_id,omitempty"`
	ProductID       *string               `json:"product_id,omitempty"`
	Quantity        *int                  `json:"quantity,omitempty"`
	CapacityKw      *float64              `json:"capacity_kw,omitempty"`
	WarehouseID     *string               `json:"warehouse_id,omitempty"`
	UsageCategory   *string               `json:"usage_category,omitempty"`
	OrderID         *string               `json:"order_id,omitempty"`
	SiteName        *string               `json:"site_name,omitempty"`
	SiteAddress     *string               `json:"site_address,omitempty"`
	SpareQty        *int                  `json:"spare_qty,omitempty"`
	GroupTrade      *bool                 `json:"group_trade,omitempty"`
	TargetCompanyID *string               `json:"target_company_id,omitempty"`
	ErpOutboundNo   *string               `json:"erp_outbound_no,omitempty"`
	Status          *string               `json:"status,omitempty"`
	Memo            *string               `json:"memo,omitempty"`
	BLID            *string               `json:"bl_id,omitempty"`
	BLItems         []OutboundBLItemInput `json:"bl_items,omitempty"`
}

// Validate — 출고 수정 요청의 입력값을 검증
func (req *UpdateOutboundRequest) Validate() string {
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.ProductID != nil && *req.ProductID == "" {
		return "product_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.Quantity != nil && *req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	if req.WarehouseID != nil && *req.WarehouseID == "" {
		return "warehouse_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.UsageCategory != nil && !validOutboundUsageCategories[*req.UsageCategory] {
		return "usage_category는 허용된 값이 아닙니다 (sale/sale_spare/construction/construction_damage/repowering/maintenance/disposal/transfer/adjustment/other)"
	}
	if req.Status != nil && !validOutboundStatuses[*req.Status] {
		return "status는 \"active\", \"cancel_pending\", \"cancelled\" 중 하나여야 합니다"
	}
	if req.SpareQty != nil && *req.SpareQty <= 0 {
		return "spare_qty는 양수여야 합니다"
	}
	if req.GroupTrade != nil && *req.GroupTrade && (req.TargetCompanyID == nil || *req.TargetCompanyID == "") {
		return "group_trade가 true이면 target_company_id는 필수입니다"
	}
	return ""
}
