package model

import "unicode/utf8"

// Company — 법인(회사) 정보를 담는 구조체
// 비유: "법인 명함" — 탑솔라, 디원, 화신 등 각 법인의 기본 정보가 적힌 카드
type Company struct {
	CompanyID      string  `json:"company_id"`
	CompanyName    string  `json:"company_name"`
	CompanyCode    string  `json:"company_code"`
	BusinessNumber *string `json:"business_number"` // nullable — 사업자번호가 없을 수 있음
	IsActive       bool    `json:"is_active"`
}

// CreateCompanyRequest — 법인 등록 시 클라이언트가 보내는 데이터
// 비유: "법인 등록 신청서" — 필수 항목을 빠짐없이 적어야 접수됨
type CreateCompanyRequest struct {
	CompanyName    string  `json:"company_name"`
	CompanyCode    string  `json:"company_code"`
	BusinessNumber *string `json:"business_number"`
}

// Validate — 법인 등록 요청의 입력값을 검증
// 비유: 접수 창구 직원이 신청서에 빈 칸이 없는지, 글자 수가 넘지 않는지 확인
func (req *CreateCompanyRequest) Validate() string {
	if req.CompanyName == "" {
		return "company_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.CompanyName) > 100 {
		return "company_name은 100자를 초과할 수 없습니다"
	}
	if req.CompanyCode == "" {
		return "company_code는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.CompanyCode) > 10 {
		return "company_code는 10자를 초과할 수 없습니다"
	}
	return ""
}

// UpdateCompanyRequest — 법인 수정 시 클라이언트가 보내는 데이터
// 비유: "법인 정보 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateCompanyRequest struct {
	CompanyName    *string `json:"company_name"`
	CompanyCode    *string `json:"company_code"`
	BusinessNumber *string `json:"business_number"`
}

// Validate — 법인 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 글자 수 규칙은 동일하게 적용
func (req *UpdateCompanyRequest) Validate() string {
	if req.CompanyName != nil {
		if *req.CompanyName == "" {
			return "company_name은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.CompanyName) > 100 {
			return "company_name은 100자를 초과할 수 없습니다"
		}
	}
	if req.CompanyCode != nil {
		if *req.CompanyCode == "" {
			return "company_code는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.CompanyCode) > 10 {
			return "company_code는 10자를 초과할 수 없습니다"
		}
	}
	return ""
}
