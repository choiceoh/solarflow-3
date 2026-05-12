// Package tenant — 테넌트(앱 도메인) 단일 정본 (D-120 후속).
//
// SolarFlow 는 같은 코드/DB 를 호스트네임으로 분기해 여러 앱을 운영한다 (D-108, D-119).
// 어느 테넌트가 존재하는지, 각 테넌트의 host 패턴·표시명·소속 그룹은
// 이 패키지의 Registry 한 곳에서만 정의한다.
//
// 다른 패키지가 가지면 안 되는 것:
//   - "topsolar"/"cable"/"baro" 같은 리터럴 (이 패키지의 ID 상수만 사용)
//   - 테넌트 집합 array 리터럴 (대신 SetAll/SetModule/SetTenant 같은 헬퍼 사용)
//   - host 패턴 정규식 (대신 Detect)
//
// 새 테넌트 추가 절차:
//  1. ID 상수 추가
//  2. defaultRegistry 에 Tenant 엔트리 추가
//  3. (필요하면) Group 정의에 추가 (예: TenantSetModule = topsolar+cable 묶음)
//  4. DB 마이그레이션으로 user_profiles.tenant_scope 등 enum 갱신
//  5. 프론트 generated/tenants.json 재생성 (PR-3)
package tenant

import (
	"regexp"
	"sort"
	"strings"
)

// ID — 테넌트 식별자 타입. 자유 문자열 사용을 막기 위해 별도 타입.
//
// 값은 user_profiles.tenant_scope 컬럼 / JWT claim / 카탈로그 DefaultTenants 와
// 동일한 표면 문자열을 그대로 사용한다(레거시 호환). 새 ID 추가 시 충돌 주의.
type ID string

// 사전 정의 ID — 모든 다른 패키지는 이 상수만 사용한다.
const (
	// AUTOGEN BEGIN: tenant_ids — gen-registry.mjs 가 harness/registry.yaml 에서 생성. 손으로 편집 금지.
	IDTopsolar ID = "topsolar"
	IDCable    ID = "cable"
	IDBaro     ID = "baro"
	IDStudy    ID = "study"
	// AUTOGEN END: tenant_ids
)

// Group — 여러 테넌트를 묶은 논리 그룹.
//
// 예: GroupModule = {topsolar, cable} (D-119, 수입/금융/원가 공통 표면).
// 카탈로그가 DefaultTenants 를 array 리터럴로 적는 대신 그룹을 참조하도록 한다.
type Group string

const (
	// GroupAll — ERP 운영 테넌트 공통 (마스터, 가용재고, 수주/출고/수금 등).
	// study 같은 비-ERP 테넌트는 이 그룹에 넣지 않는다.
	GroupAll Group = "all"
	// GroupModule — module 계열 (topsolar + cable). 수입/금융/원가 표면 (D-119).
	GroupModule Group = "module"
	// GroupStudy — 신입 교육 전용 테넌트. ERP 운영 표면을 상속하지 않는다.
	GroupStudy Group = "study"
)

// Tenant — 한 테넌트 정의.
type Tenant struct {
	ID ID
	// DisplayName — 사람이 읽는 이름 (admin UI 등에 노출).
	DisplayName string
	// HostPatterns — 이 테넌트로 분기시킬 호스트네임 정규식 (대소문자 무시).
	// 비어 있으면 fallback 으로만 동작 (default 테넌트, 보통 topsolar).
	HostPatterns []string
	// Groups — 소속 그룹. 카탈로그 DefaultTenants 가 그룹으로 표현될 때 참조.
	Groups []Group
	// IsDefault — 어느 패턴에도 안 걸리면 이 테넌트로 fallback (정확히 1개).
	IsDefault bool
}

// defaultRegistry — 패키지 전역 정본. 변경 시 같은 PR 에서 테스트/문서 동기화.
// tenants slice 안의 element 들은 codemod 가 생성 — scripts/codemod/gen-registry.mjs.
var defaultRegistry = &Registry{
	tenants: []Tenant{
		// AUTOGEN BEGIN: tenants — gen-registry.mjs 가 harness/registry.yaml 에서 생성. 손으로 편집 금지.
		{
			ID:           IDTopsolar,
			DisplayName:  "탑솔라(주)",
			HostPatterns: []string{`^module\.`, `^module-`, `^solarflow3\.`, `^localhost$`, `^127\.0\.0\.1$`},
			Groups:       []Group{GroupAll, GroupModule},
			IsDefault:    true,
		},
		{
			ID:           IDCable,
			DisplayName:  "케이블 테넌트",
			HostPatterns: []string{`^cable\.`, `^cable-`},
			Groups:       []Group{GroupAll, GroupModule},
		},
		{
			ID:           IDBaro,
			DisplayName:  "바로(주)",
			HostPatterns: []string{`^baro\.`, `^baro-`},
			Groups:       []Group{GroupAll},
		},
		{
			ID:           IDStudy,
			DisplayName:  "TopWorks Study",
			HostPatterns: []string{`^study\.`, `^study-`},
			Groups:       []Group{GroupStudy},
		},
		// AUTOGEN END: tenants
	},
}

