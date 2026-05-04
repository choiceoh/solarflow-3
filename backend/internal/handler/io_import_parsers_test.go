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

// --- parseExpenseRow ---

func TestParseExpenseRow(t *testing.T) {
	bl := "bl-1"
	cases := []struct {
		name         string
		row          map[string]interface{}
		blID         *string
		wantErrField string
		wantTotal    float64
	}{
		{
			name:         "정상 (blID, vat 포함)",
			row:          map[string]interface{}{"expense_type": "customs_fee", "amount": 1000.0, "vat": 100.0},
			blID:         &bl,
			wantErrField: "",
			wantTotal:    1100,
		},
		{
			name:         "정상 (month만, vat 없음)",
			row:          map[string]interface{}{"expense_type": "transport", "amount": 500.0, "month": "2026-05"},
			blID:         nil,
			wantErrField: "",
			wantTotal:    500,
		},
		{
			name:         "expense_type 허용 외",
			row:          map[string]interface{}{"expense_type": "WRONG", "amount": 500.0},
			blID:         &bl,
			wantErrField: "expense_type",
		},
		{
			name:         "blID nil + month 없음 → 에러",
			row:          map[string]interface{}{"expense_type": "transport", "amount": 500.0},
			blID:         nil,
			wantErrField: "bl_number/month",
		},
		{
			name:         "amount 잘못된 형식",
			row:          map[string]interface{}{"expense_type": "transport", "amount": "abc"},
			blID:         &bl,
			wantErrField: "amount",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, errs := parseExpenseRow(7, c.row, "comp-1", c.blID)
			if c.wantErrField != "" {
				if len(errs) == 0 || errs[0].Field != c.wantErrField {
					t.Errorf("기대 field=%s, 실제 errs=%v", c.wantErrField, errs)
				}
				return
			}
			if len(errs) > 0 {
				t.Fatalf("통과 기대, 에러: %v", errs)
			}
			if req.Total != c.wantTotal {
				t.Errorf("Total 기대=%v 실제=%v", c.wantTotal, req.Total)
			}
		})
	}
}

// --- parseOutboundRow ---

func TestParseOutboundRow(t *testing.T) {
	cases := []struct {
		name           string
		row            map[string]interface{}
		wattageKW      float64
		wantErrField   string
		wantCapacityKW float64
	}{
		{
			name:           "정상",
			row:            map[string]interface{}{"outbound_date": "2026-05-01", "quantity": 10, "usage_category": "sale"},
			wattageKW:      0.5,
			wantErrField:   "",
			wantCapacityKW: 5.0,
		},
		{
			name:         "quantity 누락",
			row:          map[string]interface{}{"outbound_date": "2026-05-01", "usage_category": "sale"},
			wattageKW:    0.5,
			wantErrField: "quantity",
		},
		{
			name:         "quantity 잘못된 형식",
			row:          map[string]interface{}{"outbound_date": "2026-05-01", "quantity": "abc", "usage_category": "sale"},
			wattageKW:    0.5,
			wantErrField: "quantity",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, errs := parseOutboundRow(7, c.row, "comp-1", "prod-1", "wh-1", c.wattageKW, nil, nil)
			if c.wantErrField != "" {
				if len(errs) == 0 || errs[0].Field != c.wantErrField {
					t.Errorf("기대 field=%s, 실제 errs=%v", c.wantErrField, errs)
				}
				return
			}
			if len(errs) > 0 {
				t.Fatalf("통과 기대, 에러: %v", errs)
			}
			if req.CapacityKw == nil || *req.CapacityKw != c.wantCapacityKW {
				t.Errorf("CapacityKw 기대=%v 실제=%v", c.wantCapacityKW, req.CapacityKw)
			}
			if req.Status != "active" {
				t.Errorf("Status 기대=active 실제=%s", req.Status)
			}
		})
	}
}

// --- parseOrderRow ---

