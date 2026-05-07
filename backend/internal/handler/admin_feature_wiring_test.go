package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/tenant"
)

// TestGetMatrix_TenantsAndDefaults — 응답에 모든 테넌트 + default catalog 가 그대로 반영된다.
func TestGetMatrix_TenantsAndDefaults(t *testing.T) {
	h := NewAdminFeatureWiringHandler(nil, feature.NewResolver(nil))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/feature-wiring/", nil)
	rec := httptest.NewRecorder()

	h.GetMatrix(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("기대 200, 실제 %d body=%s", rec.Code, rec.Body.String())
	}

	var resp AdminFeatureMatrixResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("응답 unmarshal: %v", err)
	}

	// 테넌트 — registry 의 모든 항목.
	tenantIDs := make([]string, len(resp.Tenants))
	for i, ts := range resp.Tenants {
		tenantIDs[i] = ts.ID
	}
	sort.Strings(tenantIDs)
	want := tenant.AllIDsAsStrings()
	if len(tenantIDs) != len(want) {
		t.Fatalf("테넌트 수 mismatch: 기대 %v, 실제 %v", want, tenantIDs)
	}

	// 기능 정렬 + 모든 테넌트가 enabled 맵에 포함되는지.
	if !sort.SliceIsSorted(resp.Features, func(i, j int) bool { return resp.Features[i].ID < resp.Features[j].ID }) {
		t.Errorf("features 가 ID 정렬되어야 함")
	}
	if len(resp.Features) == 0 {
		t.Fatalf("features 가 비어 있으면 안 됨")
	}
	for _, f := range resp.Features {
		for _, ts := range resp.Tenants {
			if _, ok := f.Enabled[ts.ID]; !ok {
				t.Errorf("feature %s 의 enabled 맵에 tenant %s 누락", f.ID, ts.ID)
			}
		}
	}
}

// TestGetMatrix_DefaultEnablement — catalog default 가 실제 enabled 맵에 반영된다.
func TestGetMatrix_DefaultEnablement(t *testing.T) {
	h := NewAdminFeatureWiringHandler(nil, feature.NewResolver(nil))
	rec := httptest.NewRecorder()
	h.GetMatrix(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	var resp AdminFeatureMatrixResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// tx.po 는 모든 테넌트 공통.
	po := findFeature(resp.Features, "tx.po")
	if po == nil {
		t.Fatalf("tx.po 가 응답에 없음")
	}
	for _, want := range []string{"topsolar", "cable", "baro"} {
		if !po.Enabled[want] {
			t.Errorf("tx.po 가 %s 에서 enabled 여야 함", want)
		}
	}

	// baro.incoming 은 baro 만.
	bi := findFeature(resp.Features, "baro.incoming")
	if bi == nil {
		t.Fatalf("baro.incoming 이 응답에 없음")
	}
	if !bi.Enabled["baro"] {
		t.Errorf("baro.incoming 이 baro 에서 enabled 여야 함")
	}
	if bi.Enabled["topsolar"] || bi.Enabled["cable"] {
		t.Errorf("baro.incoming 이 module 계열에서 disabled 여야 함")
	}

	// tx.lc 는 module 계열만.
	lc := findFeature(resp.Features, "tx.lc")
	if lc == nil {
		t.Fatalf("tx.lc 가 응답에 없음")
	}
	if !lc.Enabled["topsolar"] || !lc.Enabled["cable"] {
		t.Errorf("tx.lc 가 module 계열에서 enabled 여야 함")
	}
	if lc.Enabled["baro"] {
		t.Errorf("tx.lc 가 baro 에서 disabled 여야 함")
	}
}

// TestGetMatrix_OverrideReflected — resolver override 가 응답에 반영된다.
func TestGetMatrix_OverrideReflected(t *testing.T) {
	res := feature.NewResolver(nil)
	res.SetOverride("baro", feature.IDTxLC, true)
	h := NewAdminFeatureWiringHandler(nil, res)

	rec := httptest.NewRecorder()
	h.GetMatrix(rec, httptest.NewRequest(http.MethodGet, "/", nil))

	var resp AdminFeatureMatrixResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)

	lc := findFeature(resp.Features, "tx.lc")
	if lc == nil || !lc.Enabled["baro"] {
		t.Fatalf("override 적용 후 baro 가 tx.lc 에서 enabled 여야 함")
	}
	// default_tenants 는 카탈로그 그대로 — override 와 별도로 노출.
	if !contains(lc.DefaultTenants, "topsolar") {
		t.Errorf("default_tenants 가 카탈로그 default 를 그대로 노출해야 함")
	}
}

