package middleware

import (
	"net/http"

	"solarflow-backend/internal/feature"
)

// Gates — 라우트 보호 미들웨어 묶음 (D-RegisterRoutes / D-120)
// 비유: 출입증 검증대 — 작성권한, 관리자 전용, feature 카탈로그 게이트.
// 핸들러가 RegisterRoutes(r, g)로 받아 자기 라우트에 g.Write/g.AdminOnly/g.Feature(id) 등을 직접 적용한다.
//
// D-120 이후: 테넌트 격리는 feature 카탈로그(internal/feature)로 일원화한다.
//   - 신규 라우트는 g.Feature(feature.IDXxx) 사용
//   - 카탈로그 + harness/FEATURE-WIRING-MATRIX.md 를 같은 PR에서 갱신해야 한다
//   - TopsolarOnly/BaroOnly는 마이그레이션 호환을 위해 보존하지만 deprecated.
type Gates struct {
	Write     func(http.Handler) http.Handler
	AdminOnly func(http.Handler) http.Handler

	// Feature — feature 카탈로그(D-120) 기반 동적 게이트.
	// 인자 id는 feature.FeatureID 타입만 허용 — 라우트 정의에서 feature.IDXxx 상수 사용.
	// 카탈로그에 없는 ID 면 startup 시 panic (설정 오류 fail-fast).
	Feature func(id feature.FeatureID) func(http.Handler) http.Handler

	// FeatureGate — admin/메타 편집기에서 enabled 목록을 조회할 때 사용.
	FeatureGate *FeatureGate

	// TopsolarOnly — DEPRECATED (D-120). module 계열(topsolar+cable) 전용 라우트의 legacy alias.
	// 신규 사용 금지 — g.Feature(feature.IDXxx)로 마이그레이션할 것.
	TopsolarOnly func(http.Handler) http.Handler
	// BaroOnly — DEPRECATED (D-120). BARO 전용 라우트의 legacy alias.
	// 신규 사용 금지 — g.Feature(feature.IDXxx)로 마이그레이션할 것.
	BaroOnly func(http.Handler) http.Handler
}

// NewGates — 운영 기본 가드 묶음. 카탈로그 default 만 사용(DB override 없음).
//
// DB override 까지 로드하려면 NewGatesWithResolver 를 사용하고 사이트 시작 시
// resolver 를 채운다(이번 PR 에서는 미사용 — 후속 작업).
func NewGates() Gates {
	return NewGatesWithResolver(feature.NewResolver(nil))
}

// NewGatesWithResolver — 외부에서 구성된 resolver(예: DB override 로드 후) 로 Gates 를 만든다.
func NewGatesWithResolver(resolver *feature.Resolver) Gates {
	fg := NewFeatureGate(resolver)
	return Gates{
		Write:        RoleMiddleware("admin", "operator"),
		AdminOnly:    RoleMiddleware("admin"),
		Feature:      fg.Require,
		FeatureGate:  fg,
		TopsolarOnly: RequireTenantScope(TenantScopeTopsolar, TenantScopeCable),
		BaroOnly:     RequireTenantScope(TenantScopeBaro),
	}
}
