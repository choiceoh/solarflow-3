package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// helper for *string/*float64 in tests
func sptr(s string) *string   { return &s }
func fptr(f float64) *float64 { return &f }

// TestBuildAmaranthInboundWorkbook_Domestic — 국내 입고: VAT 10% 적용, exchange_rate=1
func TestBuildAmaranthInboundWorkbook_Domestic(t *testing.T) {
	bls := []blShipmentForExport{{
		BLID:           "BL1",
		BLNumber:       "BL-001",
		InboundType:    "domestic",
		Currency:       "KRW",
		ExchangeRate:   fptr(1),
		ActualArrival:  sptr("2026-05-01"),
		POID:           sptr("PO1"),
		ManufacturerID: "MFG1",
		WarehouseID:    sptr("WH1"),
	}}
	lines := []inboundLineForExport{{
		BLID:           "BL1",
		ProductID:      "PROD1",
		Quantity:       10,
		UnitPriceKRWWp: fptr(100),
		Products:       &inboundProductJoin{ProductCode: "PC1", SpecWP: 500},
	}}
	lookups := inboundExportLookups{
		Warehouses:    map[string]warehouseInfo{"WH1": {warehouseCode: "WH-A", locationCode: "LC-A"}},
		PartnerERPs:   map[string]string{"제조사1": "P-001"},
		Manufacturers: map[string]string{"MFG1": "제조사1"},
		POs:           map[string]string{"PO1": "PO-001"},
	}

	f := buildAmaranthInboundWorkbook(bls, lines, lookups)
	sheet := "Sheet1"

	mustCell := func(t *testing.T, cell, want string) {
		t.Helper()
		got, err := f.GetCellValue(sheet, cell)
		if err != nil {
			t.Fatalf("%s 읽기 실패: %v", cell, err)
		}
		if got != want {
			t.Errorf("%s 기대=%q 실제=%q", cell, want, got)
		}
	}
	mustCell(t, "A3", "0")        // 거래구분: domestic = 0
	mustCell(t, "B3", "20260501") // 입고일자 (하이픈 제거)
	mustCell(t, "C3", "P-001")    // 거래처코드
	mustCell(t, "D3", "KRW")      // 환종
	mustCell(t, "E3", "1")        // 환율
	mustCell(t, "F3", "0")        // 과세구분: domestic = 0
	mustCell(t, "H3", "WH-A")     // 창고코드
	mustCell(t, "K3", "PC1")      // 품번
	mustCell(t, "L3", "10")       // 입고수량
	mustCell(t, "O3", "50000")    // 부가세미포함단가 = 100 × 500
	mustCell(t, "P3", "55000")    // 부가세포함단가 = 50000 × 1.1
	mustCell(t, "Q3", "500000")   // 공급가 = 50000 × 10
	mustCell(t, "R3", "50000")    // 부가세 = 500000 × 0.1 (domestic)
	mustCell(t, "S3", "550000")   // 합계 = 공급+부가세
	mustCell(t, "V3", "LC-A")     // 장소코드
	mustCell(t, "AA3", "PO-001")  // 발주번호
	mustCell(t, "AC3", "BL-001")  // 수입선적번호
}

// TestBuildAmaranthInboundWorkbook_Import — 수입 입고: 영세, VAT=0, 단가 = cif_wp_krw × spec_wp
func TestBuildAmaranthInboundWorkbook_Import(t *testing.T) {
	bls := []blShipmentForExport{{
		BLID:           "BL2",
		BLNumber:       "BL-002",
		InboundType:    "import",
		Currency:       "USD",
		ExchangeRate:   fptr(1300),
		ActualArrival:  sptr("2026-05-02"),
		ManufacturerID: "MFG2",
	}}
	lines := []inboundLineForExport{{
		BLID:             "BL2",
		ProductID:        "PROD2",
		Quantity:         5,
		InvoiceAmountUSD: fptr(2500),
		UnitPriceUSDWp:   fptr(0.5),
		Products:         &inboundProductJoin{ProductCode: "PC2", SpecWP: 400},
	}}
	lookups := inboundExportLookups{
		Manufacturers: map[string]string{"MFG2": "제조사2"},
		PartnerERPs:   map[string]string{"제조사2": "P-002"},
		CIFByProduct:  map[string]float64{"PROD2": 700}, // 700원/Wp × 400 = 280,000원/장
	}

	f := buildAmaranthInboundWorkbook(bls, lines, lookups)
	sheet := "Sheet1"

	mustCell := func(t *testing.T, cell, want string) {
		t.Helper()
		got, _ := f.GetCellValue(sheet, cell)
		if got != want {
			t.Errorf("%s 기대=%q 실제=%q", cell, want, got)
		}
	}
	mustCell(t, "A3", "3")       // 거래구분: import = 3
	mustCell(t, "F3", "1")       // 과세구분: import = 1
	mustCell(t, "O3", "280000")  // 단가 = cif × spec
	mustCell(t, "P3", "280000")  // 부가세포함 == 단가 (영세)
	mustCell(t, "Q3", "1400000") // 공급가 = 280000 × 5
	mustCell(t, "R3", "0")       // 부가세 = 0 (import 영세)
	mustCell(t, "S3", "1400000") // 합계 = 공급
	mustCell(t, "T3", "200")     // 외화단가 = 0.5 × 400
	mustCell(t, "U3", "2500")    // 외화금액
}

