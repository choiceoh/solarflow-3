package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"solarflow-backend/internal/model"
	"solarflow-backend/internal/response"
)

const receiptMatchAITimeout = 45 * time.Second

type receiptMatchCalcRequest struct {
	CompanyID  string `json:"company_id"`
	CustomerID string `json:"customer_id"`
}

type receiptMatchAIPromptReceipt struct {
	ReceiptID    string  `json:"receipt_id"`
	CustomerID   string  `json:"customer_id"`
	CustomerName string  `json:"customer_name"`
	ReceiptDate  string  `json:"receipt_date"`
	Amount       float64 `json:"amount"`
	MatchedTotal float64 `json:"matched_total"`
	Remaining    float64 `json:"remaining"`
	BankAccount  string  `json:"bank_account,omitempty"`
	Memo         string  `json:"memo,omitempty"`
}

type receiptMatchAIPromptOutstanding struct {
	OutboundID        string  `json:"outbound_id"`
	OutboundDate      *string `json:"outbound_date,omitempty"`
	SiteName          *string `json:"site_name,omitempty"`
	ProductName       string  `json:"product_name"`
	OutstandingAmount float64 `json:"outstanding_amount"`
	DaysElapsed       int64   `json:"days_elapsed"`
	TaxInvoiceDate    *string `json:"tax_invoice_date,omitempty"`
	Status            string  `json:"status"`
}

type receiptMatchAIPrompt struct {
	Receipt     receiptMatchAIPromptReceipt       `json:"receipt"`
	Outstanding []receiptMatchAIPromptOutstanding `json:"outstanding"`
	Rules       []string                          `json:"rules"`
}

type receiptMatchAIRawCandidate struct {
	OutboundID  string  `json:"outbound_id"`
	MatchAmount float64 `json:"match_amount"`
	Confidence  float64 `json:"confidence"`
	Reason      string  `json:"reason"`
}

type receiptMatchAIRawResponse struct {
	Summary    string                       `json:"summary"`
	Candidates []receiptMatchAIRawCandidate `json:"candidates"`
}

// AISuggest — POST /api/v1/receipt-matches/ai-suggest — LLM 기반 수금 후보 추천
// 비유: 자동 계산기가 못 고른 애매한 입금을 AI가 검토하되, 최종 확정 도장은 사람이 찍는다.
func (h *ReceiptMatchHandler) AISuggest(w http.ResponseWriter, r *http.Request) {
	if h.Engine == nil {
		engineUnavailableResponse(w)
		return
	}

	var req model.ReceiptMatchAIRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[AI 수금 추천 요청 파싱 실패] %v", err)
		response.RespondError(w, http.StatusBadRequest, "잘못된 요청 형식입니다")
		return
	}
	if msg := req.Validate(); msg != "" {
		response.RespondError(w, http.StatusBadRequest, msg)
		return
	}

	receipt, found, err := h.fetchReceiptForAI(req.ReceiptID)
	if err != nil {
		log.Printf("[AI 수금 추천] receipt 조회 실패 receipt_id=%s err=%v", req.ReceiptID, err)
		response.RespondError(w, http.StatusInternalServerError, "수금 정보 조회에 실패했습니다")
		return
	}
	if !found {
		response.RespondError(w, http.StatusNotFound, "수금을 찾을 수 없습니다")
		return
	}
	remaining := receipt.Amount - receipt.MatchedTotal
	if remaining <= receiptMatchAmountEpsilon {
		response.RespondJSON(w, http.StatusOK, model.ReceiptMatchAIResponse{
			ReceiptID:  receipt.ReceiptID,
			Summary:    "이미 입금액 전부가 매칭되어 AI 검토 대상이 없습니다.",
			Candidates: []model.ReceiptMatchAICandidate{},
		})
		return
	}

	outstanding, err := h.fetchOutstandingForAI(req.CompanyID, receipt.CustomerID)
	if err != nil {
		log.Printf("[AI 수금 추천] 미수금 조회 실패 receipt_id=%s err=%v", req.ReceiptID, err)
		response.RespondError(w, http.StatusInternalServerError, "미수금 목록 조회에 실패했습니다")
		return
	}
	if len(outstanding.OutstandingItems) == 0 {
		response.RespondJSON(w, http.StatusOK, model.ReceiptMatchAIResponse{
			ReceiptID:  receipt.ReceiptID,
			Summary:    "해당 거래처의 매칭 가능한 미수금이 없습니다.",
			Candidates: []model.ReceiptMatchAICandidate{},
			Difference: remaining,
		})
		return
	}

	provider, llmModel, _ := resolveProviderModelDB(assistantRequest{MaxTokens: 900}, h.DB)
	system, user, err := buildReceiptMatchAIPrompt(receipt, outstanding.OutstandingItems)
	if err != nil {
		log.Printf("[AI 수금 추천] 프롬프트 구성 실패: %v", err)
		response.RespondError(w, http.StatusInternalServerError, "AI 추천 입력 구성에 실패했습니다")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), receiptMatchAITimeout)
	defer cancel()

	assistant := NewAssistantHandler(h.DB)
	var raw string
	switch provider {
	case "anthropic":
		raw, err = assistant.callAnthropicOnce(ctx, llmModel, system, user, 900)
	case "openai":
		raw, err = assistant.callOpenAIOnce(ctx, llmModel, system, user, 900)
	default:
		err = fmt.Errorf("지원하지 않는 provider: %s", provider)
	}
	if err != nil {
		log.Printf("[AI 수금 추천] provider=%s model=%s 실패: %v", provider, llmModel, err)
		response.RespondError(w, http.StatusServiceUnavailable, "AI 추천을 사용할 수 없습니다")
		return
	}

	parsed, err := parseReceiptMatchAIResponse(raw)
	if err != nil {
		log.Printf("[AI 수금 추천] 응답 파싱 실패 raw=%q err=%v", truncate(raw, 500), err)
		response.RespondError(w, http.StatusBadGateway, "AI 추천 응답을 해석할 수 없습니다")
		return
	}

	out := sanitizeReceiptMatchAIResponse(receipt, provider, llmModel, parsed, outstanding.OutstandingItems)
	response.RespondJSON(w, http.StatusOK, out)
}

