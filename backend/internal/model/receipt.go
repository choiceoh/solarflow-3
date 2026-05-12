package model

// Receipt — 수금 정보를 담는 구조체
// 비유: "수금 전표" — 고객이 언제, 얼마를 입금했는지 기록
type Receipt struct {
	ReceiptID     string  `json:"receipt_id"`
	CompanyID     *string `json:"company_id,omitempty"`
	CustomerID    string  `json:"customer_id"`
	CustomerName  *string `json:"customer_name,omitempty"`
	ReceiptDate   string  `json:"receipt_date"`
	Amount        float64 `json:"amount"`
	BankAccount   *string `json:"bank_account"`
	BankAccountID *string `json:"bank_account_id,omitempty"`
	Memo          *string `json:"memo"`
	MatchedTotal  float64 `json:"matched_total,omitempty"`
	Remaining     float64 `json:"remaining,omitempty"`
}

// CreateReceiptRequest — 수금 등록 시 클라이언트가 보내는 데이터
// 비유: "수금 등록 신청서" — 고객, 입금일, 금액을 필수 기재
type CreateReceiptRequest struct {
	CompanyID     *string `json:"company_id,omitempty"`
	CustomerID    string  `json:"customer_id"`
	ReceiptDate   string  `json:"receipt_date"`
	Amount        float64 `json:"amount"`
	BankAccount   *string `json:"bank_account,omitempty"`
	BankAccountID *string `json:"bank_account_id,omitempty"`
	Memo          *string `json:"memo,omitempty"`
}

// Validate — 수금 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 수금 전표 필수 항목 확인
func (req *CreateReceiptRequest) Validate() string {
	if req.CustomerID == "" {
		return "customer_id는 필수 항목입니다"
	}
	if req.ReceiptDate == "" {
		return "receipt_date는 필수 항목입니다"
	}
	if req.Amount <= 0 {
		return "amount는 양수여야 합니다"
	}
	return ""
}

// UpdateReceiptRequest — 수금 수정 시 클라이언트가 보내는 데이터
// 비유: "수금 전표 변경 신청서" — 바꾸고 싶은 항목만 적어서 제출
type UpdateReceiptRequest struct {
	CustomerID    *string  `json:"customer_id,omitempty"`
	ReceiptDate   *string  `json:"receipt_date,omitempty"`
	Amount        *float64 `json:"amount,omitempty"`
	BankAccount   *string  `json:"bank_account,omitempty"`
	BankAccountID *string  `json:"bank_account_id,omitempty"`
	Memo          *string  `json:"memo,omitempty"`
}

// Validate — 수금 수정 요청의 입력값을 검증
func (req *UpdateReceiptRequest) Validate() string {
	if req.CustomerID != nil && *req.CustomerID == "" {
		return "customer_id는 빈 값으로 변경할 수 없습니다"
	}
	if req.Amount != nil && *req.Amount <= 0 {
		return "amount는 양수여야 합니다"
	}
	return ""
}
