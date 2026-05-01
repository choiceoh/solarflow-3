package model

// IntercompanyRequest — BARO Phase 2: 그룹내 매입 요청
// 비유: "발주 메모" — 바로(주)가 탑솔라에 "이 모듈 N장 보내주세요"를 한 줄로 적어 보내는 것
type IntercompanyRequest struct {
	RequestID          string  `json:"request_id"`
	RequesterCompanyID string  `json:"requester_company_id"`
	TargetCompanyID    string  `json:"target_company_id"`
	ProductID          string  `json:"product_id"`
	Quantity           int     `json:"quantity"`
	DesiredArrivalDate *string `json:"desired_arrival_date"`
	Status             string  `json:"status"`
	Note               *string `json:"note"`
	OutboundID         *string `json:"outbound_id"`
	RequestedBy        *string `json:"requested_by"`
	RequestedByEmail   *string `json:"requested_by_email"`
	RespondedBy        *string `json:"responded_by"`
	RespondedByEmail   *string `json:"responded_by_email"`
	RespondedAt        *string `json:"responded_at"`
	ReceivedAt         *string `json:"received_at"`
	CancelledAt        *string `json:"cancelled_at"`
	CreatedAt          *string `json:"created_at,omitempty"`
	UpdatedAt          *string `json:"updated_at,omitempty"`

	// 표시용 보강
	ProductCode  *string `json:"product_code,omitempty"`
	ProductName  *string `json:"product_name,omitempty"`
	RequesterName *string `json:"requester_company_name,omitempty"`
	TargetName    *string `json:"target_company_name,omitempty"`
}

// CreateIntercompanyRequestRequest — BARO 사용자가 매입 요청 등록 시 보내는 데이터
type CreateIntercompanyRequestRequest struct {
	RequesterCompanyID string  `json:"requester_company_id"`
	TargetCompanyID    string  `json:"target_company_id"`
	ProductID          string  `json:"product_id"`
	Quantity           int     `json:"quantity"`
	DesiredArrivalDate *string `json:"desired_arrival_date,omitempty"`
	Note               *string `json:"note,omitempty"`
}

// Validate — 등록 요청 검증
func (req *CreateIntercompanyRequestRequest) Validate() string {
	if req.RequesterCompanyID == "" {
		return "requester_company_id는 필수 항목입니다"
	}
	if req.TargetCompanyID == "" {
		return "target_company_id는 필수 항목입니다"
	}
	if req.RequesterCompanyID == req.TargetCompanyID {
		return "requester_company_id와 target_company_id는 달라야 합니다"
	}
	if req.ProductID == "" {
		return "product_id는 필수 항목입니다"
	}
	if req.Quantity <= 0 {
		return "quantity는 양수여야 합니다"
	}
	return ""
}

// FulfillIntercompanyRequestRequest — 탑솔라 측에서 출고와 연결할 때 사용
type FulfillIntercompanyRequestRequest struct {
	OutboundID string `json:"outbound_id"`
}
