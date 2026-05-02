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
