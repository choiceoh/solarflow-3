package model

import (
	"strings"
	"testing"
)

func TestReceiptMatchBulkValidateBalanceDisposition(t *testing.T) {
	outboundID := "550e8400-e29b-41d4-a716-446655440010"
	req := ReceiptMatchBulkRequest{
		ReceiptID:          "550e8400-e29b-41d4-a716-446655440001",
		BalanceDisposition: "advance",
		Matches: []ReceiptMatchBulkItem{
			{OutboundID: &outboundID, MatchedAmount: 1000},
		},
	}

	if msg := req.Validate(); msg != "" {
		t.Fatalf("정상 balance_disposition에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}

func TestReceiptMatchBulkValidateRejectsUnknownBalanceDisposition(t *testing.T) {
	outboundID := "550e8400-e29b-41d4-a716-446655440010"
	req := ReceiptMatchBulkRequest{
		ReceiptID:          "550e8400-e29b-41d4-a716-446655440001",
		BalanceDisposition: "hold_forever",
		Matches: []ReceiptMatchBulkItem{
			{OutboundID: &outboundID, MatchedAmount: 1000},
		},
	}

	msg := req.Validate()
	if msg == "" {
		t.Fatal("알 수 없는 balance_disposition은 거부되어야 합니다")
	}
	if !strings.Contains(msg, "balance_disposition") {
		t.Fatalf("에러 메시지에 balance_disposition이 포함되어야 합니다, got: %s", msg)
	}
}