func (h *ReceiptMatchHandler) fetchReceiptForAI(receiptID string) (model.Receipt, bool, error) {
	data, _, err := h.DB.From("receipts").
		Select("*", "exact", false).
		Eq("receipt_id", receiptID).
		Execute()
	if err != nil {
		return model.Receipt{}, false, err
	}
	var receipts []model.Receipt
	if err := json.Unmarshal(data, &receipts); err != nil {
		return model.Receipt{}, false, err
	}
	if len(receipts) == 0 {
		return model.Receipt{}, false, nil
	}
	h.enrichReceiptMatchesForReceiptAI(receipts)
	return receipts[0], true, nil
}

func (h *ReceiptMatchHandler) enrichReceiptMatchesForReceiptAI(receipts []model.Receipt) {
	rh := ReceiptHandler{DB: h.DB}
	rh.enrichReceipts(receipts)
}

func (h *ReceiptMatchHandler) fetchOutstandingForAI(companyID, customerID string) (model.OutstandingListResp, error) {
	body, err := json.Marshal(receiptMatchCalcRequest{CompanyID: companyID, CustomerID: customerID})
	if err != nil {
		return model.OutstandingListResp{}, err
	}
	raw, status, err := h.Engine.CallCalcRaw("outstanding-list", body)
	if err != nil {
		return model.OutstandingListResp{}, err
	}
	if status >= 400 {
		return model.OutstandingListResp{}, fmt.Errorf("엔진 status=%d body=%s", status, truncate(string(raw), 200))
	}
	var out model.OutstandingListResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return model.OutstandingListResp{}, err
	}
	return out, nil
}

func buildReceiptMatchAIPrompt(receipt model.Receipt, items []model.OutstandingItemResp) (string, string, error) {
	receiptName := ""
	if receipt.CustomerName != nil {
		receiptName = *receipt.CustomerName
	}
	bank := ""
	if receipt.BankAccount != nil {
		bank = *receipt.BankAccount
	}
	memo := ""
	if receipt.Memo != nil {
		memo = *receipt.Memo
	}
	remaining := receipt.Amount - receipt.MatchedTotal
	prompt := receiptMatchAIPrompt{
		Receipt: receiptMatchAIPromptReceipt{
			ReceiptID:    receipt.ReceiptID,
			CustomerID:   receipt.CustomerID,
			CustomerName: receiptName,
			ReceiptDate:  receipt.ReceiptDate,
			Amount:       receipt.Amount,
			MatchedTotal: receipt.MatchedTotal,
			Remaining:    remaining,
			BankAccount:  bank,
			Memo:         memo,
		},
		Outstanding: make([]receiptMatchAIPromptOutstanding, 0, len(items)),
		Rules: []string{
			"candidates는 outstanding 목록의 outbound_id만 사용할 것",
			"match_amount는 0보다 크고 해당 후보의 outstanding_amount를 초과하면 안 됨",
			"부분 금액은 입금 잔액과 현장/메모 근거가 맞을 때만 제안할 것",
			"후보 합계는 receipt.remaining을 초과하면 안 됨",
			"확실하지 않으면 candidates를 빈 배열로 반환할 것",
			"응답은 설명문 없이 JSON 객체만 반환할 것",
		},
	}
	for _, item := range items {
		prompt.Outstanding = append(prompt.Outstanding, receiptMatchAIPromptOutstanding{
			OutboundID:        item.OutboundID,
			OutboundDate:      item.OutboundDate,
			SiteName:          item.SiteName,
			ProductName:       item.ProductName,
			OutstandingAmount: item.OutstandingAmount,
			DaysElapsed:       item.DaysElapsed,
			TaxInvoiceDate:    item.TaxInvoiceDate,
			Status:            item.Status,
		})
	}
	payload, err := json.MarshalIndent(prompt, "", "  ")
	if err != nil {
		return "", "", err
	}
	system := `너는 SolarFlow의 수금 매칭 검토 AI다. 같은 거래처의 입금과 미수금 후보를 보고 사람이 확정할 수 있는 후보만 고른다.
금액 초과, 거래처 불일치, 목록에 없는 outbound_id, 근거 없는 부분금액 추측은 금지한다.
반드시 다음 JSON 스키마만 반환한다:
{"summary":"짧은 한국어 요약","candidates":[{"outbound_id":"...","match_amount":123,"confidence":0.0,"reason":"짧은 이유"}]}`
	return system, string(payload), nil
}

