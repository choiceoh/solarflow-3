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

func TestCompleteReceiptMatchValidateRequiresSingleTarget(t *testing.T) {
	outboundID := "550e8400-e29b-41d4-a716-446655440010"
	saleID := "550e8400-e29b-41d4-a716-446655440011"

	req := CompleteReceiptMatchRequest{OutboundID: &outboundID, SaleID: &saleID}
	msg := req.Validate()
	if msg == "" {
		t.Fatal("outbound_id와 sale_id 동시 지정은 거부되어야 합니다")
	}
	if !strings.Contains(msg, "동시에") {
		t.Fatalf("동시 지정 에러 메시지를 기대했습니다, got: %s", msg)
	}
}

func TestCompleteReceiptMatchValidateDateFormat(t *testing.T) {
	saleID := "550e8400-e29b-41d4-a716-446655440011"
	req := CompleteReceiptMatchRequest{SaleID: &saleID, ReceiptDate: "2026/05/11"}

	msg := req.Validate()
	if msg == "" {
		t.Fatal("잘못된 receipt_date 형식은 거부되어야 합니다")
	}
	if !strings.Contains(msg, "YYYY-MM-DD") {
		t.Fatalf("날짜 형식 에러 메시지를 기대했습니다, got: %s", msg)
	}
}
