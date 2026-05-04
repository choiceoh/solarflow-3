package feature

import (
	"sync"
)

// Resolver — feature 배선 해석기(D-120).
//
// 두 소스를 합쳐 (tenant, feature_id) → enabled 를 결정한다:
//  1. 카탈로그의 DefaultTenants — 코드 정본
//  2. DB 테이블 tenant_features (override) — admin 이 메타 편집기에서 편집
//
// DB override 가 있으면 catalog default 를 덮어쓴다. 없으면 default 를 그대로 사용.
//
// 이번 PR 에서는 (1) 만 로드된 상태로 동작한다(DB 행 없음 = 기존 동작 그대로).
// (2) 의 실제 로딩은 별도 후속 작업에서 사이트 시작 시 + admin 변경 시 invalidate 로 도입.
type Resolver struct {
	mu        sync.RWMutex
	catalog   map[FeatureID]Feature
	overrides map[overrideKey]bool // (tenant, feature_id) → enabled
}

type overrideKey struct {
	tenant    string
	featureID FeatureID
}

// NewResolver — 카탈로그를 바탕으로 새 resolver 를 만든다.
// catalog 인자가 nil 이면 패키지 전역 Catalog 를 사용한다.
func NewResolver(catalog map[FeatureID]Feature) *Resolver {
	if catalog == nil {
		catalog = Catalog
	}
	return &Resolver{
		catalog:   catalog,
		overrides: make(map[overrideKey]bool),
	}
}

// IsEnabled — 주어진 테넌트가 해당 feature 를 호출할 수 있는가.
//
// 정책:
//   - feature_id 가 카탈로그에 없으면 → false (fail-closed by missing definition)
//   - DB override 가 있으면 → override 값
//   - 그 외 → DefaultTenants 에 tenant 가 포함되는가
func (r *Resolver) IsEnabled(tenant string, id FeatureID) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	f, ok := r.catalog[id]
	if !ok {
		return false
	}
	if v, ok := r.overrides[overrideKey{tenant: tenant, featureID: id}]; ok {
		return v
	}
	for _, t := range f.DefaultTenants {
		if t == tenant {
			return true
		}
	}
	return false
}

// Knows — 카탈로그에 등록된 feature_id 인지 확인.
// 미들웨어가 startup 시 검증할 때 사용.
func (r *Resolver) Knows(id FeatureID) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.catalog[id]
	return ok
}

// SetOverride — (tenant, feature_id) override 를 설정한다.
// DB 로더가 행을 읽고 호출하거나, 테스트가 시나리오를 구성할 때 사용.
func (r *Resolver) SetOverride(tenant string, id FeatureID, enabled bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.overrides[overrideKey{tenant: tenant, featureID: id}] = enabled
}

// ClearOverrides — 모든 override 를 제거한다(주로 테스트용).
func (r *Resolver) ClearOverrides() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.overrides = make(map[overrideKey]bool)
}

// EnabledFeatures — 주어진 테넌트가 사용할 수 있는 feature_id 전체 집합.
// 사이드바·메뉴 가시성 등 프론트에서 사용하기 위한 read API 에 활용.
func (r *Resolver) EnabledFeatures(tenant string) []FeatureID {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]FeatureID, 0, len(r.catalog))
	for id, f := range r.catalog {
		enabled := false
		if v, ok := r.overrides[overrideKey{tenant: tenant, featureID: id}]; ok {
			enabled = v
		} else {
			for _, t := range f.DefaultTenants {
				if t == tenant {
					enabled = true
					break
				}
			}
		}
		if enabled {
			out = append(out, id)
		}
	}
	return out
}
