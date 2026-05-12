package outbound

import (
	"strings"
	"testing"
)

// validOutboundRequest — 테스트용 정상 출고 데이터 생성 헬퍼
func validOutboundRequest() CreateOutboundRequest {
	return CreateOutboundRequest{
		OutboundDate:  "2025-03-20",
		CompanyID:     "550e8400-e29b-41d4-a716-446655440000",
		ProductID:     "550e8400-e29b-41d4-a716-446655440001",
		Quantity:      500,
		WarehouseID:   "550e8400-e29b-41d4-a716-446655440002",
		UsageCategory: "sale",
	}
}

// TestOutboundValidate_EmptyDate — outbound_date가 빈 값일 때 에러 반환 확인
func TestOutboundValidate_EmptyDate(t *testing.T) {
	req := validOutboundRequest()
	req.OutboundDate = ""
	msg := req.Validate()
	if msg == "" {
		t.Fatal("빈 OutboundDate에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "outbound_date") {
		t.Fatalf("에러 메시지에 'outbound_date'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOutboundValidate_ZeroQuantity — quantity가 0일 때 에러 반환 확인
func TestOutboundValidate_ZeroQuantity(t *testing.T) {
	req := validOutboundRequest()
	req.Quantity = 0
	msg := req.Validate()
	if msg == "" {
		t.Fatal("Quantity=0에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "quantity") {
		t.Fatalf("에러 메시지에 'quantity'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOutboundValidate_InvalidUsageCategory — 허용되지 않은 usage_category일 때 에러 반환 확인
func TestOutboundValidate_InvalidUsageCategory(t *testing.T) {
	req := validOutboundRequest()
	req.UsageCategory = "donation"
	msg := req.Validate()
	if msg == "" {
		t.Fatal("잘못된 UsageCategory에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "usage_category") {
		t.Fatalf("에러 메시지에 'usage_category'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOutboundValidate_GroupTradeNoTarget — group_trade=true인데 target_company_id 없을 때 에러 반환 확인
func TestOutboundValidate_GroupTradeNoTarget(t *testing.T) {
	req := validOutboundRequest()
	groupTrade := true
	req.GroupTrade = &groupTrade
	req.TargetCompanyID = nil
	msg := req.Validate()
	if msg == "" {
		t.Fatal("GroupTrade=true, TargetCompanyID=nil에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "target_company_id") {
		t.Fatalf("에러 메시지에 'target_company_id'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOutboundValidate_GroupTradeWithTarget — group_trade=true + target_company_id 있으면 성공 확인
func TestOutboundValidate_GroupTradeWithTarget(t *testing.T) {
	req := validOutboundRequest()
	groupTrade := true
	targetID := "550e8400-e29b-41d4-a716-446655440003"
	req.GroupTrade = &groupTrade
	req.TargetCompanyID = &targetID
	msg := req.Validate()
	if msg != "" {
		t.Fatalf("GroupTrade=true + TargetCompanyID 있는 정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}

// TestOutboundValidate_InvalidStatus — 허용되지 않은 status일 때 에러 반환 확인
func TestOutboundValidate_InvalidStatus(t *testing.T) {
	req := validOutboundRequest()
	req.Status = "invalid_status"
	msg := req.Validate()
	if msg == "" {
		t.Fatal("잘못된 Status에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(msg, "status") {
		t.Fatalf("에러 메시지에 'status'가 포함되어야 합니다, got: %s", msg)
	}
}

// TestOutboundValidate_InvalidUsageCategory_Old — 기존 값(replacement)이 거부되는지 확인
func TestOutboundValidate_InvalidUsageCategory_Old(t *testing.T) {
	req := validOutboundRequest()
	req.UsageCategory = "replacement"
	msg := req.Validate()
	if msg == "" {
		t.Fatal("기존 값 'replacement'에 대해 에러가 반환되어야 합니다")
	}
}

// TestOutboundValidate_NewUsageCategories — 새 usage_category 값 각각 성공 확인
func TestOutboundValidate_NewUsageCategories(t *testing.T) {
	newCategories := []string{"sale_spare", "construction_damage", "maintenance", "disposal", "other"}
	for _, cat := range newCategories {
		req := validOutboundRequest()
		req.UsageCategory = cat
		msg := req.Validate()
		if msg != "" {
			t.Fatalf("usage_category=%s 정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", cat, msg)
		}
	}
}

// TestOutboundValidate_Success — 정상 데이터일 때 빈 문자열 반환 확인
func TestOutboundValidate_Success(t *testing.T) {
	req := validOutboundRequest()
	msg := req.Validate()
	if msg != "" {
		t.Fatalf("정상 데이터에서 에러가 반환되면 안 됩니다, got: %s", msg)
	}
}
