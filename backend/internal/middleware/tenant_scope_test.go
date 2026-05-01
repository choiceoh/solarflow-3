package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestRequireTenantScope_Topsolar — 탑솔라 토큰은 탑솔라 전용 라우트를 통과한다(D-108)
func TestRequireTenantScope_Topsolar(t *testing.T) {
	guard := RequireTenantScope(TenantScopeTopsolar)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/lcs", nil)
	req = req.WithContext(SetUserContext(req.Context(), "u1", "operator", "u1@solarflow.local", TenantScopeTopsolar, nil))
	rec := httptest.NewRecorder()

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	})

	guard(next).ServeHTTP(rec, req)
	if !called {
		t.Fatalf("탑솔라 사용자는 가드를 통과해야 합니다")
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("기대 상태코드 204, 실제=%d body=%s", rec.Code, rec.Body.String())
	}
}

// TestRequireTenantScope_BaroBlocked — 바로 토큰은 탑솔라 전용 라우트에서 403(D-108)
func TestRequireTenantScope_BaroBlocked(t *testing.T) {
	guard := RequireTenantScope(TenantScopeTopsolar)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/lcs", nil)
	req = req.WithContext(SetUserContext(req.Context(), "u2", "operator", "u2@solarflow.local", TenantScopeBaro, nil))
	rec := httptest.NewRecorder()

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatalf("바로 사용자는 탑솔라 전용 라우트를 통과하면 안 됩니다")
	})

	guard(next).ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("기대 상태코드 403, 실제=%d body=%s", rec.Code, rec.Body.String())
	}
}

// TestRequireTenantScope_DefaultsToTopsolar — context에 스코프가 없으면 topsolar로 본다(기존 사용자 호환)
func TestRequireTenantScope_DefaultsToTopsolar(t *testing.T) {
	guard := RequireTenantScope(TenantScopeTopsolar)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/lcs", nil)
	rec := httptest.NewRecorder()

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	})

	guard(next).ServeHTTP(rec, req)
	if !called {
		t.Fatalf("스코프 미설정 시 topsolar 기본값이 적용되어 통과해야 합니다")
	}
}

// TestGetTenantScope_DefaultTopsolar — context에 비어 있으면 topsolar 반환
func TestGetTenantScope_DefaultTopsolar(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if got := GetTenantScope(req.Context()); got != TenantScopeTopsolar {
		t.Fatalf("기대 %q, 실제 %q", TenantScopeTopsolar, got)
	}
}