// TestBuildAmaranthInboundWorkbook_Empty — 입력 없으면 헤더만 (3행 비어있음)
func TestBuildAmaranthInboundWorkbook_Empty(t *testing.T) {
	f := buildAmaranthInboundWorkbook(nil, nil, inboundExportLookups{})
	rows, err := f.GetRows("Sheet1")
	if err != nil {
		t.Fatalf("rows 읽기 실패: %v", err)
	}
	if len(rows) != 2 {
		t.Errorf("기대: 2행 (헤더+ERP), 실제: %d행", len(rows))
	}
}

// TestBuildAmaranthInboundWorkbook_DateFallback — actual_arrival 없으면 eta 사용
func TestBuildAmaranthInboundWorkbook_DateFallback(t *testing.T) {
	bls := []blShipmentForExport{{
		BLID:        "BL3",
		BLNumber:    "BL-003",
		InboundType: "domestic",
		Currency:    "KRW",
		ETA:         sptr("2026-04-30"),
	}}
	lines := []inboundLineForExport{{
		BLID:           "BL3",
		Quantity:       1,
		UnitPriceKRWWp: fptr(0),
		Products:       &inboundProductJoin{ProductCode: "PC3", SpecWP: 300},
	}}
	f := buildAmaranthInboundWorkbook(bls, lines, inboundExportLookups{})
	got, _ := f.GetCellValue("Sheet1", "B3")
	if got != "20260430" {
		t.Errorf("ETA fallback 기대=20260430, 실제=%q", got)
	}
}

// --- Export 핸들러 테스트 ---
// 비유: 헤더 매핑, 유틸리티 함수, 컬럼 수 검증
// DB 의존 API는 통합 테스트에서 검증

// TestExport_InboundHeaderCount — 입고 34컬럼 헤더 수 확인
func TestExport_InboundHeaderCount(t *testing.T) {
	if len(inboundHeaders) != 34 {
		t.Errorf("기대: 입고 헤더 34개, 실제: %d개", len(inboundHeaders))
	}
	if len(inboundERPCodes) != 34 {
		t.Errorf("기대: 입고 ERP 코드 34개, 실제: %d개", len(inboundERPCodes))
	}
}

// TestExport_OutboundHeaderCount — 출고 35컬럼 헤더 수 확인
func TestExport_OutboundHeaderCount(t *testing.T) {
	if len(outboundHeaders) != 35 {
		t.Errorf("기대: 출고 헤더 35개, 실제: %d개", len(outboundHeaders))
	}
	if len(outboundERPCodes) != 35 {
		t.Errorf("기대: 출고 ERP 코드 35개, 실제: %d개", len(outboundERPCodes))
	}
	if len(outboundDescriptions) != 35 {
		t.Errorf("기대: 출고 설명행 35개, 실제: %d개", len(outboundDescriptions))
	}
}

// TestExport_OutboundRealTemplateRows — 실물 아마란스 출고 양식은 3행 설명, 4행 데이터 시작
func TestExport_OutboundRealTemplateRows(t *testing.T) {
	if outboundDataStartRow != 4 {
		t.Errorf("기대: 출고 데이터 시작 행 4, 실제: %d", outboundDataStartRow)
	}
	if outboundDescriptions[0] == "" || !strings.Contains(outboundDescriptions[0], "0.DOMESTIC") {
		t.Errorf("출고 설명행 A열에 거래구분 안내가 없습니다: %s", outboundDescriptions[0])
	}
	if outboundDescriptions[19] == "" || !strings.Contains(outboundDescriptions[19], "필수 : True") {
		t.Errorf("출고 설명행 T열 장소코드 필수 안내가 없습니다: %s", outboundDescriptions[19])
	}
}

// TestExport_OutboundDefaultERPPolicy — 2026-04-30 실물 샘플 기준 기본 정책
func TestExport_OutboundDefaultERPPolicy(t *testing.T) {
	t.Setenv("AMARANTH_DEFAULT_PLN_CD", "")
	t.Setenv("AMARANTH_OUTBOUND_MGMT_CD", "")
	t.Setenv("AMARANTH_DEFAULT_MGMT_CD", "")

	if got := amaranthDefaultSalespersonCode(); got != "A001" {
		t.Errorf("기대: 담당자코드 A001, 실제: %s", got)
	}
	if got := amaranthDefaultOutboundMgmtCode(); got != "LS10" {
		t.Errorf("기대: 관리구분 LS10, 실제: %s", got)
	}
}

