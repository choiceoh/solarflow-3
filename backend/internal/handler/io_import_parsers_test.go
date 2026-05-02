package handler

import (
	"strings"
	"testing"
)

// TestParseReceiptRow — 수금 행 파싱: 양수·필수·페이로드 빌드 검증.
func TestParseReceiptRow(t *testing.T) {
	cases := []struct {
		name           string
		row            map[string]interface{}
		customerID     string
		wantErrField   string // "" = 통과
		wantBankAcct   string // 통과 시 검증
	}{
		{
			name:         "정상",
			row:          map[string]interface{}{"customer_name": "X", "receipt_date": "2026-05-01", "amount": 50000.0, "bank_account": "111-222"},
			customerID:   "cust-1",
			wantErrField: "",
			wantBankAcct: "111-222",
		},
		{
			name:         "amount 음수",
			row:          map[string]interface{}{"customer_name": "X", "receipt_date": "2026-05-01", "amount": -100.0},
			customerID:   "cust-1",
			wantErrField: "amount",
		},
		{
			name:         "amount 0",
			row:          map[string]interface{}{"customer_name": "X", "receipt_date": "2026-05-01", "amount": 0.0},
			customerID:   "cust-1",
			wantErrField: "amount",
		},
		{
			name:         "amount 잘못된 형식",
			row:          map[string]interface{}{"customer_name": "X", "receipt_date": "2026-05-01", "amount": "abc"},
			customerID:   "cust-1",
			wantErrField: "amount",
		},
		{
			name:         "bank_account 없음 → nil",
			row:          map[string]interface{}{"customer_name": "X", "receipt_date": "2026-05-01", "amount": 1000.0},
			customerID:   "cust-1",
			wantErrField: "",
			wantBankAcct: "", // BankAccount는 nil이어야 함
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, errs := parseReceiptRow(7, c.row, c.customerID)
			if c.wantErrField != "" {
				if len(errs) == 0 {
					t.Fatalf("에러 기대(field=%s), 실제: 통과", c.wantErrField)
				}
				if errs[0].Field != c.wantErrField {
					t.Errorf("기대 field=%s, 실제 field=%s", c.wantErrField, errs[0].Field)
				}
				return
			}
			if len(errs) > 0 {
				t.Fatalf("통과 기대, 에러: %v", errs)
			}
			if req.CustomerID != c.customerID {
				t.Errorf("CustomerID 기대=%s 실제=%s", c.customerID, req.CustomerID)
			}
			if c.wantBankAcct == "" {
				if req.BankAccount != nil {
					t.Errorf("BankAccount nil 기대, 실제=*%s", *req.BankAccount)
				}
			} else {
				if req.BankAccount == nil || *req.BankAccount != c.wantBankAcct {
					t.Errorf("BankAccount 기대=%s 실제=%v", c.wantBankAcct, req.BankAccount)
				}
			}
		})
	}
}

// TestGroupInboundRowsByBL_Single — 단일 B/L, 단일 라인 정상 통과.
func TestGroupInboundRowsByBL_Single(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"bl_number": "BL-1", "inbound_type": "import", "company_code": "TS",
			"manufacturer_name": "M1", "currency": "USD", "product_code": "P1",
			"quantity": 10, "item_type": "main", "payment_type": "paid", "usage_category": "sale",
		},
	}
	groups, order, errs, warns := groupInboundRowsByBL(rows)
	if len(errs) > 0 {
		t.Fatalf("에러 없어야 함, 실제: %v", errs)
	}
	if len(warns) > 0 {
		t.Errorf("경고 없어야 함, 실제: %v", warns)
	}
	if len(order) != 1 || order[0] != "BL-1" {
		t.Errorf("order 기대=[BL-1], 실제=%v", order)
	}
	g := groups["BL-1"]
	if g == nil || g.BLNumber != "BL-1" {
		t.Fatalf("그룹 누락 또는 BLNumber 잘못")
	}
	if len(g.LineRows) != 1 {
		t.Errorf("LineRows 1건 기대, 실제=%d", len(g.LineRows))
	}
	if g.FirstIdx != 2 {
		t.Errorf("FirstIdx 2 기대 (2행부터), 실제=%d", g.FirstIdx)
	}
}

