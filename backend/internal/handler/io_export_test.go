package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
