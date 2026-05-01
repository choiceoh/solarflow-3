package model

import "unicode/utf8"

// Partner — 거래처 정보를 담는 구조체
// 비유: "거래처 명함" — 공급사/고객의 기본 정보가 적힌 카드
type Partner struct {
	PartnerID         string   `json:"partner_id"`
	PartnerName       string   `json:"partner_name"`
	PartnerType       string   `json:"partner_type"`
	ERPCode           *string  `json:"erp_code"`
	PaymentTerms      *string  `json:"payment_terms"`
	ContactName       *string  `json:"contact_name"`
	ContactPhone      *string  `json:"contact_phone"`
	ContactEmail      *string  `json:"contact_email"`
	IsActive          bool     `json:"is_active"`
	// BARO Phase 3: 거래처 신용 한도 (NULL=미설정)
	CreditLimitKrw    *float64 `json:"credit_limit_krw"`
	CreditPaymentDays *int     `json:"credit_payment_days"`
	// CRM 1차: 영업 담당자 (NULL=미배정)
	OwnerUserID       *string  `json:"owner_user_id"`
}

// CreatePartnerRequest — 거래처 등록 시 클라이언트가 보내는 데이터
// 비유: "거래처 등록 신청서" — 필수 항목을 빠짐없이 적어야 접수됨
type CreatePartnerRequest struct {
	PartnerName  string  `json:"partner_name"`
	PartnerType  string  `json:"partner_type"`
	ERPCode      *string `json:"erp_code"`
	PaymentTerms *string `json:"payment_terms"`
	ContactName  *string `json:"contact_name"`
	ContactPhone *string `json:"contact_phone"`
	ContactEmail *string `json:"contact_email"`
}

// Validate — 거래처 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 거래처명, 유형 확인
func (req *CreatePartnerRequest) Validate() string {
	if req.PartnerName == "" {
		return "partner_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.PartnerName) > 100 {
		return "partner_name은 100자를 초과할 수 없습니다"
	}
	if req.PartnerType == "" {
		return "partner_type은 필수 항목입니다"
	}
	if req.PartnerType != "supplier" && req.PartnerType != "customer" && req.PartnerType != "both" {
		return "partner_type은 \"supplier\", \"customer\", \"both\" 중 하나여야 합니다"
	}
	return ""
}

// UpdatePartnerRequest — 거래처 수정 시 클라이언트가 보내는 데이터
// 비유: "거래처 정보 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdatePartnerRequest struct {
	PartnerName       *string  `json:"partner_name,omitempty"`
	PartnerType       *string  `json:"partner_type,omitempty"`
	ERPCode           *string  `json:"erp_code,omitempty"`
	PaymentTerms      *string  `json:"payment_terms,omitempty"`
	ContactName       *string  `json:"contact_name,omitempty"`
	ContactPhone      *string  `json:"contact_phone,omitempty"`
	ContactEmail      *string  `json:"contact_email,omitempty"`
	// BARO Phase 3: 신용 한도 / 결제일수 — 미수금 보드용
	CreditLimitKrw    *float64 `json:"credit_limit_krw,omitempty"`
	CreditPaymentDays *int     `json:"credit_payment_days,omitempty"`
	// CRM 1차: 영업 담당자 변경 (빈 문자열은 해제로 해석 — 핸들러에서 NULL로 변환)
	OwnerUserID       *string  `json:"owner_user_id,omitempty"`
}

// Validate — 거래처 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdatePartnerRequest) Validate() string {
	if req.PartnerName != nil {
		if *req.PartnerName == "" {
			return "partner_name은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.PartnerName) > 100 {
			return "partner_name은 100자를 초과할 수 없습니다"
		}
	}
	if req.PartnerType != nil {
		if *req.PartnerType != "supplier" && *req.PartnerType != "customer" && *req.PartnerType != "both" {
			return "partner_type은 \"supplier\", \"customer\", \"both\" 중 하나여야 합니다"
		}
	}
	return ""
}