func parseReceiptMatchAIResponse(raw string) (receiptMatchAIRawResponse, error) {
	body := extractJSONObject(raw)
	if body == "" {
		return receiptMatchAIRawResponse{}, fmt.Errorf("JSON 객체 없음")
	}
	var parsed receiptMatchAIRawResponse
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		return receiptMatchAIRawResponse{}, err
	}
	if parsed.Candidates == nil {
		parsed.Candidates = []receiptMatchAIRawCandidate{}
	}
	return parsed, nil
}

func extractJSONObject(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimSuffix(s, "```")
		s = strings.TrimSpace(s)
	}
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start < 0 || end < start {
		return ""
	}
	return s[start : end+1]
}

func sanitizeReceiptMatchAIResponse(
	receipt model.Receipt,
	provider string,
	llmModel string,
	raw receiptMatchAIRawResponse,
	items []model.OutstandingItemResp,
) model.ReceiptMatchAIResponse {
	outstandingByID := make(map[string]model.OutstandingItemResp, len(items))
	for _, item := range items {
		outstandingByID[item.OutboundID] = item
	}

	remaining := receipt.Amount - receipt.MatchedTotal
	seen := map[string]bool{}
	candidates := make([]model.ReceiptMatchAICandidate, 0, len(raw.Candidates))
	total := 0.0
	for _, cand := range raw.Candidates {
		item, ok := outstandingByID[cand.OutboundID]
		if !ok || seen[cand.OutboundID] || item.OutstandingAmount <= 0 {
			continue
		}
		if cand.MatchAmount <= 0 || cand.MatchAmount > item.OutstandingAmount+receiptMatchAmountEpsilon {
			continue
		}
		if total+cand.MatchAmount > remaining+receiptMatchAmountEpsilon {
			continue
		}
		confidence := cand.Confidence
		if confidence < 0 {
			confidence = 0
		}
		if confidence > 1 {
			confidence = 1
		}
		reason := strings.TrimSpace(cand.Reason)
		if reason == "" {
			reason = "AI가 입금액과 미수금 조건을 근거로 후보로 판단했습니다."
		}
		isPartial := math.Abs(cand.MatchAmount-item.OutstandingAmount) > 1.0
		candidates = append(candidates, model.ReceiptMatchAICandidate{
			OutboundID:        item.OutboundID,
			OutboundDate:      item.OutboundDate,
			SiteName:          item.SiteName,
			ProductName:       item.ProductName,
			OutstandingAmount: item.OutstandingAmount,
			MatchAmount:       cand.MatchAmount,
			IsPartial:         isPartial,
			Confidence:        confidence,
			Reason:            reason,
		})
		seen[cand.OutboundID] = true
		total += cand.MatchAmount
	}

	summary := strings.TrimSpace(raw.Summary)
	if summary == "" {
		if len(candidates) == 0 {
			summary = "AI가 확신할 수 있는 후보를 찾지 못했습니다."
		} else {
			summary = "AI가 검토용 후보를 제안했습니다. 확정 전 금액과 현장을 확인하세요."
		}
	}

	return model.ReceiptMatchAIResponse{
		ReceiptID:      receipt.ReceiptID,
		Provider:       provider,
		Model:          llmModel,
		Summary:        summary,
		Candidates:     candidates,
		TotalSuggested: total,
		Difference:     remaining - total,
	}
}
