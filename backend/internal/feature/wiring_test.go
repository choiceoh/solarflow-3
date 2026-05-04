package feature

import (
	"sort"
	"strings"
	"testing"
)

// TestCatalog_IDsAreUniqueAndDoted — feature_id 명명 규약(D-120) 검증.
// 모든 ID 는 도트 표기 + 카탈로그 키와 ID 필드 일치해야 한다.
func TestCatalog_IDsAreUniqueAndDoted(t *testing.T) {
	for key, f := range Catalog {
		if key != f.ID {
			t.Errorf("카탈로그 키와 Feature.ID 불일치: key=%q, f.ID=%q", key, f.ID)
		}
		s := string(f.ID)
		if s == "" {
			t.Errorf("빈 feature_id: %+v", f)
			continue
		}
		if !strings.Contains(s, ".") {
			t.Errorf("도트 표기 위반(D-120): %q", s)
		}
		if strings.Contains(s, "*") {
			t.Errorf("ID 에 와일드카드(*) 금지: %q", s)
		}
	}
}

// TestCatalog_PathsNonEmpty — 모든 feature 는 최소 한 개 chi 라우트 패턴을 소유한다.
// (계산 프록시 등 단일 라우트도 한 개)
func TestCatalog_PathsNonEmpty(t *testing.T) {
	for id, f := range Catalog {
		if len(f.Paths) == 0 {
			t.Errorf("Feature %q 에 Paths 가 비어있음 — 카탈로그 = chi 트리 매핑이 깨진다", id)
		}
		for _, p := range f.Paths {
			if !strings.HasPrefix(p, "/api/v1/") {
				t.Errorf("Feature %q Path 가 /api/v1/ 로 시작하지 않음: %q", id, p)
			}
		}
	}
}

// TestCatalog_PathsUnique — 한 chi 라우트가 두 feature 에 중복 매핑되면 ambiguity.
// 같은 prefix 가 다른 feature 에 들어가는 것은 OK (예: /api/v1/intercompany-requests/ 의 BARO 측 vs Inbox 측 — 다른 path 라인)
// 정확히 같은 path 가 두 feature 에 등장하면 fail.
func TestCatalog_PathsUnique(t *testing.T) {
	owners := map[string]FeatureID{}
	for id, f := range Catalog {
		for _, p := range f.Paths {
			if existing, dup := owners[p]; dup {
				t.Errorf("path %q 가 두 feature 에 중복 매핑: %q vs %q", p, existing, id)
			}
			owners[p] = id
		}
	}
}

// TestResolver_DefaultTenants — DB override 가 없으면 catalog default 를 그대로 사용한다.
func TestResolver_DefaultTenants(t *testing.T) {
	r := NewResolver(nil)

	cases := []struct {
		name    string
		tenant  string
		id      FeatureID
		wantOK  bool
	}{
		{"topsolar 가 module 계열 기능 통과", "topsolar", IDTxLC, true},
		{"cable 도 module 계열 기능 통과", "cable", IDTxLC, true},
		{"baro 는 module 계열 기능 차단", "baro", IDTxLC, false},
		{"baro 만 baro 전용 기능 통과", "baro", IDBaroIncoming, true},
		{"topsolar 는 baro 전용 기능 차단", "topsolar", IDBaroIncoming, false},
		{"cable 도 baro 전용 기능 차단", "cable", IDBaroIncoming, false},
		{"all-tenant 기능은 모든 테넌트 통과 (topsolar)", "topsolar", IDMasterBank, true},
		{"all-tenant 기능은 모든 테넌트 통과 (baro)", "baro", IDMasterBank, true},
		{"미정의 tenant 는 차단", "unknown_tenant", IDMasterBank, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := r.IsEnabled(tc.tenant, tc.id)
			if got != tc.wantOK {
				t.Errorf("IsEnabled(%q, %q) = %v, want %v", tc.tenant, tc.id, got, tc.wantOK)
			}
		})
	}
}

// TestResolver_UnknownFeature — 카탈로그에 없는 feature_id 는 항상 false (fail-closed).
func TestResolver_UnknownFeature(t *testing.T) {
	r := NewResolver(nil)
	for _, tenant := range TenantSetAll {
		if r.IsEnabled(tenant, FeatureID("nope.does_not.exist")) {
			t.Errorf("미정의 feature 에 대해 %s 에 enabled=true (fail-closed 위반)", tenant)
		}
	}
}

// TestResolver_OverrideEnables — override 가 default 를 덮어쓴다(차단을 풀거나, 추가 차단).
func TestResolver_OverrideEnables(t *testing.T) {
	r := NewResolver(nil)
	// baro 가 module 기능을 새로 받는 시나리오 (admin 이 메타 편집기에서 켬)
	r.SetOverride("baro", IDTxLC, true)
	if !r.IsEnabled("baro", IDTxLC) {
		t.Error("override true 가 적용되지 않음")
	}
	if !r.IsEnabled("topsolar", IDTxLC) {
		t.Error("topsolar override 가 없으니 default 유지되어야 함")
	}

	// 이미 default true 인데 override false 로 끄는 시나리오
	r.SetOverride("topsolar", IDTxLC, false)
	if r.IsEnabled("topsolar", IDTxLC) {
		t.Error("override false 가 default true 를 덮어써야 함")
	}

	// override 청소 후 default 복귀
	r.ClearOverrides()
	if !r.IsEnabled("topsolar", IDTxLC) {
		t.Error("ClearOverrides 후 default 복귀 실패")
	}
	if r.IsEnabled("baro", IDTxLC) {
		t.Error("ClearOverrides 후 baro 가 default 차단으로 돌아가야 함")
	}
}

// TestResolver_EnabledFeatures_BaroSubset — baro 가 받는 feature 집합은 module 계열 기능을 포함하지 않는다.
func TestResolver_EnabledFeatures_BaroSubset(t *testing.T) {
	r := NewResolver(nil)
	got := r.EnabledFeatures("baro")
	gotSet := map[FeatureID]bool{}
	for _, id := range got {
		gotSet[id] = true
	}
	// 포함되어야 하는 것 (BARO 전용 + 공통)
	for _, must := range []FeatureID{IDBaroIncoming, IDBaroPriceBook, IDCRMPartnerActivity, IDMasterBank, IDTxOrder} {
		if !gotSet[must] {
			t.Errorf("baro EnabledFeatures 에 %q 없음 (있어야 함)", must)
		}
	}
	// 절대 포함되면 안 되는 것 (module 전용)
	for _, mustNot := range []FeatureID{IDTxLC, IDTxCostDetail, IDTxDeclaration, IDIOExportAmaranth, IDCalcLandedCost} {
		if gotSet[mustNot] {
			t.Errorf("baro EnabledFeatures 에 %q 있음 (격리 위반)", mustNot)
		}
	}
	// 정렬 결과가 deterministic 이어야 함 (호출자가 의존하지 않더라도)
	sortedIDs := make([]string, 0, len(got))
	for _, id := range got {
		sortedIDs = append(sortedIDs, string(id))
	}
	sort.Strings(sortedIDs)
}