func TestParseOrderRow(t *testing.T) {
	base := func() map[string]interface{} {
		return map[string]interface{}{
			"order_date": "2026-05-01", "receipt_method": "phone",
			"management_category": "sale", "fulfillment_source": "stock",
			"quantity": 10, "unit_price_wp": 0.5,
		}
	}
	cases := []struct {
		name             string
		mutate           func(map[string]interface{})
		wantErrField     string
		wantCapacityKW   float64
		wantUnitPriceWp  float64
	}{
		{name: "정상", mutate: nil, wantErrField: "", wantCapacityKW: 5, wantUnitPriceWp: 0.5},
		{
			name:         "receipt_method 허용 외",
			mutate:       func(r map[string]interface{}) { r["receipt_method"] = "WRONG" },
			wantErrField: "receipt_method",
		},
		{
			name:         "management_category 허용 외",
			mutate:       func(r map[string]interface{}) { r["management_category"] = "WRONG" },
			wantErrField: "management_category",
		},
		{
			name:         "quantity 누락",
			mutate:       func(r map[string]interface{}) { delete(r, "quantity") },
			wantErrField: "quantity",
		},
		{
			name:         "unit_price_wp 잘못된 형식",
			mutate:       func(r map[string]interface{}) { r["unit_price_wp"] = "abc" },
			wantErrField: "unit_price_wp",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			row := base()
			if c.mutate != nil {
				c.mutate(row)
			}
			req, errs := parseOrderRow(7, row, "comp-1", "cust-1", "prod-1", 0.5)
			if c.wantErrField != "" {
				if len(errs) == 0 || errs[0].Field != c.wantErrField {
					t.Errorf("기대 field=%s, 실제 errs=%v", c.wantErrField, errs)
				}
				return
			}
			if len(errs) > 0 {
				t.Fatalf("통과 기대, 에러: %v", errs)
			}
			if req.CapacityKw == nil || *req.CapacityKw != c.wantCapacityKW {
				t.Errorf("CapacityKw 기대=%v 실제=%v", c.wantCapacityKW, req.CapacityKw)
			}
			if req.UnitPriceWp != c.wantUnitPriceWp {
				t.Errorf("UnitPriceWp 기대=%v 실제=%v", c.wantUnitPriceWp, req.UnitPriceWp)
			}
			if req.Status != "received" {
				t.Errorf("Status 기대=received 실제=%s", req.Status)
			}
		})
	}
}

// --- parseSaleRow ---

func TestParseSaleRow(t *testing.T) {
	cases := []struct {
		name             string
		row              map[string]interface{}
		quantity, specWP float64
		wantErrField     string
		wantSupply       float64 // 통과 시 검증
		wantVat          float64
	}{
		{
			name:         "정상 — 자동 계산 (10장 × 500Wp × 100원/Wp)",
			row:          map[string]interface{}{"unit_price_wp": 100.0},
			quantity:     10, specWP: 500,
			wantErrField: "",
			wantSupply:   500000, // 100 × 500 × 10
			wantVat:      50000,  // 10%
		},
		{
			name:         "unit_price_wp 0",
			row:          map[string]interface{}{"unit_price_wp": 0.0},
			quantity:     10, specWP: 500,
			wantErrField: "unit_price_wp",
		},
		{
			name:         "unit_price_wp 음수",
			row:          map[string]interface{}{"unit_price_wp": -1.0},
			quantity:     10, specWP: 500,
			wantErrField: "unit_price_wp",
		},
		{
			name:         "unit_price_wp 형식 오류",
			row:          map[string]interface{}{"unit_price_wp": "abc"},
			quantity:     10, specWP: 500,
			wantErrField: "unit_price_wp",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, errs := parseSaleRow(7, c.row, "ob-1", "cust-1", c.quantity, c.specWP)
			if c.wantErrField != "" {
				if len(errs) == 0 || errs[0].Field != c.wantErrField {
					t.Errorf("기대 field=%s, 실제 errs=%v", c.wantErrField, errs)
				}
				return
			}
			if len(errs) > 0 {
				t.Fatalf("통과 기대, 에러: %v", errs)
			}
			if req.SupplyAmount == nil || *req.SupplyAmount != c.wantSupply {
				t.Errorf("SupplyAmount 기대=%v 실제=%v", c.wantSupply, req.SupplyAmount)
			}
			if req.VatAmount == nil || *req.VatAmount != c.wantVat {
				t.Errorf("VatAmount 기대=%v 실제=%v", c.wantVat, req.VatAmount)
			}
			expectedTotal := c.wantSupply + c.wantVat
			if req.TotalAmount == nil || *req.TotalAmount != expectedTotal {
				t.Errorf("TotalAmount 기대=%v 실제=%v", expectedTotal, req.TotalAmount)
			}
		})
	}
}

