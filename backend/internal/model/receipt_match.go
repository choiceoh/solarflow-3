package model

import "strings"

// ReceiptMatch — 수금 매칭 정보를 담는 구조체
// 비유: "수금-출고 매칭 대장" — 어떤 수금이 어떤 출고에 얼마만큼 매칭되었는지 기록
type ReceiptMatch struct {
	MatchID       string  `json:"match_id"`
	ReceiptID     string  `json:"receipt_id"`
	OutboundID    *string `json:"outbound_id,omitempty"`
	SaleID        *string `json:"sale_id,omitempty"`
	MatchedAmount float64 `json:"matched_amount"`
	OutboundDate  *string `json:"outbound_date,omitempty"`
	SiteName      *string `json:"site_name,omitempty"`
	ProductName   *string `json:"product_name,omitempty"`
}

// CreateReceiptMatchRequest — 수금 매칭 등록 시 클라이언트가 보내는 데이터
// 비유: "수금 매칭 등록 신청서" — 수금, 출고, 매칭 금액을 필수 기재
type CreateReceiptMatchRequest struct {
	ReceiptID     string  `json:"receipt_id"`
	OutboundID    *string `json:"outbound_id,omitempty"`
	SaleID        *string `json:"sale_id,omitempty"`
	MatchedAmount float64 `json:"matched_amount"`
}

// Validate — 수금 매칭 등록 요청의 입력값을 검증
// 비유: 접수 창구에서 매칭 신청서 필수 항목 확인
func (req *CreateReceiptMatchRequest) Validate() string {
	if req.ReceiptID == "" {
		return "receipt_id는 필수 항목입니다"
	}
	if (req.OutboundID == nil || *req.OutboundID == "") && (req.SaleID == nil || *req.SaleID == "") {
		return "outbound_id 또는 sale_id 중 하나는 필수 항목입니다"
	}
	if req.MatchedAmount <= 0 {
		return "matched_amount는 양수여야 합니다"
	}
	return ""
}

// ReceiptMatchBulkItem — 한 수금에 한 번에 묶어 넣을 매칭 행
// 비유: 매칭 확정 버튼을 한 번 눌렀을 때 대장에 들어갈 각 줄.
type ReceiptMatchBulkItem struct {
	OutboundID    *string `json:"outbound_id,omitempty"`
	SaleID        *string `json:"sale_id,omitempty"`
	MatchedAmount float64 `json:"matched_amount"`
}

// ReceiptMatchBulkRequest — 여러 미수금을 한 번에 확정하는 요청
// 비유: 수금 전표 하나에 여러 출고/매출을 한 묶음으로 스테이플러 찍는 것.
type ReceiptMatchBulkRequest struct {
	ReceiptID          string                 `json:"receipt_id"`
	Matches            []ReceiptMatchBulkItem `json:"matches"`
	BalanceDisposition string                 `json:"balance_disposition,omitempty"`
	BalanceNote        string                 `json:"balance_note,omitempty"`
}

// ReceiptMatchBulkResponse — 일괄 매칭 결과와 남은 입금 잔액 처리 선택.
type ReceiptMatchBulkResponse struct {
	Matches            []ReceiptMatch `json:"matches"`
	BalanceAmount      float64        `json:"balance_amount"`
	BalanceDisposition string         `json:"balance_disposition,omitempty"`
	BalanceNote        string         `json:"balance_note,omitempty"`
}

// Validate — 일괄 매칭 요청 검증
func (req *ReceiptMatchBulkRequest) Validate() string {
	if req.ReceiptID == "" {
		return "receipt_id는 필수 항목입니다"
	}
	if len(req.Matches) == 0 {
		return "matches는 1건 이상이어야 합니다"
	}
	if len(req.Matches) > 50 {
		return "한 번에 매칭할 수 있는 항목은 최대 50건입니다"
	}
	for _, item := range req.Matches {
		if (item.OutboundID == nil || *item.OutboundID == "") && (item.SaleID == nil || *item.SaleID == "") {
			return "outbound_id 또는 sale_id 중 하나는 필수 항목입니다"
		}
		if item.MatchedAmount <= 0 {
			return "matched_amount는 양수여야 합니다"
		}
	}
	if req.BalanceDisposition != "" && !ValidReceiptBalanceDisposition(req.BalanceDisposition) {
		return "balance_disposition은 advance, next_settlement, refund_review 중 하나여야 합니다"
	}
	if len(strings.TrimSpace(req.BalanceNote)) > 500 {
		return "balance_note는 500자 이하여야 합니다"
	}
	return ""
}

// ValidReceiptBalanceDisposition — 남은 입금 잔액 처리 방법 검증.
func ValidReceiptBalanceDisposition(value string) bool {
	switch value {
	case "advance", "next_settlement", "refund_review":
		return true
	default:
		return false
	}
}

// ToCreateRequests — bulk item 을 기존 INSERT 페이로드로 변환
func (req *ReceiptMatchBulkRequest) ToCreateRequests() []CreateReceiptMatchRequest {
	out := make([]CreateReceiptMatchRequest, 0, len(req.Matches))
	for _, item := range req.Matches {
		out = append(out, CreateReceiptMatchRequest{
			ReceiptID:     req.ReceiptID,
			OutboundID:    item.OutboundID,
			SaleID:        item.SaleID,
			MatchedAmount: item.MatchedAmount,
		})
	}
	return out
}

// ReceiptMatchAIRequest — LLM 기반 수금 후보 추천 요청
// 비유: 사람이 헷갈리는 입금 전표를 AI 검토 데스크에 올리는 것.
type ReceiptMatchAIRequest struct {
	CompanyID string `json:"company_id"`
	ReceiptID string `json:"receipt_id"`
}

// Validate — AI 추천 요청 검증
func (req *ReceiptMatchAIRequest) Validate() string {
	if req.CompanyID == "" {
		return "company_id는 필수 항목입니다"
	}
	if req.ReceiptID == "" {
		return "receipt_id는 필수 항목입니다"
	}
	return ""
}

// ReceiptMatchAICandidate — AI가 제안한 후보 한 줄
type ReceiptMatchAICandidate struct {
	OutboundID        string  `json:"outbound_id"`
	OutboundDate      *string `json:"outbound_date,omitempty"`
	SiteName          *string `json:"site_name,omitempty"`
	ProductName       string  `json:"product_name"`
	OutstandingAmount float64 `json:"outstanding_amount"`
	MatchAmount       float64 `json:"match_amount"`
	IsPartial         bool    `json:"is_partial"`
	Confidence        float64 `json:"confidence"`
	Reason            string  `json:"reason"`
}

// ReceiptMatchAIResponse — AI 추천 응답
type ReceiptMatchAIResponse struct {
	ReceiptID      string                    `json:"receipt_id"`
	Provider       string                    `json:"provider"`
	Model          string                    `json:"model"`
	Summary        string                    `json:"summary"`
	Candidates     []ReceiptMatchAICandidate `json:"candidates"`
	TotalSuggested float64                   `json:"total_suggested"`
	Difference     float64                   `json:"difference"`
}
