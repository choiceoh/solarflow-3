package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"solarflow-backend/internal/tenant"
)

func TestStudyTenantFence_AllowsStudyLearningAndMe(t *testing.T) {
	h := StudyTenantFence(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	for _, path := range []string{"/api/v1/study/domains/", "/api/v1/study/plans/test-id", "/api/v1/users/me"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req = req.WithContext(SetUserContext(req.Context(), "u1", "viewer", "study@topworks.ltd", string(tenant.IDStudy), nil))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("study allowed path %s 기대 204, 실제=%d body=%s", path, rec.Code, rec.Body.String())
		}
	}
}

func TestStudyTenantFence_BlocksERPPath(t *testing.T) {
	h := StudyTenantFence(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/orders/", nil)
	req = req.WithContext(SetUserContext(req.Context(), "u1", "viewer", "study@topworks.ltd", string(tenant.IDStudy), nil))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("study 테넌트의 ERP path는 403이어야 합니다: got=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestStudyTenantFence_DoesNotAffectERPTenants(t *testing.T) {
	h := StudyTenantFence(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/orders/", nil)
	req = req.WithContext(SetUserContext(req.Context(), "u1", "operator", "baro@topworks.ltd", TenantScopeBaro, nil))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("ERP 테넌트는 기존 라우트를 통과해야 합니다: got=%d body=%s", rec.Code, rec.Body.String())
	}
}