func init() {
	defaultRegistry.compile()
}

// Registry — 컴파일된 테넌트 정본.
//
// 모든 조회 함수는 패키지 레벨에서도 제공되며 그 함수들은 defaultRegistry 를 위임 호출한다.
// 별도 인스턴스가 필요한 테스트는 NewRegistry 로 격리된 사본을 만든다.
type Registry struct {
	tenants  []Tenant
	byID     map[ID]Tenant
	patterns []hostPattern
	defID    ID
}

type hostPattern struct {
	re *regexp.Regexp
	id ID
}

// NewRegistry — 명시적 테넌트 목록으로 새 Registry 를 만든다 (테스트/PoC 용).
//
// 운영 코드는 defaultRegistry 와 패키지 레벨 함수만 사용한다. 가짜 4번째 테넌트
// 추가 PoC 같은 시나리오에서만 NewRegistry 를 호출한다.
func NewRegistry(tenants []Tenant) *Registry {
	cp := make([]Tenant, len(tenants))
	copy(cp, tenants)
	r := &Registry{tenants: cp}
	r.compile()
	return r
}

func (r *Registry) compile() {
	r.byID = make(map[ID]Tenant, len(r.tenants))
	r.patterns = r.patterns[:0]
	r.defID = ""
	for _, t := range r.tenants {
		if _, dup := r.byID[t.ID]; dup {
			panic("tenant: duplicate ID " + string(t.ID))
		}
		r.byID[t.ID] = t
		for _, raw := range t.HostPatterns {
			r.patterns = append(r.patterns, hostPattern{
				re: regexp.MustCompile("(?i)" + raw),
				id: t.ID,
			})
		}
		if t.IsDefault {
			if r.defID != "" {
				panic("tenant: more than one IsDefault tenant")
			}
			r.defID = t.ID
		}
	}
	if r.defID == "" {
		panic("tenant: no IsDefault tenant defined")
	}
}

// Detect — hostname 을 보고 어느 테넌트인지 결정. 매치 없으면 default 반환.
func (r *Registry) Detect(hostname string) ID {
	host := strings.ToLower(hostname)
	for _, p := range r.patterns {
		if p.re.MatchString(host) {
			return p.id
		}
	}
	return r.defID
}

// Get — ID 로 정의 조회.
func (r *Registry) Get(id ID) (Tenant, bool) {
	t, ok := r.byID[id]
	return t, ok
}

// All — 등록된 모든 테넌트 (정의 순서대로 복사 반환).
func (r *Registry) All() []Tenant {
	out := make([]Tenant, len(r.tenants))
	copy(out, r.tenants)
	return out
}

// AllIDs — 등록된 모든 테넌트 ID (정의 순서).
func (r *Registry) AllIDs() []ID {
	out := make([]ID, 0, len(r.tenants))
	for _, t := range r.tenants {
		out = append(out, t.ID)
	}
	return out
}

// Default — fallback 테넌트 ID (보통 topsolar).
func (r *Registry) Default() ID {
	return r.defID
}

// IDsInGroup — 그룹에 속한 테넌트 ID 정렬 목록.
//
// 정렬 기준은 카탈로그 default tenants array 가 안정적으로 보이도록 정의 순서가 아닌
// 알파벳 순. 카탈로그 검증 테스트가 array 비교로 하지 않고 set 비교로 하지만, 출력 안정성을
// 위해 정렬해 둔다.
func (r *Registry) IDsInGroup(g Group) []ID {
	var out []ID
	for _, t := range r.tenants {
		for _, gg := range t.Groups {
			if gg == g {
				out = append(out, t.ID)
				break
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// 패키지 레벨 위임 — 운영 코드는 이 함수들만 호출.

// Detect — defaultRegistry 위임.
func Detect(hostname string) ID { return defaultRegistry.Detect(hostname) }

// Get — defaultRegistry 위임.
func Get(id ID) (Tenant, bool) { return defaultRegistry.Get(id) }

// All — defaultRegistry 위임.
func All() []Tenant { return defaultRegistry.All() }

// AllIDs — defaultRegistry 위임.
func AllIDs() []ID { return defaultRegistry.AllIDs() }

// Default — defaultRegistry 위임.
func Default() ID { return defaultRegistry.Default() }

// IDsInGroup — defaultRegistry 위임.
func IDsInGroup(g Group) []ID { return defaultRegistry.IDsInGroup(g) }

// IDsInGroupAsStrings — IDsInGroup 결과를 string slice 로. 카탈로그가 string 만 받는 곳에서 호출.
func IDsInGroupAsStrings(g Group) []string {
	ids := IDsInGroup(g)
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = string(id)
	}
	return out
}

// AllIDsAsStrings — AllIDs 의 string slice 버전.
func AllIDsAsStrings() []string {
	ids := AllIDs()
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = string(id)
	}
	sort.Strings(out)
	return out
}

// Known — 주어진 string 이 등록된 테넌트 ID 인지.
func Known(s string) bool {
	_, ok := Get(ID(s))
	return ok
}
