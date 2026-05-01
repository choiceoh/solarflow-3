package model

import (
	"strings"
	"testing"
)

func validIntercompanyCreate() CreateIntercompanyRequestRequest {
	return CreateIntercompanyRequestRequest{
		RequesterCompanyID: "550e8400-e29b-41d4-a716-446655440000",
		TargetCompanyID:    "550e8400-e29b-41d4-a716-446655440001",
		ProductID:          "550e8400-e29b-41d4-a716-446655440002",
		Quantity:           50,
	}
}

func TestIntercompanyCreate_OK(t *testing.T) {
	req := validIntercompanyCreate()
	if msg := req.Validate(); msg != "" {
		t.Fatalf("정상 요청 통과 기대, got: %s", msg)
	}
}

func TestIntercompanyCreate_SameCompanies(t *testing.T) {
	req := validIntercompanyCreate()
	req.TargetCompanyID = req.RequesterCompanyID
	if msg := req.Validate(); !strings.Contains(msg, "달라야") {
		t.Fatalf("같은 법인 에러 기대, got: %s", msg)
	}
}

func TestIntercompanyCreate_ZeroQty(t *testing.T) {
	req := validIntercompanyCreate()
	req.Quantity = 0
	if msg := req.Validate(); !strings.Contains(msg, "quantity") {
		t.Fatalf("quantity=0 에러 기대, got: %s", msg)
	}
}

func TestIntercompanyCreate_MissingProduct(t *testing.T) {
	req := validIntercompanyCreate()
	req.ProductID = ""
	if msg := req.Validate(); !strings.Contains(msg, "product_id") {
		t.Fatalf("product_id 누락 에러 기대, got: %s", msg)
	}
}
