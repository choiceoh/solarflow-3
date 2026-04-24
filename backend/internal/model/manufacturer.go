package model

import "unicode/utf8"

// Manufacturer — 제조사 정보를 담는 구조체
// 비유: "제조사 명함" — 각 셀 제조사의 기본 정보가 적힌 카드
type Manufacturer struct {
	ManufacturerID  string  `json:"manufacturer_id"`
	NameKR          string  `json:"name_kr"`
	NameEN          string  `json:"name_en"`
	ShortName       *string `json:"short_name"` // 약칭 (예: 진코, 론지, 트리나) — 화면 표시용
	Country         string  `json:"country"`
	DomesticForeign string  `json:"domestic_foreign"`
	IsActive        bool    `json:"is_active"`
}

// CreateManufacturerRequest — 제조사 등록 시 클라이언트가 보내는 데이터
// 비유: "제조사 등록 신청서" — 필수 항목을 빠짐없이 적어야 접수됨
type CreateManufacturerRequest struct {
	NameKR          string  `json:"name_kr"`
	NameEN          string  `json:"name_en"`
	ShortName       *string `json:"short_name,omitempty"`
	Country         string  `json:"country"`
	DomesticForeign string  `json:"domestic_foreign"`
}

// Validate — 제조사 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 신청서 빈 칸, 글자 수, 허용 값 확인
func (req *CreateManufacturerRequest) Validate() string {
	if req.NameKR == "" {
		return "name_kr은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.NameKR) > 50 {
		return "name_kr은 50자를 초과할 수 없습니다"
	}
	if req.Country == "" {
		return "country는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.Country) > 20 {
		return "country는 20자를 초과할 수 없습니다"
	}
	if req.DomesticForeign == "" {
		return "domestic_foreign은 필수 항목입니다"
	}
	if req.DomesticForeign != "국내" && req.DomesticForeign != "해외" {
		return "domestic_foreign은 \"국내\" 또는 \"해외\"만 허용됩니다"
	}
	return ""
}

// UpdateManufacturerRequest — 제조사 수정 시 클라이언트가 보내는 데이터
// 비유: "제조사 정보 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateManufacturerRequest struct {
	NameKR          *string `json:"name_kr,omitempty"`
	NameEN          *string `json:"name_en,omitempty"`
	ShortName       *string `json:"short_name,omitempty"`
	Country         *string `json:"country,omitempty"`
	DomesticForeign *string `json:"domestic_foreign,omitempty"`
}

// Validate — 제조사 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateManufacturerRequest) Validate() string {
	if req.NameKR != nil {
		if *req.NameKR == "" {
			return "name_kr은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.NameKR) > 50 {
			return "name_kr은 50자를 초과할 수 없습니다"
		}
	}
	if req.Country != nil {
		if *req.Country == "" {
			return "country는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.Country) > 20 {
			return "country는 20자를 초과할 수 없습니다"
		}
	}
	if req.DomesticForeign != nil {
		if *req.DomesticForeign != "국내" && *req.DomesticForeign != "해외" {
			return "domestic_foreign은 \"국내\" 또는 \"해외\"만 허용됩니다"
		}
	}
	return ""
}
