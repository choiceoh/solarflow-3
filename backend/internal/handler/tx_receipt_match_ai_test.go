package handler

import (
	"testing"

	"solarflow-backend/internal/model"
)

func TestParseReceiptMatchAIResponseExtractsJSONFence(t *testing.T) {
	raw := "```json\n{\"summary\":\"ok\",\"candidates\":[{\"outbound_id\":\"o1\",\"match_amount\":100,\"confidence\":0.8,\"reason\":\"same amount\"}]}\n```"
	got, err := parseReceiptMatchAIResponse(raw)
	if err != nil {
		t.Fatalf("parseReceiptMatchAIResponse 실패: %v", err)
	}
	if got.Summary != "ok" || len(got.Candidates) != 1 || got.Candidates[0].OutboundID != "o1" {
		t.Fatalf("unexpected parsed response: %#v", got)
	}
}

func TestSanitizeReceiptMatchAIResponseAcceptsBoundedPartial(t *testing.T) {
	receipt := model.Receipt{ReceiptID: "r1", Amount: 100, MatchedTotal: 0}
	outstanding := []model.OutstandingItemResp{
		{OutboundID: "o1", ProductName: "A", OutstandingAmount: 60},
		{OutboundID: "o2", ProductName: "B", OutstandingAmount: 50},
		{OutboundID: "o3", ProductName: "C", OutstandingAmount: 40},
	}
	raw := receiptMatchAIRawResponse{
		Summary: "candidate",
		Candidates: []receiptMatchAIRawCandidate{
			{OutboundID: "o1", MatchAmount: 60, Confidence: 0.9, Reason: "ok"},
			{OutboundID: "o2", MatchAmount: 40, Confidence: 0.8, Reason: "partial ok"},
			{OutboundID: "o3", MatchAmount: 40, Confidence: 2.0, Reason: "over remaining should drop"},
		},
	}
	got := sanitizeReceiptMatchAIResponse(receipt, "mock", "m", raw, outstanding)
	if len(got.Candidates) != 2 {
		t.Fatalf("expected 2 accepted candidates, got %#v", got.Candidates)
	}
	if !got.Candidates[1].IsPartial || got.Candidates[1].MatchAmount != 40 {
		t.Fatalf("partial candidate should be preserved, got %#v", got.Candidates[1])
	}
	if got.TotalSuggested != 100 || got.Difference != 0 {
		t.Fatalf("unexpected totals: total=%v diff=%v", got.TotalSuggested, got.Difference)
	}
}