// --- parseDeclarationRow ---

func TestParseDeclarationRow(t *testing.T) {
	row := map[string]interface{}{
		"declaration_number": "DECL-1",
		"declaration_date":   "2026-05-01",
		"hs_code":            "8541.40",
	}
	req, errs := parseDeclarationRow(7, row, "bl-1", "comp-1")
	if len(errs) > 0 {
		t.Fatalf("정상 기대, 에러: %v", errs)
	}
	if req.DeclarationNumber != "DECL-1" || req.BLID != "bl-1" || req.CompanyID != "comp-1" {
		t.Errorf("필드 매핑 잘못: %+v", req)
	}
	if req.HSCode == nil || *req.HSCode != "8541.40" {
		t.Errorf("HSCode 매핑 잘못: %v", req.HSCode)
	}
}

// --- parseDeclarationCostRow ---

func TestParseDeclarationCostRow(t *testing.T) {
	cases := []struct {
		name         string
		row          map[string]interface{}
		wattageKW    float64
		wantErrField string
		wantCifWpKrw float64 // 통과 시 검증
	}{
		{
			name: "정상 자동 계산 (cif_total_krw 5,000,000원 ÷ (10 × 0.5kW × 1000) = 1,000원/Wp)",
			row: map[string]interface{}{
				"quantity": 10, "exchange_rate": 1300.0, "cif_total_krw": 5000000.0,
			},
			wattageKW:    0.5,
			wantErrField: "",
			wantCifWpKrw: 1000, // 5,000,000 / (5kW × 1000) = 1000
		},
		{
			// wattage 0 → cif_wp_krw=0 → model.Validate가 양수 강제하므로 cost_detail 에러 반환
			name: "wattage 0 → cif_wp_krw=0 → Validate 실패 (양수 강제)",
			row: map[string]interface{}{
				"quantity": 10, "exchange_rate": 1300.0, "cif_total_krw": 5000000.0,
			},
			wattageKW:    0,
			wantErrField: "cost_detail",
		},
		{
			name: "quantity 누락",
			row: map[string]interface{}{
				"exchange_rate": 1300.0, "cif_total_krw": 5000000.0,
			},
			wattageKW:    0.5,
			wantErrField: "quantity",
		},
		{
			name: "exchange_rate 누락",
			row: map[string]interface{}{
				"quantity": 10, "cif_total_krw": 5000000.0,
			},
			wattageKW:    0.5,
			wantErrField: "exchange_rate",
		},
		{
			name: "cif_total_krw 누락",
			row: map[string]interface{}{
				"quantity": 10, "exchange_rate": 1300.0,
			},
			wattageKW:    0.5,
			wantErrField: "cif_total_krw",
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req, errs := parseDeclarationCostRow(7, c.row, "decl-1", "prod-1", c.wattageKW)
			if c.wantErrField != "" {
				if len(errs) == 0 || errs[0].Field != c.wantErrField {
					t.Errorf("기대 field=%s, 실제 errs=%v", c.wantErrField, errs)
				}
				return
			}
			if len(errs) > 0 {
				t.Fatalf("통과 기대, 에러: %v", errs)
			}
			if req.CifWpKrw != c.wantCifWpKrw {
				t.Errorf("CifWpKrw 기대=%v 실제=%v", c.wantCifWpKrw, req.CifWpKrw)
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

// --- groupPORowsByPONumber ---

// TestGroupPORowsByPONumber_Happy — 같은 po_number의 라인 N개가 한 그룹으로 묶이는지.
func TestGroupPORowsByPONumber_Happy(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"po_number": "PO-1", "company_code": "TS", "manufacturer_name": "JKO",
			"contract_type": "spot", "contract_date": "2026-05-01",
			"product_code": "M580", "quantity": 100, "unit_price_usd_wp": 0.09,
			"item_type": "main", "payment_type": "paid",
		},
		{
			"po_number": "PO-1", "company_code": "TS", "manufacturer_name": "JKO",
			"contract_type": "spot", "contract_date": "2026-05-01",
			"product_code": "M600", "quantity": 50, "unit_price_usd_wp": 0.10,
			"item_type": "spare", "payment_type": "free",
		},
		{
			"po_number": "PO-2", "company_code": "TS", "manufacturer_name": "TWS",
			"contract_type": "frame", "contract_date": "2026-05-02",
			"product_code": "M580", "quantity": 200, "unit_price_usd_wp": 0.085,
			"item_type": "main", "payment_type": "paid",
		},
	}
	groups, order, errs, warns := groupPORowsByPONumber(rows)
	if len(errs) > 0 {
		t.Fatalf("에러 없음 기대, 실제: %v", errs)
	}
	if len(warns) > 0 {
		t.Errorf("경고 없음 기대, 실제: %v", warns)
	}
	if len(order) != 2 || order[0] != "PO-1" || order[1] != "PO-2" {
		t.Fatalf("order 기대=[PO-1, PO-2], 실제=%v", order)
	}
	if len(groups["PO-1"].LineRows) != 2 {
		t.Errorf("PO-1 라인 2개 기대, 실제=%d", len(groups["PO-1"].LineRows))
	}
	if len(groups["PO-2"].LineRows) != 1 {
		t.Errorf("PO-2 라인 1개 기대, 실제=%d", len(groups["PO-2"].LineRows))
	}
}

// TestGroupPORowsByPONumber_ContractTypeAlias — '스팟'/'프레임' 한글 라벨이 코드값으로 정규화되는지.
func TestGroupPORowsByPONumber_ContractTypeAlias(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"po_number": "PO-1", "company_code": "TS", "manufacturer_name": "JKO",
			"contract_type": "스팟", "contract_date": "2026-05-01",
			"product_code": "M580", "quantity": 100, "unit_price_usd_wp": 0.09,
			"item_type": "main", "payment_type": "paid",
		},
	}
	groups, _, errs, _ := groupPORowsByPONumber(rows)
	if len(errs) > 0 {
		t.Fatalf("'스팟' alias 통과 기대, 에러: %v", errs)
	}
	if got := getString(groups["PO-1"].FirstRow, "contract_type"); got != "spot" {
		t.Errorf("contract_type 'spot' 정규화 기대, 실제=%s", got)
	}
}