func findFeature(features []AdminFeatureSummary, id string) *AdminFeatureSummary {
	for i := range features {
		if features[i].ID == id {
			return &features[i]
		}
	}
	return nil
}

// TestValidateSetEnabled_Cases — PR-5b: PUT 핸들러 검증 함수의 4가지 분기.
func TestValidateSetEnabled_Cases(t *testing.T) {
	h := NewAdminFeatureWiringHandler(nil, feature.NewResolver(nil))
	cases := []struct {
		name      string
		tenant    string
		feature   string
		wantError error
	}{
		{name: "valid", tenant: string(tenant.IDTopsolar), feature: string(feature.IDTxLC), wantError: nil},
		{name: "unknown tenant", tenant: "gx10", feature: string(feature.IDTxLC), wantError: errUnknownTenant},
		{name: "unknown feature", tenant: string(tenant.IDBaro), feature: "tx.fake", wantError: errUnknownFeature},
		{name: "blank tenant", tenant: "", feature: string(feature.IDTxLC), wantError: errUnknownTenant},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := h.validateSetEnabled(tc.tenant, tc.feature)
			if err != tc.wantError {
				t.Fatalf("기대 %v, 실제 %v", tc.wantError, err)
			}
		})
	}
}

// TestSetEnabled_NoDB_Returns503 — DB 가 nil 이면 PUT 가 503 으로 막힌다.
func TestSetEnabled_NoDB_Returns503(t *testing.T) {
	h := NewAdminFeatureWiringHandler(nil, feature.NewResolver(nil))

	body := strings.NewReader(`{"enabled":true}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/feature-wiring/baro/tx.lc", body)
	// chi URLParam 은 라우터를 통과해야 채워지지만, 검증을 통과한 후 DB nil 가드만 확인하므로
	// chi.RouteContext 에 직접 채운다.
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("tenantID", "baro")
	rctx.URLParams.Add("featureID", "tx.lc")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()

	h.SetEnabled(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("기대 503, 실제 %d body=%s", rec.Code, rec.Body.String())
	}
}

// TestSetEnabled_UnknownTenant_Returns404 — 미등록 tenant 면 DB 호출 전에 404.
func TestSetEnabled_UnknownTenant_Returns404(t *testing.T) {
	h := NewAdminFeatureWiringHandler(nil, feature.NewResolver(nil))

	body := strings.NewReader(`{"enabled":true}`)
	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/feature-wiring/gx10/tx.lc", body)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("tenantID", "gx10")
	rctx.URLParams.Add("featureID", "tx.lc")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()

	h.SetEnabled(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("기대 404, 실제 %d", rec.Code)
	}
}

// === PR-9: WiringStore fake 활용 happy path 테스트 ===
//
// PR-5b 까지는 SetEnabled 의 DB 호출 부분이 단위 테스트 불가능했으나, PR-9 의
// Store 인터페이스 분리 후 fake 구현으로 비즈니스 로직 (audit / resolver 갱신 / 응답 모양)
// 을 supabase 없이 검증한다.

// fakeWiringStore — feature.WiringStore 의 in-memory 테스트용 구현.
type fakeWiringStore struct {
	upsertCalls []feature.OverrideRow
	auditCalls  []feature.AuditEntry
	upsertErr   error
	auditErr    error
}

func (f *fakeWiringStore) UpsertOverride(_ context.Context, o feature.OverrideRow) error {
	f.upsertCalls = append(f.upsertCalls, o)
	return f.upsertErr
}
func (f *fakeWiringStore) InsertAudit(_ context.Context, e feature.AuditEntry) error {
	f.auditCalls = append(f.auditCalls, e)
	return f.auditErr
}
func (f *fakeWiringStore) LoadOverrides(_ context.Context) ([]feature.OverrideRow, error) {
	return nil, nil
}

func setEnabledRequest_t(t *testing.T, h *AdminFeatureWiringHandler, tenantID, featureID, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/v1/admin/feature-wiring/"+tenantID+"/"+featureID, strings.NewReader(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("tenantID", tenantID)
	rctx.URLParams.Add("featureID", featureID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rec := httptest.NewRecorder()
	h.SetEnabled(rec, req)
	return rec
}

// TestSetEnabled_HappyPath — store upsert + audit insert + resolver 갱신 모두 일어난다.
func TestSetEnabled_HappyPath(t *testing.T) {
	store := &fakeWiringStore{}
	res := feature.NewResolver(nil)
	h := NewAdminFeatureWiringHandler(store, res)

	rec := setEnabledRequest_t(t, h, "baro", string(feature.IDTxLC), `{"enabled":true,"note":"compliance ok"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("기대 200, 실제 %d body=%s", rec.Code, rec.Body.String())
	}
	if len(store.upsertCalls) != 1 {
		t.Fatalf("upsert 1번 호출 기대, 실제 %d", len(store.upsertCalls))
	}
	got := store.upsertCalls[0]
	if got.Tenant != "baro" || got.FeatureID != feature.IDTxLC || !got.Enabled || got.Note != "compliance ok" {
		t.Errorf("upsert payload mismatch: %+v", got)
	}
	if len(store.auditCalls) != 1 {
		t.Fatalf("audit 1번 호출 기대, 실제 %d", len(store.auditCalls))
	}
	a := store.auditCalls[0]
	// before: baro 는 tx.lc 에서 default 비활성 (module 전용)
	if a.BeforeValue != false || a.AfterValue != true {
		t.Errorf("audit before/after mismatch: %+v", a)
	}
	// resolver 갱신 — 다음 IsEnabled 호출에 반영
	if !res.IsEnabled("baro", feature.IDTxLC) {
		t.Errorf("resolver in-memory 캐시 갱신 실패")
	}
}

// TestSetEnabled_StoreError_Returns500 — Store.UpsertOverride 가 실패하면 500.
func TestSetEnabled_StoreError_Returns500(t *testing.T) {
	store := &fakeWiringStore{upsertErr: errBoom}
	h := NewAdminFeatureWiringHandler(store, feature.NewResolver(nil))

	rec := setEnabledRequest_t(t, h, "baro", string(feature.IDTxLC), `{"enabled":true}`)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("기대 500, 실제 %d", rec.Code)
	}
	// 실패 시 audit 도, resolver 갱신도 안 됨 — invariant.
	if len(store.auditCalls) != 0 {
		t.Errorf("upsert 실패 후 audit 호출되면 안 됨: %d 건", len(store.auditCalls))
	}
}

// TestSetEnabled_AuditFailure_StillReturns200 — audit insert 실패는 best-effort, 응답 200.
func TestSetEnabled_AuditFailure_StillReturns200(t *testing.T) {
	store := &fakeWiringStore{auditErr: errBoom}
	res := feature.NewResolver(nil)
	h := NewAdminFeatureWiringHandler(store, res)

	rec := setEnabledRequest_t(t, h, "baro", string(feature.IDTxLC), `{"enabled":true}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("audit 실패에도 200 기대, 실제 %d body=%s", rec.Code, rec.Body.String())
	}
	if !res.IsEnabled("baro", feature.IDTxLC) {
		t.Errorf("audit 실패와 무관하게 resolver 는 갱신되어야 함")
	}
}

var errBoom = newSentinelErr("boom")

func newSentinelErr(s string) error { return &sentinelErr{s: s} }

type sentinelErr struct{ s string }

func (e *sentinelErr) Error() string { return e.s }
