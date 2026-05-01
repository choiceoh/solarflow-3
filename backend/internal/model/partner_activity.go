package model

import "unicode/utf8"

// PartnerActivity — 거래처 활동 로그 한 건 (통화/방문/메일/메모)
// 비유: 영업이 들고 다니는 "고객 접촉 일지" 한 줄
type PartnerActivity struct {
	ActivityID       string  `json:"activity_id"`
	PartnerID        string  `json:"partner_id"`
	AuthorUserID     *string `json:"author_user_id"`
	Kind             string  `json:"kind"`
	Body             string  `json:"body"`
	FollowUpRequired bool    `json:"follow_up_required"`
	FollowUpDue      *string `json:"follow_up_due"` // YYYY-MM-DD
	FollowUpDone     bool    `json:"follow_up_done"`
	FollowUpDoneAt   *string `json:"follow_up_done_at"`
	FollowUpDoneBy   *string `json:"follow_up_done_by"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

// CreatePartnerActivityRequest — 활동 등록 요청
type CreatePartnerActivityRequest struct {
	PartnerID        string  `json:"partner_id"`
	Kind             string  `json:"kind"`
	Body             string  `json:"body"`
	FollowUpRequired bool    `json:"follow_up_required"`
	FollowUpDue      *string `json:"follow_up_due,omitempty"`
}

// Validate — 활동 등록 입력값 검증
func (r *CreatePartnerActivityRequest) Validate() string {
	if r.PartnerID == "" {
		return "partner_id는 필수입니다"
	}
	if !validActivityKind(r.Kind) {
		return "kind는 call, visit, email, memo 중 하나여야 합니다"
	}
	if utf8.RuneCountInString(r.Body) == 0 {
		return "body는 빈 값일 수 없습니다"
	}
	if utf8.RuneCountInString(r.Body) > 2000 {
		return "body는 2000자를 초과할 수 없습니다"
	}
	if r.FollowUpRequired && (r.FollowUpDue == nil || *r.FollowUpDue == "") {
		return "후속 필요 시 follow_up_due(기한)는 필수입니다"
	}
	return ""
}

// CompleteFollowupRequest — 후속 완료 토글 요청
type CompleteFollowupRequest struct {
	Done bool `json:"done"`
}

func validActivityKind(k string) bool {
	switch k {
	case "call", "visit", "email", "memo":
		return true
	}
	return false
}
