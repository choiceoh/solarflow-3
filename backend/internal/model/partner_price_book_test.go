package model

import (
	"strings"
	"testing"
)

func validCreatePartnerPriceRequest() CreatePartnerPriceRequest {
	return CreatePartnerPriceRequest{
		PartnerID:     "550e8400-e29b-41d4-a716-446655440000",
		ProductID:     "550e8400-e29b-41d4-a716-446655440001",
		UnitPriceWp:   320.5,
		DiscountPct:   3.0,
		EffectiveFrom: "2026-05-01",
	}
}

func TestPartnerPriceCreate_OK(t *testing.T) {
	req := validCreatePartnerPriceRequest()
	if msg := req.Validate(); msg != "" {
		t.Fatalf("정상 요청은 통과해야 합니다, got: %s", msg)
	}
}

func TestPartnerPriceCreate_MissingPartnerID(t *testing.T) {
	req := validCreatePartnerPriceRequest()
	req.PartnerID = ""
	msg := req.Validate()
	if !strings.Contains(msg, "partner_id") {
		t.Fatalf("partner_id 누락 에러 기대, got: %s", msg)
	}
}

func TestPartnerPriceCreate_NegativePrice(t *testing.T) {
	req := validCreatePartnerPriceRequest()
	req.UnitPriceWp = -1
	if msg := req.Validate(); !strings.Contains(msg, "unit_price_wp") {
		t.Fatalf("음수 단가 에러 기대, got: %s", msg)
	}
}

func TestPartnerPriceCreate_DiscountOutOfRange(t *testing.T) {
	req := validCreatePartnerPriceRequest()
	req.DiscountPct = 150
	if msg := req.Validate(); !strings.Contains(msg, "discount_pct") {
		t.Fatalf("할인율 범위 에러 기대, got: %s", msg)
	}
}

func TestPartnerPriceCreate_EffectiveToBeforeFrom(t *testing.T) {
	req := validCreatePartnerPriceRequest()
	to := "2026-04-30"
	req.EffectiveTo = &to
	if msg := req.Validate(); !strings.Contains(msg, "effective_to") {
		t.Fatalf("종료일이 시작일보다 빠를 때 에러 기대, got: %s", msg)
	}
}

func TestPartnerPriceUpdate_NegativePrice(t *testing.T) {
	bad := -10.0
	req := UpdatePartnerPriceRequest{UnitPriceWp: &bad}
	if msg := req.Validate(); !strings.Contains(msg, "unit_price_wp") {
		t.Fatalf("음수 단가 수정 에러 기대, got: %s", msg)
	}
}

func TestPartnerPriceUpdate_DiscountTooHigh(t *testing.T) {
	bad := 101.0
	req := UpdatePartnerPriceRequest{DiscountPct: &bad}
	if msg := req.Validate(); !strings.Contains(msg, "discount_pct") {
		t.Fatalf("할인율 100 초과 에러 기대, got: %s", msg)
	}
}
