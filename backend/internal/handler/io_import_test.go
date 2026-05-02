package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"solarflow-backend/internal/model"
)

// --- Import 핸들러 테스트 ---
// 비유: DB 없이 요청 파싱, 빈 배열 처리, 잘못된 JSON 등 기본 동작 검증
// DB 의존 로직(FK 해소, INSERT)은 통합 테스트에서 검증

// TestImport_Inbound_EmptyRows — 빈 배열 → 400
func TestImport_Inbound_EmptyRows(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `{"rows":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/inbound", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Inbound(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// TestImport_Inbound_InvalidJSON — 잘못된 JSON → 400
func TestImport_Inbound_InvalidJSON(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `not json`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/inbound", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Inbound(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// TestImport_Outbound_EmptyRows — 빈 배열 → 400
func TestImport_Outbound_EmptyRows(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `{"rows":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/outbound", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Outbound(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// TestImport_Sales_EmptyRows — 빈 배열 → 400
func TestImport_Sales_EmptyRows(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `{"rows":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/sales", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Sales(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// TestImport_Declarations_EmptyBoth — 면장+원가 둘 다 빈 배열 → 400
func TestImport_Declarations_EmptyBoth(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `{"declarations":[],"costs":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/declarations", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Declarations(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// TestImport_Expenses_EmptyRows — 빈 배열 → 400
func TestImport_Expenses_EmptyRows(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `{"rows":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/expenses", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Expenses(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// TestImport_Orders_EmptyRows — 빈 배열 → 400
func TestImport_Orders_EmptyRows(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `{"rows":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/orders", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Orders(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// TestImport_Receipts_EmptyRows — 빈 배열 → 400
func TestImport_Receipts_EmptyRows(t *testing.T) {
	h := &ImportHandler{DB: nil}
	body := `{"rows":[]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/import/receipts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Receipts(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}
}

// --- 공통 헬퍼 테스트 ---

// TestGetString — getString 헬퍼
func TestGetString(t *testing.T) {
	row := map[string]interface{}{
		"name":  "  test  ",
		"empty": "",
		"nil":   nil,
	}

	if got := getString(row, "name"); got != "test" {
		t.Errorf("기대: 'test', 실제: '%s'", got)
	}
	if got := getString(row, "empty"); got != "" {
		t.Errorf("기대: '', 실제: '%s'", got)
	}
	if got := getString(row, "nil"); got != "" {
		t.Errorf("기대: '', 실제: '%s'", got)
	}
	if got := getString(row, "missing"); got != "" {
		t.Errorf("기대: '', 실제: '%s'", got)
	}
}

// TestGetFloat — getFloat 헬퍼
func TestGetFloat(t *testing.T) {
	row := map[string]interface{}{
		"float": 123.45,
		"int":   42,
		"nil":   nil,
	}

	if f, ok := getFloat(row, "float"); !ok || f != 123.45 {
		t.Errorf("기대: (123.45, true), 실제: (%f, %v)", f, ok)
	}
	if f, ok := getFloat(row, "int"); !ok || f != 42.0 {
		t.Errorf("기대: (42, true), 실제: (%f, %v)", f, ok)
	}
	if _, ok := getFloat(row, "nil"); ok {
		t.Error("nil에서 ok=true를 반환함")
	}
	if _, ok := getFloat(row, "missing"); ok {
		t.Error("없는 키에서 ok=true를 반환함")
	}
}

// TestGetBoolPtr — Y/N → *bool 변환
func TestGetBoolPtr(t *testing.T) {
	row := map[string]interface{}{
		"yes":   "Y",
		"no":    "n",
		"empty": "",
	}

	if b := getBoolPtr(row, "yes"); b == nil || !*b {
		t.Error("기대: true, 실제: nil 또는 false")
	}
	if b := getBoolPtr(row, "no"); b == nil || *b {
		t.Error("기대: false, 실제: nil 또는 true")
	}
	if b := getBoolPtr(row, "empty"); b != nil {
		t.Error("기대: nil, 실제: non-nil")
	}
}

// TestValidateRequired — 필수 필드 검증
func TestValidateRequired(t *testing.T) {
	row := map[string]interface{}{
		"a": "value",
		"b": "",
		"c": nil,
	}

	errs := validateRequired(2, row, []string{"a", "b", "c", "d"})
	// b, c, d 누락 → 3건 에러
	if len(errs) != 3 {
		t.Errorf("기대: 3건 에러, 실제: %d건", len(errs))
	}
}

// TestAssertFloat — assertFloat가 다양한 입력 타입을 안전하게 변환하는지 검증.
// 비유: 봉투 안 숫자가 어떤 형태로 와도(float/int/json.Number/문자열) 동일 규격으로 꺼냄.
// 회귀 위험: 타입 단정 실패를 zero value로 흘리면 VAT 0원 같은 무성 손상 발생.
func TestAssertFloat(t *testing.T) {
	cases := []struct {
		name    string
		input   interface{}
		want    float64
		wantOK  bool
	}{
		{"float64", 12.5, 12.5, true},
		{"float32", float32(7.25), 7.25, true},
		{"int", 100, 100, true},
		{"int64", int64(9999), 9999, true},
		{"json.Number 정수", json.Number("42"), 42, true},
		{"json.Number 소수", json.Number("3.14"), 3.14, true},
		{"json.Number 잘못된 형식", json.Number("abc"), 0, false},
		{"string 정수", "100", 100, true},
		{"string 소수", "  2.5  ", 2.5, true},
		{"string 빈문자", "", 0, false},
		{"string 공백만", "   ", 0, false},
		{"string 잘못된 형식", "abc", 0, false},
		{"nil", nil, 0, false},
		{"bool 미지원", true, 0, false},
		{"map 미지원", map[string]string{}, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := assertFloat(c.input)
			if ok != c.wantOK {
				t.Errorf("ok 기대: %v, 실제: %v", c.wantOK, ok)
			}
			if got != c.want {
				t.Errorf("값 기대: %v, 실제: %v", c.want, got)
			}
		})
	}
}

// TestGetInt — getInt: float에서 int 변환
func TestGetInt(t *testing.T) {
	row := map[string]interface{}{
		"int":   42,
		"float": 7.9,
		"nil":   nil,
		"bad":   "abc",
	}
	cases := []struct {
		key    string
		want   int
		wantOK bool
	}{
		{"int", 42, true},
		{"float", 7, true}, // 소수 절단
		{"nil", 0, false},
		{"bad", 0, false},
		{"missing", 0, false},
	}
	for _, c := range cases {
		t.Run(c.key, func(t *testing.T) {
			got, ok := getInt(row, c.key)
			if ok != c.wantOK || got != c.want {
				t.Errorf("기대: (%d, %v), 실제: (%d, %v)", c.want, c.wantOK, got, ok)
			}
		})
	}
}

// TestGetFloatPtr — 값 있으면 *float64, 없으면 nil
func TestGetFloatPtr(t *testing.T) {
	row := map[string]interface{}{"v": 1.5, "z": nil}
	if p := getFloatPtr(row, "v"); p == nil || *p != 1.5 {
		t.Errorf("기대: *1.5, 실제: %v", p)
	}
	if p := getFloatPtr(row, "z"); p != nil {
		t.Errorf("nil 입력에 nil 기대, 실제: %v", *p)
	}
	if p := getFloatPtr(row, "missing"); p != nil {
		t.Errorf("미존재 키에 nil 기대, 실제: %v", *p)
	}
}

// TestGetStringPtr — 값 있으면 *string, 빈문자/없으면 nil
func TestGetStringPtr(t *testing.T) {
	row := map[string]interface{}{"v": "hello", "empty": "", "trim": "  x  "}
	if p := getStringPtr(row, "v"); p == nil || *p != "hello" {
		t.Errorf("기대: *hello, 실제: %v", p)
	}
	if p := getStringPtr(row, "trim"); p == nil || *p != "x" {
		t.Errorf("trim 기대: *x, 실제: %v", p)
	}
	if p := getStringPtr(row, "empty"); p != nil {
		t.Errorf("빈문자에 nil 기대, 실제: *%v", *p)
	}
	if p := getStringPtr(row, "missing"); p != nil {
		t.Errorf("미존재 키에 nil 기대")
	}
}

// TestGetIntPtr — 값 있으면 *int, 없으면 nil
func TestGetIntPtr(t *testing.T) {
	row := map[string]interface{}{"v": 7, "z": nil}
	if p := getIntPtr(row, "v"); p == nil || *p != 7 {
		t.Errorf("기대: *7, 실제: %v", p)
	}
	if p := getIntPtr(row, "z"); p != nil {
		t.Errorf("nil에 nil 기대")
	}
	if p := getIntPtr(row, "missing"); p != nil {
		t.Errorf("missing에 nil 기대")
	}
}

// TestRequireFloat — 형식 오류 시 ImportError 반환
func TestRequireFloat(t *testing.T) {
	row := map[string]interface{}{"good": 1.5, "bad": "abc", "nil": nil}

	if v, err := requireFloat(2, row, "good"); err != nil || v != 1.5 {
		t.Errorf("정상 케이스 실패: v=%v err=%v", v, err)
	}
	if _, err := requireFloat(3, row, "bad"); err == nil {
		t.Error("잘못된 형식인데 에러 없음")
	} else if err.Row != 3 || err.Field != "bad" {
		t.Errorf("에러 메타 잘못됨: row=%d field=%s", err.Row, err.Field)
	}
	if _, err := requireFloat(4, row, "nil"); err == nil {
		t.Error("nil인데 에러 없음")
	}
}

// TestRequireInt — 형식 오류 시 ImportError 반환
func TestRequireInt(t *testing.T) {
	row := map[string]interface{}{"good": 7, "bad": "x", "nil": nil}

	if v, err := requireInt(5, row, "good"); err != nil || v != 7 {
		t.Errorf("정상 케이스 실패: v=%d err=%v", v, err)
	}
	if _, err := requireInt(6, row, "bad"); err == nil {
		t.Error("잘못된 형식인데 에러 없음")
	} else if err.Row != 6 || err.Field != "bad" {
		t.Errorf("에러 메타 잘못됨: row=%d field=%s", err.Row, err.Field)
	}
}

// TestValidateAllowedValues — 허용값 외에는 ImportError 반환, 빈 값은 통과
func TestValidateAllowedValues(t *testing.T) {
	allowed := map[string]bool{"A": true, "B": true, "C": true}

	if err := validateAllowedValues(2, "", "category", allowed); err != nil {
		t.Errorf("빈 값은 통과해야 하는데 에러: %v", err)
	}
	if err := validateAllowedValues(3, "A", "category", allowed); err != nil {
		t.Errorf("허용값 'A' 통과 기대, 에러: %v", err)
	}
	if err := validateAllowedValues(4, "Z", "category", allowed); err == nil {
		t.Error("허용 외 'Z'에 에러 기대, 없음")
	} else {
		if err.Row != 4 || err.Field != "category" {
			t.Errorf("에러 메타 잘못됨: row=%d field=%s", err.Row, err.Field)
		}
		if !strings.Contains(err.Message, "category") {
			t.Errorf("에러 메시지에 field 누락: %s", err.Message)
		}
	}
}

// TestImportResponse_JSONFormat — ImportResponse JSON 직렬화
func TestImportResponse_JSONFormat(t *testing.T) {
	resp := model.ImportResponse{
		Success:       true,
		ImportedCount: 5,
		ErrorCount:    0,
		WarningCount:  1,
		Errors:        []model.ImportError{},
		Warnings: []model.ImportWarning{
			{Row: 3, Field: "eta", Message: "B/L 기본정보가 첫 행과 다릅니다"},
		},
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("JSON 직렬화 실패: %v", err)
	}

	var parsed model.ImportResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("JSON 역직렬화 실패: %v", err)
	}

	if parsed.ImportedCount != 5 {
		t.Errorf("기대: imported_count=5, 실제: %d", parsed.ImportedCount)
	}
	if parsed.WarningCount != 1 {
		t.Errorf("기대: warning_count=1, 실제: %d", parsed.WarningCount)
	}
	if len(parsed.Errors) != 0 {
		t.Errorf("기대: errors=[], 실제: %d건", len(parsed.Errors))
	}
}