// TestGroupPORowsByPONumber_HeaderInconsistencyWarning — 같은 PO 안 헤더가 다르면 경고 (첫 행 채택).
func TestGroupPORowsByPONumber_HeaderInconsistencyWarning(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"po_number": "PO-1", "company_code": "TS", "manufacturer_name": "JKO",
			"contract_type": "spot", "contract_date": "2026-05-01",
			"incoterms": "FOB",
			"product_code": "M580", "quantity": 100, "unit_price_usd_wp": 0.09,
			"item_type": "main", "payment_type": "paid",
		},
		{
			"po_number": "PO-1", "company_code": "TS", "manufacturer_name": "JKO",
			"contract_type": "spot", "contract_date": "2026-05-01",
			"incoterms": "CIF", // 첫 행과 다름
			"product_code": "M600", "quantity": 50, "unit_price_usd_wp": 0.10,
			"item_type": "main", "payment_type": "paid",
		},
	}
	_, _, errs, warns := groupPORowsByPONumber(rows)
	if len(errs) > 0 {
		t.Fatalf("에러 없음 기대, 실제: %v", errs)
	}
	if len(warns) == 0 {
		t.Fatal("incoterms 불일치 경고 기대")
	}
	hasIncotermsWarn := false
	for _, w := range warns {
		if w.Field == "incoterms" && strings.Contains(w.Message, "첫 행 값 사용") {
			hasIncotermsWarn = true
		}
	}
	if !hasIncotermsWarn {
		t.Errorf("incoterms 경고 기대, 실제=%v", warns)
	}
}

// TestGroupPORowsByPONumber_RejectsLegacyContractType — 레거시 contract_type(annual 등) 신규 등록 차단.
func TestGroupPORowsByPONumber_RejectsLegacyContractType(t *testing.T) {
	rows := []map[string]interface{}{
		{
			"po_number": "PO-1", "company_code": "TS", "manufacturer_name": "JKO",
			"contract_type": "annual", "contract_date": "2026-05-01",
			"product_code": "M580", "quantity": 100, "unit_price_usd_wp": 0.09,
			"item_type": "main", "payment_type": "paid",
		},
	}
	_, _, errs, _ := groupPORowsByPONumber(rows)
	if len(errs) == 0 {
		t.Fatal("레거시 'annual' 차단 기대")
	}
	if errs[0].Field != "contract_type" {
		t.Errorf("contract_type 에러 기대, 실제 field=%s", errs[0].Field)
	}
}

