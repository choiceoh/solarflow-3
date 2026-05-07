package handler

import (
	"sort"
	"testing"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/tenant"
)

// TestFillTenantInfo_Topsolar — topsolar 테넌트는 module + all 그룹 feature 를 모두 받는다.
func TestFillTenantInfo_Topsolar(t *testing.T) {
	h := NewUserHandler(nil, feature.NewResolver(nil))
	resp := &UserProfileResponse{}
	h.fillTenantInfo(resp, string(tenant.IDTopsolar))

	if resp.TenantID != "topsolar" {
		t.Fatalf("TenantID 기대 topsolar, 실제=%q", resp.TenantID)
	}
	if resp.TenantDisplayName == "" {
		t.Fatalf("TenantDisplayName 이 비어 있으면 안 됨")
	}
	if !sort.StringsAreSorted(resp.EnabledFeatures) {
		t.Fatalf("EnabledFeatures 가 정렬되어야 함: %v", resp.EnabledFeatures)
	}
	if !contains(resp.EnabledFeatures, string(feature.IDTxLC)) {
		t.Errorf("topsolar 는 tx.lc(module 계열) 를 가져야 함, got=%v", resp.EnabledFeatures)
	}
	if contains(resp.EnabledFeatures, string(feature.IDBaroIncoming)) {
		t.Errorf("topsolar 는 baro.incoming 을 가지면 안 됨, got=%v", resp.EnabledFeatures)
	}
}

// TestFillTenantInfo_Baro — BARO 는 baro 전용만 + 공통, module 계열은 안 보임 (D-108).
func TestFillTenantInfo_Baro(t *testing.T) {
	h := NewUserHandler(nil, feature.NewResolver(nil))
	resp := &UserProfileResponse{}
	h.fillTenantInfo(resp, string(tenant.IDBaro))

	if resp.TenantID != "baro" {
		t.Fatalf("TenantID 기대 baro, 실제=%q", resp.TenantID)
	}
	if !contains(resp.EnabledFeatures, string(feature.IDBaroIncoming)) {
		t.Errorf("baro 는 baro.incoming 을 가져야 함")
	}
	if contains(resp.EnabledFeatures, string(feature.IDTxLC)) {
		t.Errorf("baro 는 module 전용 tx.lc 를 가지면 안 됨")
	}
	if contains(resp.EnabledFeatures, string(feature.IDIOExportAmaranth)) {
		t.Errorf("baro 는 module 그룹 io.export.amaranth 를 가지면 안 됨")
	}
}

// TestFillTenantInfo_Cable — D-119: cable 은 module 그룹 — module 기능 받고 baro 기능은 제외.
func TestFillTenantInfo_Cable(t *testing.T) {
	h := NewUserHandler(nil, feature.NewResolver(nil))
	resp := &UserProfileResponse{}
	h.fillTenantInfo(resp, string(tenant.IDCable))

	if !contains(resp.EnabledFeatures, string(feature.IDTxLC)) {
		t.Errorf("cable 은 module 그룹 tx.lc 를 가져야 함")
	}
	if contains(resp.EnabledFeatures, string(feature.IDBaroIncoming)) {
		t.Errorf("cable 은 baro 전용 baro.incoming 을 가지면 안 됨")
	}
}

// TestFillTenantInfo_NilResolver — Resolver 가 nil 로 들어와도 NewUserHandler 가 default 로 채운다.
func TestFillTenantInfo_NilResolver(t *testing.T) {
	h := NewUserHandler(nil, nil)
	resp := &UserProfileResponse{}
	h.fillTenantInfo(resp, string(tenant.IDTopsolar))
	if len(resp.EnabledFeatures) == 0 {
		t.Fatalf("default resolver 로도 features 가 채워져야 함")
	}
}

func contains(ss []string, target string) bool {
	for _, s := range ss {
		if s == target {
			return true
		}
	}
	return false
}
