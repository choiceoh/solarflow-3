package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"solarflow-backend/internal/feature"
)

// TestFeatureGate_AllowsDefaultTenants — catalog default 가 그대로 통과되는지.
func TestFeatureGate_AllowsDefaultTenants(t *testing.T) {
	gate := NewFeatureGate(nil)
	mw := gate.Require(feature.IDTxLC)
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	cases := []struct {
		tenant   string
		wantCode int
	}{
		{TenantScopeTopsolar, http.StatusOK},
		{TenantScopeCable, http.StatusOK},
		{TenantScopeBaro, http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.tenant, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/v1/lcs/", nil)
			req = req.WithContext(SetUserContext(req.Context(), "u1", "operator", "u1@solarflow.local", tc.tenant, nil))
			w := httptest.NewRecorder()
			h.ServeHTTP(w, req)
			if w.Code != tc.wantCode {
				t.Errorf("tenant=%s 기대 %d, 실제 %d", tc.tenant, tc.wantCode, w.Code)
			}
		})
	}
}

// TestFeatureGate_BaroOnlyFeature — BARO 전용 feature 의 반대편 차단.
func TestFeatureGate_BaroOnlyFeature(t *testing.T) {
	gate := NewFeatureGate(nil)
	mw := gate.Require(feature.IDBaroIncoming)
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	cases := []struct {
		tenant   string
		wantCode int
	}{
		{TenantScopeBaro, http.StatusOK},
		{TenantScopeTopsolar, http.StatusForbidden},
		{TenantScopeCable, http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.tenant, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/v1/baro/incoming/", nil)
			req = req.WithContext(SetUserContext(req.Context(), "u1", "operator", "u1@solarflow.local", tc.tenant, nil))
			w := httptest.NewRecorder()
			h.ServeHTTP(w, req)
			if w.Code != tc.wantCode {
				t.Errorf("tenant=%s 기대 %d, 실제 %d", tc.tenant, tc.wantCode, w.Code)
			}
		})
	}
}

// TestFeatureGate_OverrideAllowsBaro — override 로 baro 에 module 기능 부여.
func TestFeatureGate_OverrideAllowsBaro(t *testing.T) {
	resolver := feature.NewResolver(nil)
	resolver.SetOverride(TenantScopeBaro, feature.IDTxLC, true)
	gate := NewFeatureGate(resolver)
	mw := gate.Require(feature.IDTxLC)
	h := mw(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/v1/lcs/", nil)
	req = req.WithContext(SetUserContext(req.Context(), "u1", "operator", "u1@solarflow.local", TenantScopeBaro, nil))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("override 적용 후 baro 가 통과해야 함, 실제 %d", w.Code)
	}
}

// TestFeatureGate_PanicOnUnknownID — 카탈로그에 없는 ID 로 게이트를 만들면 startup 시 패닉.
func TestFeatureGate_PanicOnUnknownID(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("미정의 feature_id 에 대해 panic 이 발생해야 함")
		}
	}()
	gate := NewFeatureGate(nil)
	_ = gate.Require(feature.FeatureID("nope.does_not.exist"))
}