// TestGroupPORowsByPONumber_MissingRequired — 필수 필드 누락 시 다건 에러.
func TestGroupPORowsByPONumber_MissingRequired(t *testing.T) {
	rows := []map[string]interface{}{
		{}, // 모든 필수 누락
	}
	_, _, errs, _ := groupPORowsByPONumber(rows)
	// 필수 10개 (po_number, company_code, manufacturer_name, contract_type, contract_date,
	//          product_code, quantity, unit_price_usd_wp, item_type, payment_type)
	if len(errs) < 10 {
		t.Errorf("최소 10건 에러 기대, 실제=%d", len(errs))
	}
}

// --- parsePOLineRow ---

// TestParsePOLineRow_HappyAndConversion — USD/Wp × wattage_kw × 1000 = USD/panel 정확성.
func TestParsePOLineRow_HappyAndConversion(t *testing.T) {
	// 580Wp 패널 = wattage_kw 0.580. 0.09 USD/Wp × 580 = 52.2 USD/panel.
	row := map[string]interface{}{
		"quantity": 100, "unit_price_usd_wp": 0.09,
		"item_type": "main", "payment_type": "paid",
		"line_memo": "라인 메모",
	}
	req, errs := parsePOLineRow(7, row, "prod-1", 0.580)
	if len(errs) > 0 {
		t.Fatalf("통과 기대, 에러: %v", errs)
	}
	if req.ProductID != "prod-1" {
		t.Errorf("ProductID 기대=prod-1 실제=%s", req.ProductID)
	}
	if req.Quantity != 100 {
		t.Errorf("Quantity 기대=100 실제=%d", req.Quantity)
	}
	if req.UnitPriceUSD == nil || *req.UnitPriceUSD < 52.19 || *req.UnitPriceUSD > 52.21 {
		t.Errorf("UnitPriceUSD 52.2 근방 기대, 실제=%v", req.UnitPriceUSD)
	}
	if req.TotalAmountUSD == nil || *req.TotalAmountUSD < 5219.99 || *req.TotalAmountUSD > 5220.01 {
		t.Errorf("TotalAmountUSD 5220 근방 기대, 실제=%v", req.TotalAmountUSD)
	}
	if req.ItemType == nil || *req.ItemType != "main" {
		t.Errorf("ItemType 'main' 기대, 실제=%v", req.ItemType)
	}
	if req.Memo == nil || *req.Memo != "라인 메모" {
		t.Errorf("Memo '라인 메모' 기대, 실제=%v", req.Memo)
	}
}

// TestParsePOLineRow_RejectsNonPositive — 수량/단가 0·음수 차단.
func TestParsePOLineRow_RejectsNonPositive(t *testing.T) {
	cases := []struct {
		name      string
		row       map[string]interface{}
		wantField string
	}{
		{"quantity 0", map[string]interface{}{"quantity": 0, "unit_price_usd_wp": 0.09}, "quantity"},
		{"quantity 음수", map[string]interface{}{"quantity": -1, "unit_price_usd_wp": 0.09}, "quantity"},
		{"unit_price 0", map[string]interface{}{"quantity": 100, "unit_price_usd_wp": 0.0}, "unit_price_usd_wp"},
		{"unit_price 음수", map[string]interface{}{"quantity": 100, "unit_price_usd_wp": -0.01}, "unit_price_usd_wp"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, errs := parsePOLineRow(7, c.row, "p", 0.580)
			if len(errs) == 0 {
				t.Fatalf("에러 기대(field=%s)", c.wantField)
			}
			if errs[0].Field != c.wantField {
				t.Errorf("기대 field=%s, 실제=%s", c.wantField, errs[0].Field)
			}
		})
	}
}

// --- parseLCRow ---

