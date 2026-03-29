package engine

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestCheckHealth_Success — 200 + ready 응답 시 성공 확인
func TestCheckHealth_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health/ready" {
			t.Fatalf("예상 경로: /health/ready, 실제: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := HealthResponse{Status: "ready", DB: "connected"}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			t.Fatalf("응답 인코딩 실패: %v", err)
		}
	}))
	defer server.Close()

	client := NewEngineClient(server.URL)
	result, err := client.CheckHealth()
	if err != nil {
		t.Fatalf("CheckHealth 실패: %v", err)
	}
	if result.Status != "ready" {
		t.Fatalf("Status 예상: ready, 실제: %s", result.Status)
	}
	if result.DB != "connected" {
		t.Fatalf("DB 예상: connected, 실제: %s", result.DB)
	}
}

// TestCheckHealth_ServerDown — 연결 불가능한 URL에서 에러 반환 확인
func TestCheckHealth_ServerDown(t *testing.T) {
	client := NewEngineClient("http://127.0.0.1:19999")
	_, err := client.CheckHealth()
	if err == nil {
		t.Fatal("연결 불가능한 서버에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(err.Error(), "연결 실패") {
		t.Fatalf("에러 메시지에 '연결 실패'가 포함되어야 합니다, got: %s", err.Error())
	}
}

// TestCheckHealth_DBDisconnected — 503 응답 시 에러 반환 확인
func TestCheckHealth_DBDisconnected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		resp := map[string]string{"status": "not_ready", "db": "disconnected"}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			t.Fatalf("응답 인코딩 실패: %v", err)
		}
	}))
	defer server.Close()

	client := NewEngineClient(server.URL)
	_, err := client.CheckHealth()
	if err == nil {
		t.Fatal("503 응답에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(err.Error(), "503") {
		t.Fatalf("에러 메시지에 '503'이 포함되어야 합니다, got: %s", err.Error())
	}
}

// TestCallCalc_Success — 200 + JSON 응답 시 바이트 반환 확인
func TestCallCalc_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("예상 메서드: POST, 실제: %s", r.Method)
		}
		if !strings.HasPrefix(r.URL.Path, "/api/calc/") {
			t.Fatalf("예상 경로 접두사: /api/calc/, 실제: %s", r.URL.Path)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("예상 Content-Type: application/json, 실제: %s", r.Header.Get("Content-Type"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		result := map[string]interface{}{"total": 12345.67}
		if err := json.NewEncoder(w).Encode(result); err != nil {
			t.Fatalf("응답 인코딩 실패: %v", err)
		}
	}))
	defer server.Close()

	client := NewEngineClient(server.URL)
	body := map[string]string{"declaration_id": "test-uuid"}
	result, err := client.CallCalc("landed-cost", body)
	if err != nil {
		t.Fatalf("CallCalc 실패: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("응답 바이트가 비어있으면 안 됩니다")
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(result, &parsed); err != nil {
		t.Fatalf("응답 JSON 파싱 실패: %v", err)
	}
	if parsed["total"] != 12345.67 {
		t.Fatalf("total 예상: 12345.67, 실제: %v", parsed["total"])
	}
}

// TestCallCalc_ServerError — 500 응답 시 에러 반환 확인
func TestCallCalc_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":"internal server error"}`))
	}))
	defer server.Close()

	client := NewEngineClient(server.URL)
	_, err := client.CallCalc("landed-cost", map[string]string{})
	if err == nil {
		t.Fatal("500 응답에 대해 에러가 반환되어야 합니다")
	}
	if !strings.Contains(err.Error(), "500") {
		t.Fatalf("에러 메시지에 '500'이 포함되어야 합니다, got: %s", err.Error())
	}
}
