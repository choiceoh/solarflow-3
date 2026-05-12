package sale

import (
	"strings"
	"testing"
)

// TestSaleValidate_EmptyOutboundID — outbound_id가 빈 값일 때 에러 반환 확인
func TestSaleValidate_EmptyOutboundID(t *testing.T) {
	req := CreateSaleRequest{
		CustomerID:  "550e8400-e29b-41d4-a716-446655440001",
		UnitPriceWp: 155.5,
	}
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 OutboundID에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "order_id") || !strings.Contains(msg, "outbound_id") {
		t.Fatalf("에러 메시지에 'order_id'와 'outbound_id'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestSaleValidate_EmptyCustomerID — customer_id가 빈 값일 때 에러 반환 확인
func TestSaleValidate_EmptyCustomerID(t *testing.T) {
	outboundID := "550e8400-e29b-41d4-a716-446655440000"
	req := CreateSaleRequest{
		OutboundID:  &outboundID,
		CustomerID:  "",
		UnitPriceWp: 155.5,
	}
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 CustomerID에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "customer_id") {
		t.Fatalf("에러 메시지에 'customer_id'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestSaleValidate_ZeroPrice — unit_price_wp가 0일 때 에러 반환 확인
func TestSaleValidate_ZeroPrice(t *testing.T) {
	outboundID := "550e8400-e29b-41d4-a716-446655440000"
	req := CreateSaleRequest{
		OutboundID:  &outboundID,
		CustomerID:  "550e8400-e29b-41d4-a716-446655440001",
		UnitPriceWp: 0,
	}
	msg := req.Validate()
	if msg == "" {
		t.Fatal("UnitPriceWp=0에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "unit_price_wp") {
		t.Fatalf("에러 메시지에 'unit_price_wp'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestSaleValidate_Success — 정상 데이터일 때 빈 문자열 반환 확인
func TestSaleValidate_Success(t *testing.T) {
	outboundID := "550e8400-e29b-41d4-a716-446655440000"
	req := CreateSaleRequest{
		OutboundID:  &outboundID,
		CustomerID:  "550e8400-e29b-41d4-a716-446655440001",
		UnitPriceWp: 155.5,
	}
	msg := req.Validate()
	if msg != "" {
		t.Fatalf("정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}