// TestGroupInboundRowsByBL_MultiLine — 같은 B/L 여러 라인은 같은 그룹으로 묶임.
func TestGroupInboundRowsByBL_MultiLine(t *testing.T) {
	base := map[string]interface{}{
		"bl_number": "BL-2", "inbound_type": "domestic", "company_code": "TS",
		"manufacturer_name": "M2", "currency": "KRW", "item_type": "main",
		"payment_type": "free", "usage_category": "sale",
	}
	mk := func(productCode string, quantity int) map[string]interface{} {
		row := make(map[string]interface{}, len(base)+2)
		for k, v := range base {
			row[k] = v
		}
		row["product_code"] = productCode
		row["quantity"] = quantity
		return row
	}
	rows := []map[string]interface{}{mk("P1", 10), mk("P2", 20), mk("P3", 30)}

	groups, order, errs, _ := groupInboundRowsByBL(rows)
	if len(errs) > 0 {
		t.Fatalf("에러 없어야 함, 실제: %v", errs)
	}
	if len(order) != 1 {
		t.Errorf("그룹 1개 기대, 실제=%d", len(order))
	}
	g := groups["BL-2"]
	if len(g.LineRows) != 3 {
		t.Errorf("LineRows 3건 기대, 실제=%d", len(g.LineRows))
	}
	if g.LineIdxes[0] != 2 || g.LineIdxes[1] != 3 || g.LineIdxes[2] != 4 {
		t.Errorf("LineIdxes 기대=[2,3,4], 실제=%v", g.LineIdxes)
	}
}

// TestGroupInboundRowsByBL_MetaInconsistencyWarning — 같은 B/L의 후속 라인이 기본정보 다르면 경고.
func TestGroupInboundRowsByBL_MetaInconsistencyWarning(t *testing.T) {
	mk := func(eta, productCode string) map[string]interface{} {
		return map[string]interface{}{
			"bl_number": "BL-3", "inbound_type": "import", "company_code": "TS",
			"manufacturer_name": "M3", "currency": "USD", "product_code": productCode,
			"quantity": 1, "item_type": "main", "payment_type": "paid", "usage_category": "sale",
			"eta": eta,
		}
	}
	rows := []map[string]interface{}{
		mk("2026-05-10", "P1"),
		mk("2026-05-15", "P2"), // 같은 B/L인데 ETA 다름
	}
	_, _, errs, warns := groupInboundRowsByBL(rows)
	if len(errs) > 0 {
		t.Fatalf("에러 없어야 함, 실제: %v", errs)
	}
	if len(warns) != 1 {
		t.Fatalf("경고 1건 기대, 실제 %d건", len(warns))
	}
	if warns[0].Field != "eta" || warns[0].Row != 3 {
		t.Errorf("경고 row=3 field=eta 기대, 실제: row=%d field=%s", warns[0].Row, warns[0].Field)
	}
	if !strings.Contains(warns[0].Message, "B/L 기본정보") {
		t.Errorf("경고 메시지에 'B/L 기본정보' 누락: %s", warns[0].Message)
	}
}

// TestGroupInboundRowsByBL_MissingRequired — 필수 필드 누락 → 에러.
func TestGroupInboundRowsByBL_MissingRequired(t *testing.T) {
	rows := []map[string]interface{}{
		{"bl_number": "BL-4"}, // 다른 필수 필드 모두 누락
	}
	_, _, errs, _ := groupInboundRowsByBL(rows)
	if len(errs) == 0 {
		t.Fatal("에러 기대, 실제: 없음")
	}
	// "inbound_type", "company_code", "manufacturer_name", "currency", "product_code",
	// "quantity", "item_type", "payment_type", "usage_category" — 9개 누락
	if len(errs) < 9 {
		t.Errorf("최소 9건 에러 기대, 실제=%d", len(errs))
	}
}

// TestGroupInboundRowsByBL_AllowedValuesValidation — 허용값 외 값 → 에러.
func TestGroupInboundRowsByBL_AllowedValuesValidation(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"bl_number": "BL-5", "inbound_type": "WRONG", "company_code": "TS",
			"manufacturer_name": "M", "currency": "USD", "product_code": "P",
			"quantity": 1, "item_type": "main", "payment_type": "paid", "usage_category": "sale",
		},
	}
	_, _, errs, _ := groupInboundRowsByBL(rows)
	if len(errs) == 0 {
		t.Fatal("inbound_type 허용 외 'WRONG' → 에러 기대")
	}
	hasInboundType := false
	for _, e := range errs {
		if e.Field == "inbound_type" {
			hasInboundType = true
		}
	}
	if !hasInboundType {
		t.Errorf("inbound_type 에러 기대, 실제 errs=%v", errs)
	}
}
