package model

import "unicode/utf8"

// Bank — 은행(LC 한도) 정보를 담는 구조체
// 비유: "은행 한도 관리 카드" — 각 법인이 거래하는 은행의 LC 한도, 수수료율 정보
type Bank struct {
	BankID            string   `json:"bank_id"`
	CompanyID         string   `json:"company_id"`
	BankName          string   `json:"bank_name"`
	LCLimitUSD        float64  `json:"lc_limit_usd"`
	OpeningFeeRate    *float64 `json:"opening_fee_rate"`
	AcceptanceFeeRate *float64 `json:"acceptance_fee_rate"`
	FeeCalcMethod     *string  `json:"fee_calc_method"`
	Memo              *string  `json:"memo"`
	IsActive          bool     `json:"is_active"`
}

// BankWithCompany — 법인 정보를 포함한 은행 조회 결과
// 비유: 은행 카드에 소속 법인 명함이 함께 붙어 나오는 것
type BankWithCompany struct {
	Bank
	Companies *CompanySummary `json:"companies"`
}

// CompanySummary — 은행 조회 시 함께 반환되는 법인 요약 정보
type CompanySummary struct {
	CompanyName string `json:"company_name"`
	CompanyCode string `json:"company_code"`
}

// CreateBankRequest — 은행 등록 시 클라이언트가 보내는 데이터
// 비유: "은행 거래 등록 신청서" — 법인, 은행명, LC 한도를 필수 기재
type CreateBankRequest struct {
	CompanyID         string   `json:"company_id"`
	BankName          string   `json:"bank_name"`
	LCLimitUSD        float64  `json:"lc_limit_usd"`
	OpeningFeeRate    *float64 `json:"opening_fee_rate"`
	AcceptanceFeeRate *float64 `json:"acceptance_fee_rate"`
	FeeCalcMethod     *string  `json:"fee_calc_method"`
	Memo              *string  `json:"memo"`
}

// Validate — 은행 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 법인 지정, 은행명, LC 한도 확인
func (req *CreateBankRequest) Validate() string {
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.BankName == "" {
		return "bank_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.BankName) > 50 {
		return "bank_name은 50자를 초과할 수 없습니다"
	}
	if req.LCLimitUSD <= 0 {
		return "lc_limit_usd는 양수여야 합니다"
	}
	return ""
}

// UpdateBankRequest — 은행 수정 시 클라이언트가 보내는 데이터
// 비유: "은행 거래 정보 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateBankRequest struct {
	CompanyID         *string  `json:"company_id"`
	BankName          *string  `json:"bank_name"`
	LCLimitUSD        *float64 `json:"lc_limit_usd"`
	OpeningFeeRate    *float64 `json:"opening_fee_rate"`
	AcceptanceFeeRate *float64 `json:"acceptance_fee_rate"`
	FeeCalcMethod     *string  `json:"fee_calc_method"`
	Memo              *string  `json:"memo"`
}

// Validate — 은행 수정 요청의 입력값을 검증
// 비유: 변경 신청서도 동일한 규칙으로 검증
func (req *UpdateBankRequest) Validate() string {
	if req.CompanyID != nil && *req.CompanyID == "" {
		return "company_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.BankName != nil {
		if *req.BankName == "" {
			return "bank_name은 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.BankName) > 50 {
			return "bank_name은 50자를 초과할 수 없습니다"
		}
	}
	if req.LCLimitUSD != nil && *req.LCLimitUSD <= 0 {
		return "lc_limit_usd는 양수여야 합니다"
	}
	return ""
}
