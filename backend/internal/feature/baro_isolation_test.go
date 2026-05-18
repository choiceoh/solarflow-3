package feature

import "testing"

// TestTxScopesAreTenantCompany — orders/outbound/sale/receipt 의 DataScope 가
// DataScopeTenantCompany 로 명시되어 있는지 검증 (D-108 격리 강화 회귀 방지).
//
// 누가 실수로 DataScopeGlobal 로 되돌리면 즉시 깨진다. 카탈로그 스코프와 실제 핸들러
// 격리 분기(applyXxxFilters 의 BARO 분기)가 일관되도록 강제하는 guard rail.
//
// 정책 변경으로 의도적으로 격리를 풀려면:
//  1. 본 테스트의 want 맵을 갱신
//  2. 해당 핸들러의 applyXxxFilters / baroOwnsXxxOr404 / baroEnforceCompanyOnXxxCreate 제거
//  3. baro.md 와 DECISIONS.md 에 정책 변경 결정 등록
func TestTxScopesAreTenantCompany(t *testing.T) {
	want := map[FeatureID]DataScopeKind{
		IDTxOrder:    DataScopeTenantCompany,
		IDTxOutbound: DataScopeTenantCompany,
		IDTxSale:     DataScopeTenantCompany,
		IDTxReceipt:  DataScopeTenantCompany,
	}
	for id, expected := range want {
		f, ok := Catalog[id]
		if !ok {
			t.Errorf("카탈로그에 %q 가 없음", id)
			continue
		}
		if f.DefaultScope != expected {
			t.Errorf("%q DefaultScope = %q, want %q (BARO 격리 정책 위반)", id, f.DefaultScope, expected)
		}
	}
}

// TestBaroSanitizedFeaturesScope — BARO sanitized 패턴 feature 가 column_masked 로
// 명시되어 있는지 검증.
func TestBaroSanitizedFeaturesScope(t *testing.T) {
	want := map[FeatureID]DataScopeKind{
		IDBaroIncoming: DataScopeColumnMasked,
		IDBaroOutbound: DataScopeColumnMasked,
	}
	for id, expected := range want {
		f, ok := Catalog[id]
		if !ok {
			t.Errorf("카탈로그에 %q 가 없음", id)
			continue
		}
		if f.DefaultScope != expected {
			t.Errorf("%q DefaultScope = %q, want %q (sanitized 정책 위반)", id, f.DefaultScope, expected)
		}
	}
}
