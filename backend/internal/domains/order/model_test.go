package order

import (
	"strings"
	"testing"
)

// validOrderRequest — 테스트용 정상 수주 데이터 생성 헬퍼
func validOrderRequest() CreateOrderRequest {
	return CreateOrderRequest{
		CompanyID:     "550e8400-e29b-41d4-a716-446655440000",
		CustomerID:    "550e8400-e29b-41d4-a716-446655440001",
		OrderDate:     "2025-03-15",
		ReceiptMethod: "purchase_order",
		ProductID:     "550e8400-e29b-41d4-a716-446655440002",
		Quantity:      1000,
		UnitPriceWp:   155.5,
		Status:        "received",
	}
}

// TestOrderValidate_EmptyCompanyID — company_id가 빈 값일 때 에러 반환 확인
func TestOrderValidate_EmptyCompanyID(t *testing.T) {
	req := validOrderRequest()
	req.CompanyID = ""
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 CompanyID에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "company_id") {
		t.Fatalf("에러 메시지에 'company_id'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_InvalidReceiptMethod — 허용되지 않은 receipt_method일 때 에러 반환 확인
func TestOrderValidate_InvalidReceiptMethod(t *testing.T) {
	req := validOrderRequest()
	req.ReceiptMethod = "fax"
	msg := req.Validate()
	if msg == "" {
		t.Fatal("잘못된 ReceiptMethod에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "receipt_method") {
		t.Fatalf("에러 메시지에 'receipt_method'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_ZeroQuantity — quantity가 0일 때 에러 반환 확인
func TestOrderValidate_ZeroQuantity(t *testing.T) {
	req := validOrderRequest()
	req.Quantity = 0
	msg := req.Validate()
	if msg == "" {
		t.Fatal("Quantity=0에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "quantity") {
		t.Fatalf("에러 메시지에 'quantity'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_ZeroPrice — unit_price_wp가 0일 때 에러 반환 확인
func TestOrderValidate_ZeroPrice(t *testing.T) {
	req := validOrderRequest()
	req.UnitPriceWp = 0
	msg := req.Validate()
	if msg == "" {
		t.Fatal("UnitPriceWp=0에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "unit_price_wp") {
		t.Fatalf("에러 메시지에 'unit_price_wp'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_InvalidStatus — 허용되지 않은 status일 때 에러 반환 확인
func TestOrderValidate_InvalidStatus(t *testing.T) {
	req := validOrderRequest()
	req.Status = "pending"
	msg := req.Validate()
	if msg == "" {
		t.Fatal("잘못된 Status에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "status") {
		t.Fatalf("에러 메시지에 'status'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_DepositRateOver100 — deposit_rate가 100 초과일 때 에러 반환 확인
func TestOrderValidate_DepositRateOver100(t *testing.T) {
	req := validOrderRequest()
	rate := 150.0
	req.DepositRate = &rate
	msg := req.Validate()
	if msg == "" {
		t.Fatal("DepositRate=150에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "deposit_rate") {
		t.Fatalf("에러 메시지에 'deposit_rate'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_InvalidManagementCategory — 허용되지 않은 management_category일 때 에러 반환 확인
func TestOrderValidate_InvalidManagementCategory(t *testing.T) {
	req := validOrderRequest()
	req.ManagementCategory = "donation"
	msg := req.Validate()
	if msg == "" {
		t.Fatal("잘못된 ManagementCategory에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "management_category") {
		t.Fatalf("에러 메시지에 'management_category'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_InvalidFulfillmentSource — 허용되지 않은 fulfillment_source일 때 에러 반환 확인
func TestOrderValidate_InvalidFulfillmentSource(t *testing.T) {
	req := validOrderRequest()
	req.FulfillmentSource = "factory"
	msg := req.Validate()
	if msg == "" {
		t.Fatal("잘못된 FulfillmentSource에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "fulfillment_source") {
		t.Fatalf("에러 메시지에 'fulfillment_source'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOrderValidate_ConstructionWithIncoming — construction + incoming 조합 성공 확인
func TestOrderValidate_ConstructionWithIncoming(t *testing.T) {
	req := validOrderRequest()
	req.ManagementCategory = "construction"
	req.FulfillmentSource = "incoming"
	msg := req.Validate()
	if msg != "" {
		t.Fatalf("construction+incoming 정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}

// TestOrderValidate_AllManagementCategories — 6개 management_category 각각 성공 확인
func TestOrderValidate_AllManagementCategories(t *testing.T) {
	categories := []string{"sale", "construction", "spare", "repowering", "maintenance", "other"}
	for _, cat := range categories {
		req := validOrderRequest()
		req.ManagementCategory = cat
		msg := req.Validate()
		if msg != "" {
			t.Fatalf("management_category=%s 정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", cat, msg)
		}
	}
}

// TestOrderValidate_Success — 정상 데이터일 때 빈 문자열 반환 확인
func TestOrderValidate_Success(t *testing.T) {
	req := validOrderRequest()
	msg := req.Validate()
	if msg != "" {
		t.Fatalf("정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}
