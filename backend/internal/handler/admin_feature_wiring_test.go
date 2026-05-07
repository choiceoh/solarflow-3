package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/tenant"
)

// TestGetMatrix_TenantsAndDefaults — 응답에 모든 테넌트 + default catalog 가 그대로 반영된다.
func TestGetMatrix_TenantsAndDefaults(t *testing.T) {
	h := NewAdminFeatureWiringHandler(feature.NewResolver(nil))
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
	h := NewAdminFeatureWiringHandler(feature.NewResolver(nil))
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
	h := NewAdminFeatureWiringHandler(res)

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
