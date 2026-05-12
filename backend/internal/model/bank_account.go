package model

import "unicode/utf8"

// BankAccount — 은행 계좌(수금/지급 계좌) 마스터 정보를 담는 구조체
// 비유: "통장 카드" — 회사가 어디로 입금받고 어디서 송금하는지의 실제 계좌 정보.
// LC 한도 카드(Bank) 와 분리되어 운영된다.
type BankAccount struct {
	AccountID     string  `json:"account_id"`
	CompanyID     string  `json:"company_id"`
	BankID        *string `json:"bank_id,omitempty"`
	BankName      string  `json:"bank_name"`
	BranchName    *string `json:"branch_name,omitempty"`
	AccountNumber string  `json:"account_number"`
	AccountHolder string  `json:"account_holder"`
	Currency      string  `json:"currency"`
	SwiftCode     *string `json:"swift_code,omitempty"`
	Memo          *string `json:"memo,omitempty"`
	IsDefault     bool    `json:"is_default"`
	IsActive      bool    `json:"is_active"`
	CreatedAt     string  `json:"created_at,omitempty"`
	UpdatedAt     string  `json:"updated_at,omitempty"`
}

// BankAccountWithCompany — 법인 정보를 포함한 계좌 조회 결과
type BankAccountWithCompany struct {
	BankAccount
	Companies *CompanySummary `json:"companies,omitempty"`
}

// CreateBankAccountRequest — 계좌 등록 요청
type CreateBankAccountRequest struct {
	CompanyID     string  `json:"company_id"`
	BankID        *string `json:"bank_id,omitempty"`
	BankName      string  `json:"bank_name"`
	BranchName    *string `json:"branch_name,omitempty"`
	AccountNumber string  `json:"account_number"`
	AccountHolder string  `json:"account_holder"`
	Currency      string  `json:"currency"`
	SwiftCode     *string `json:"swift_code,omitempty"`
	Memo          *string `json:"memo,omitempty"`
	IsDefault     *bool   `json:"is_default,omitempty"`
}

// Validate — 계좌 등록 요청 검증
// 비유: 접수 창구에서 통장 신청서 필수 항목 확인
func (req *CreateBankAccountRequest) Validate() string {
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.BankName == "" {
		return "bank_name은 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.BankName) > 50 {
		return "bank_name은 50자를 초과할 수 없습니다"
	}
	if req.AccountNumber == "" {
		return "account_number는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.AccountNumber) > 50 {
		return "account_number는 50자를 초과할 수 없습니다"
	}
	if req.AccountHolder == "" {
		return "account_holder는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.AccountHolder) > 50 {
		return "account_holder는 50자를 초과할 수 없습니다"
	}
	if req.Currency == "" {
		return "currency는 필수 항목입니다"
	}
	if utf8.RuneCountInString(req.Currency) != 3 {
		return "currency는 ISO 4217 3자리 코드여야 합니다 (예: KRW, USD)"
	}
	return ""
}

// UpdateBankAccountRequest — 계좌 수정 요청 (부분 업데이트)
type UpdateBankAccountRequest struct {
	CompanyID     *string `json:"company_id,omitempty"`
	BankID        *string `json:"bank_id,omitempty"`
	BankName      *string `json:"bank_name,omitempty"`
	BranchName    *string `json:"branch_name,omitempty"`
	AccountNumber *string `json:"account_number,omitempty"`
	AccountHolder *string `json:"account_holder,omitempty"`
	Currency      *string `json:"currency,omitempty"`
	SwiftCode     *string `json:"swift_code,omitempty"`
	Memo          *string `json:"memo,omitempty"`
	IsDefault     *bool   `json:"is_default,omitempty"`
}

// Validate — 계좌 수정 요청 검증
func (req *UpdateBankAccountRequest) Validate() string {
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
	if req.AccountNumber != nil {
		if *req.AccountNumber == "" {
			return "account_number는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.AccountNumber) > 50 {
			return "account_number는 50자를 초과할 수 없습니다"
		}
	}
	if req.AccountHolder != nil {
		if *req.AccountHolder == "" {
			return "account_holder는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.AccountHolder) > 50 {
			return "account_holder는 50자를 초과할 수 없습니다"
		}
	}
	if req.Currency != nil {
		if *req.Currency == "" {
			return "currency는 빈 값으로 변경할 수 없습니다"
		}
		if utf8.RuneCountInString(*req.Currency) != 3 {
			return "currency는 ISO 4217 3자리 코드여야 합니다"
		}
	}
	return ""
}
