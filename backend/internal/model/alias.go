package model

import "unicode/utf8"

// CompanyAlias — 법인명 alias 학습 사전 항목 (D-056).
// 외부 양식 변환 시 fuzzy 매칭으로 사용자가 [같음] 선택한 결과를 영구 저장하여
// 다음 변환부터 자동 매핑한다.
type CompanyAlias struct {
	AliasID             string  `json:"alias_id"`
	CanonicalCompanyID  string  `json:"canonical_company_id"`
	AliasText           string  `json:"alias_text"`
	AliasTextNormalized string  `json:"alias_text_normalized"`
	Source              string  `json:"source"`
	CreatedAt           string  `json:"created_at"`
	CreatedBy           *string `json:"created_by,omitempty"`
}

// CreateCompanyAliasRequest — 법인 alias 등록 요청.
// alias_text_normalized 는 호출 측이 정규화 후 전송 (서버는 그대로 저장 + UNIQUE 검증).
type CreateCompanyAliasRequest struct {
	CanonicalCompanyID  string `json:"canonical_company_id"`
	AliasText           string `json:"alias_text"`
	AliasTextNormalized string `json:"alias_text_normalized"`
	Source              string `json:"source"`
}

func (r *CreateCompanyAliasRequest) Validate() string {
	if r.CanonicalCompanyID == "" {
		return "canonical_company_id는 필수 항목입니다"
	}
	if r.AliasText == "" {
		return "alias_text는 필수 항목입니다"
	}
	if utf8.RuneCountInString(r.AliasText) > 100 {
		return "alias_text는 100자를 초과할 수 없습니다"
	}
	if r.AliasTextNormalized == "" {
		return "alias_text_normalized는 필수 항목입니다"
	}
	if r.Source == "" {
		r.Source = "manual"
	}
	if !validAliasSource[r.Source] {
		return "source는 manual/learned/import 중 하나여야 합니다"
	}
	return ""
}

// ProductAlias — 품번코드 alias 학습 사전 항목 (D-056).
type ProductAlias struct {
	AliasID             string  `json:"alias_id"`
	CanonicalProductID  string  `json:"canonical_product_id"`
	AliasCode           string  `json:"alias_code"`
	AliasCodeNormalized string  `json:"alias_code_normalized"`
	Source              string  `json:"source"`
	CreatedAt           string  `json:"created_at"`
	CreatedBy           *string `json:"created_by,omitempty"`
}

type CreateProductAliasRequest struct {
	CanonicalProductID  string `json:"canonical_product_id"`
	AliasCode           string `json:"alias_code"`
	AliasCodeNormalized string `json:"alias_code_normalized"`
	Source              string `json:"source"`
}

func (r *CreateProductAliasRequest) Validate() string {
	if r.CanonicalProductID == "" {
		return "canonical_product_id는 필수 항목입니다"
	}
	if r.AliasCode == "" {
		return "alias_code는 필수 항목입니다"
	}
	if utf8.RuneCountInString(r.AliasCode) > 50 {
		return "alias_code는 50자를 초과할 수 없습니다"
	}
	if r.AliasCodeNormalized == "" {
		return "alias_code_normalized는 필수 항목입니다"
	}
	if r.Source == "" {
		r.Source = "manual"
	}
	if !validAliasSource[r.Source] {
		return "source는 manual/learned/import 중 하나여야 합니다"
	}
	return ""
}

var validAliasSource = map[string]bool{
	"manual":  true,
	"learned": true,
	"import":  true,
}

// PartnerAlias — 거래처명 alias 학습 사전 항목 (D-057).
// company_aliases 와 동일한 구조 — 별도 테이블만 차이.
type PartnerAlias struct {
	AliasID             string  `json:"alias_id"`
	CanonicalPartnerID  string  `json:"canonical_partner_id"`
	AliasText           string  `json:"alias_text"`
	AliasTextNormalized string  `json:"alias_text_normalized"`
	Source              string  `json:"source"`
	CreatedAt           string  `json:"created_at"`
	CreatedBy           *string `json:"created_by,omitempty"`
}

type CreatePartnerAliasRequest struct {
	CanonicalPartnerID  string `json:"canonical_partner_id"`
	AliasText           string `json:"alias_text"`
	AliasTextNormalized string `json:"alias_text_normalized"`
	Source              string `json:"source"`
}

func (r *CreatePartnerAliasRequest) Validate() string {
	if r.CanonicalPartnerID == "" {
		return "canonical_partner_id는 필수 항목입니다"
	}
	if r.AliasText == "" {
		return "alias_text는 필수 항목입니다"
	}
	if utf8.RuneCountInString(r.AliasText) > 100 {
		return "alias_text는 100자를 초과할 수 없습니다"
	}
	if r.AliasTextNormalized == "" {
		return "alias_text_normalized는 필수 항목입니다"
	}
	if r.Source == "" {
		r.Source = "manual"
	}
	if !validAliasSource[r.Source] {
		return "source는 manual/learned/import 중 하나여야 합니다"
	}
	return ""
}