// TestParseLCRow_Happy — 정상 입력 + status 'pending' 기본값.
func TestParseLCRow_Happy(t *testing.T) {
	row := map[string]interface{}{
		"lc_number":  "M0123",
		"open_date":  "2026-05-04",
		"amount_usd": 250000.0,
		"target_qty": 2500,
		"usance_days": 90,
		"usance_type": "BANKER'S USANCE",
		"maturity_date": "2026-08-02",
		"memo": "테스트",
	}
	req, errs := parseLCRow(7, row, "po-1", "bank-1", "co-1")
	if len(errs) > 0 {
		t.Fatalf("통과 기대, 에러: %v", errs)
	}
	if req.POID != "po-1" || req.BankID != "bank-1" || req.CompanyID != "co-1" {
		t.Errorf("FK 매핑 실패: %+v", req)
	}
	if req.AmountUSD != 250000 {
		t.Errorf("AmountUSD 250000 기대, 실제=%v", req.AmountUSD)
	}
	if req.UsanceType == nil || *req.UsanceType != "buyers" {
		t.Errorf("UsanceType 'buyers' 정규화 기대, 실제=%v", req.UsanceType)
	}
	if req.Status != "pending" {
		t.Errorf("Status 'pending' 기본 기대, 실제=%s", req.Status)
	}
	if req.LCNumber == nil || *req.LCNumber != "M0123" {
		t.Errorf("LCNumber 'M0123' 기대, 실제=%v", req.LCNumber)
	}
}

// TestParseLCRow_UsanceTypeNormalization — 다양한 라벨 → buyers/shippers/nil 정규화.
func TestParseLCRow_UsanceTypeNormalization(t *testing.T) {
	cases := []struct {
		input    string
		wantNil  bool
		wantCode string
	}{
		{"BANKER'S USANCE", false, "buyers"},
		{"BANKERS USANCE", false, "buyers"},
		{"banker's usance", false, "buyers"},
		{"SHIPPER'S USANCE", false, "shippers"},
		{"shippers", false, "shippers"},
		{"AT SIGHT", true, ""},
		{"buyers", false, "buyers"},
	}
	for _, c := range cases {
		t.Run(c.input, func(t *testing.T) {
			row := map[string]interface{}{
				"amount_usd":  250000.0,
				"usance_type": c.input,
			}
			req, errs := parseLCRow(7, row, "po", "bank", "co")
			if len(errs) > 0 {
				t.Fatalf("통과 기대, 에러: %v", errs)
			}
			if c.wantNil {
				if req.UsanceType != nil {
					t.Errorf("nil 기대, 실제=*%s", *req.UsanceType)
				}
			} else {
				if req.UsanceType == nil {
					t.Fatalf("값 기대(%s), 실제=nil", c.wantCode)
				}
				if *req.UsanceType != c.wantCode {
					t.Errorf("기대=%s, 실제=%s", c.wantCode, *req.UsanceType)
				}
			}
		})
	}
}

// TestParseLCRow_RejectsUnknownUsanceType — 알 수 없는 usance_type → 검증 실패.
func TestParseLCRow_RejectsUnknownUsanceType(t *testing.T) {
	row := map[string]interface{}{
		"amount_usd":  250000.0,
		"usance_type": "WEIRD_TYPE",
	}
	_, errs := parseLCRow(7, row, "po", "bank", "co")
	if len(errs) == 0 {
		t.Fatal("알 수 없는 usance_type 거부 기대")
	}
	if errs[0].Field != "usance_type" {
		t.Errorf("usance_type 에러 기대, 실제=%s", errs[0].Field)
	}
}

// TestParseLCRow_RejectsNonPositiveAmount — amount_usd 0/음수 차단.
func TestParseLCRow_RejectsNonPositiveAmount(t *testing.T) {
	cases := []struct {
		name string
		amt  interface{}
	}{
		{"0", 0.0},
		{"음수", -100.0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			row := map[string]interface{}{"amount_usd": c.amt}
			_, errs := parseLCRow(7, row, "po", "bank", "co")
			if len(errs) == 0 {
				t.Fatalf("amount_usd %v 거부 기대", c.amt)
			}
			if errs[0].Field != "amount_usd" {
				t.Errorf("amount_usd 에러 기대, 실제=%s", errs[0].Field)
			}
		})
	}
}
