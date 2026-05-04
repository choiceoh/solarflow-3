package middleware

import (
	"net/http"

	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/response"
)

// FeatureGate — feature 카탈로그(D-120) 기반 라우트 게이트.
//
// 비유: RequireTenantScope(D-108) 가 "topsolar 라운지" 같은 정적 출입증이라면,
// FeatureGate 는 "이 사람이 lc.read 라는 권한을 가졌는지" 를 매번 카탈로그/배선 테이블에서
// 조회하는 동적 검문소다. 자유 문자열 인자(typo) 를 막기 위해 feature.FeatureID 타입만 받는다.
//
// startup 시 카탈로그가 안정 상태인지(Resolver.Knows) 검증해 미정의 ID 를 미리 잡는다.
type FeatureGate struct {
	resolver *feature.Resolver
}

// NewFeatureGate — resolver 를 감싸 미들웨어 빌더를 만든다.
// resolver 가 nil 이면 카탈로그 기본값만 사용하는 새 resolver 를 만든다.
func NewFeatureGate(resolver *feature.Resolver) *FeatureGate {
	if resolver == nil {
		resolver = feature.NewResolver(nil)
	}
	return &FeatureGate{resolver: resolver}
}

// Resolver — 외부(예: HTTP 핸들러에서 admin 이 enabled 목록을 조회) 에서 사용.
func (g *FeatureGate) Resolver() *feature.Resolver {
	return g.resolver
}

// Require — 지정 feature 를 호출할 권한이 있는 테넌트만 통과시키는 미들웨어를 반환한다.
//
// 동작:
//  1. startup 직전(NewFeatureGate 시점) 카탈로그에 id 가 없으면 panic — 설정 오류는 fail-fast.
//  2. AuthMiddleware 다음에 와야 한다(테넌트 스코프가 context 에 들어 있어야 한다).
//  3. resolver.IsEnabled(tenant, id) == false 면 403.
//
// 자유 문자열을 막기 위해 인자는 feature.FeatureID 타입 — 라우트 정의에서
// feature.IDXxx 상수만 쓰게 한다.
func (g *FeatureGate) Require(id feature.FeatureID) func(http.Handler) http.Handler {
	if !g.resolver.Knows(id) {
		// 비유: 출입증 종류 자체가 명단에 없는데 이 검문소를 만든 셈이다 — 시작도 하지 않는다.
		panic("middleware: 카탈로그에 등록되지 않은 feature_id: " + string(id))
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			scope := GetTenantScope(r.Context())
			if !g.resolver.IsEnabled(scope, id) {
				response.RespondError(w, http.StatusForbidden, "이 리소스에 접근할 권한이 없습니다")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