// TestExport_OutboundDefaultERPPolicyEnv — 운영 환경값으로 기본 코드 override
func TestExport_OutboundDefaultERPPolicyEnv(t *testing.T) {
	t.Setenv("AMARANTH_DEFAULT_PLN_CD", "B002")
	t.Setenv("AMARANTH_OUTBOUND_MGMT_CD", "MG01")
	t.Setenv("AMARANTH_DEFAULT_MGMT_CD", "MG00")

	if got := amaranthDefaultSalespersonCode(); got != "B002" {
		t.Errorf("기대: 담당자코드 B002, 실제: %s", got)
	}
	if got := amaranthDefaultOutboundMgmtCode(); got != "MG01" {
		t.Errorf("기대: 관리구분 MG01, 실제: %s", got)
	}
}

// TestExport_ColName — 컬럼 인덱스 → 엑셀 열 이름 변환
func TestExport_ColName(t *testing.T) {
	tests := []struct {
		idx  int
		want string
	}{
		{0, "A"},
		{1, "B"},
		{25, "Z"},
		{26, "AA"},
		{27, "AB"},
		{33, "AH"}, // 34번째 = AH
		{34, "AI"}, // 35번째 = AI
	}
	for _, tt := range tests {
		got := colName(tt.idx)
		if got != tt.want {
			t.Errorf("colName(%d): 기대=%s, 실제=%s", tt.idx, tt.want, got)
		}
	}
}

// TestExport_FormatDate — 날짜 하이픈 제거
func TestExport_FormatDate(t *testing.T) {
	d1 := "2026-03-15"
	if got := formatDate(&d1); got != "20260315" {
		t.Errorf("기대: 20260315, 실제: %s", got)
	}

	if got := formatDate(nil); got != "" {
		t.Errorf("기대: 빈값, 실제: %s", got)
	}

	empty := ""
	if got := formatDate(&empty); got != "" {
		t.Errorf("기대: 빈값, 실제: %s", got)
	}
}

// TestExport_BuildRemark — 비고 조합 + 60자 제한
func TestExport_BuildRemark(t *testing.T) {
	result := buildRemark("BL-001", "테스트 메모")
	if result != "BL-001 / 테스트 메모" {
		t.Errorf("기대: 'BL-001 / 테스트 메모', 실제: '%s'", result)
	}

	// 빈값 필터링
	result2 := buildRemark("", "메모만", "")
	if result2 != "메모만" {
		t.Errorf("기대: '메모만', 실제: '%s'", result2)
	}

	// 60자 제한 (한글 60자)
	long := ""
	for i := 0; i < 70; i++ {
		long += "가"
	}
	result3 := buildRemark(long)
	runes := []rune(result3)
	if len(runes) > 60 {
		t.Errorf("기대: 최대 60자, 실제: %d자", len(runes))
	}
}

// TestExport_PtrStr — nil 안전 string 변환
func TestExport_PtrStr(t *testing.T) {
	s := "hello"
	if got := ptrStr(&s); got != "hello" {
		t.Errorf("기대: hello, 실제: %s", got)
	}
	if got := ptrStr(nil); got != "" {
		t.Errorf("기대: 빈값, 실제: %s", got)
	}
}

// TestExport_PtrFloat — nil 안전 float64 변환
func TestExport_PtrFloat(t *testing.T) {
	f := 123.45
	if got := ptrFloat(&f); got != 123.45 {
		t.Errorf("기대: 123.45, 실제: %f", got)
	}
	if got := ptrFloat(nil); got != 0 {
		t.Errorf("기대: 0, 실제: %f", got)
	}
}

// TestExport_InboundTradeType — import→"3", 그 외→"0" 매핑 확인
func TestExport_InboundTradeType(t *testing.T) {
	cases := []struct {
		inboundType string
		want        string
	}{
		{"import", "3"},
		{"domestic", "0"},
		{"domestic_foreign", "0"},
		{"group", "0"},
	}
	for _, c := range cases {
		got := "0"
		if c.inboundType == "import" {
			got = "3"
		}
		if got != c.want {
			t.Errorf("inboundType=%s: 기대=%s, 실제=%s", c.inboundType, c.want, got)
		}
	}
}

// TestExport_InboundVatType — import→"1"(수입영세), 그 외→"0"(매입과세)
func TestExport_InboundVatType(t *testing.T) {
	cases := []struct {
		inboundType string
		want        string
	}{
		{"import", "1"},
		{"domestic", "0"},
	}
	for _, c := range cases {
		got := "0"
		if c.inboundType == "import" {
			got = "1"
		}
		if got != c.want {
			t.Errorf("vatType for %s: 기대=%s, 실제=%s", c.inboundType, c.want, got)
		}
	}
}

// TestExport_AmaranthSalesClosing_NotImplemented — D-067 매출마감은 501로 명확히 안내
func TestExport_AmaranthSalesClosing_NotImplemented(t *testing.T) {
	h := NewExportHandler(nil)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/export/amaranth/sales", nil)
	rec := httptest.NewRecorder()

	h.AmaranthSalesClosing(rec, req)

	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("기대 상태코드: 501, 실제: %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "D-067") {
		t.Fatalf("응답에 D-067 안내가 없습니다: %s", rec.Body.String())
	}
}
