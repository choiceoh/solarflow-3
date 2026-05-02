package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"solarflow-backend/internal/engine"
)

// mockRustServer — Rust 엔진을 흉내 내는 테스트 서버
// 비유: "가짜 계산실" — 실제 Rust 없이 Go 프록시 동작을 검증
func mockRustServer(t *testing.T, statusCode int, responseBody string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		w.Write([]byte(responseBody))
	}))
}

// TestCalcProxy_Inventory_Success — Rust 200 응답 시 Go도 200 + 동일 응답
func TestCalcProxy_Inventory_Success(t *testing.T) {
	rustResp := `{"items":[],"summary":{"total_physical_kw":0},"calculated_at":"2026-03-29T00:00:00Z"}`
	server := mockRustServer(t, http.StatusOK, rustResp)
	defer server.Close()

	ec := engine.NewEngineClient(server.URL)
	h := NewCalcProxyHandler(ec)

	body := `{"company_id":"test-company"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calc/inventory", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Inventory(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("기대: 200, 실제: %d", rec.Code)
	}

	if rec.Body.String() != rustResp {
		t.Errorf("응답 불일치\n기대: %s\n실제: %s", rustResp, rec.Body.String())
	}
}

// TestCalcProxy_Inventory_EngineDown — Rust 연결 불가 시 Go 503 + engine_status
func TestCalcProxy_Inventory_EngineDown(t *testing.T) {
	// 비유: 존재하지 않는 전화번호로 걸면 연결 실패
	ec := engine.NewEngineClient("http://127.0.0.1:1")
	h := NewCalcProxyHandler(ec)

	body := `{"company_id":"test-company"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calc/inventory", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Inventory(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("기대: 503, 실제: %d", rec.Code)
	}

	if !strings.Contains(rec.Body.String(), "engine_status") {
		t.Error("응답에 engine_status 필드가 없음")
	}
}

// TestCalcProxy_Inventory_RustBadRequest — Rust 400 응답 시 Go도 400 + 동일 에러
func TestCalcProxy_Inventory_RustBadRequest(t *testing.T) {
	rustResp := `{"error":"company_id is required"}`
	server := mockRustServer(t, http.StatusBadRequest, rustResp)
	defer server.Close()

	ec := engine.NewEngineClient(server.URL)
	h := NewCalcProxyHandler(ec)

	body := `{}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/calc/inventory", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.Inventory(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("기대: 400, 실제: %d", rec.Code)
	}

	if rec.Body.String() != rustResp {
		t.Errorf("응답 불일치\n기대: %s\n실제: %s", rustResp, rec.Body.String())
	}
}

// TestCalcProxy_EngineHealth — Rust health 200 시 Go도 200
func TestCalcProxy_EngineHealth(t *testing.T) {
	rustResp := `{"status":"ok"}`
	server := mockRustServer(t, http.StatusOK, rustResp)
	defer server.Close()

	ec := engine.NewEngineClient(server.URL)
	h := NewCalcProxyHandler(ec)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/engine/health", nil)
	rec := httptest.NewRecorder()

	h.EngineHealth(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("기대: 200, 실제: %d", rec.Code)
	}
}

// TestCalcProxy_EngineReady_DBDown — Rust ready 503 시 Go도 503
func TestCalcProxy_EngineReady_DBDown(t *testing.T) {
	rustResp := `{"status":"unhealthy","db":"connection refused"}`
	server := mockRustServer(t, http.StatusServiceUnavailable, rustResp)
	defer server.Close()

	ec := engine.NewEngineClient(server.URL)
	h := NewCalcProxyHandler(ec)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/engine/ready", nil)
	rec := httptest.NewRecorder()

	h.EngineReady(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("기대: 503, 실제: %d", rec.Code)
	}
}
