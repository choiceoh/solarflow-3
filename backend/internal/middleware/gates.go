package middleware

import "net/http"

// Gates — 라우트 보호 미들웨어 묶음 (D-RegisterRoutes)
// 비유: 출입증 검증대 4종 — 작성권한, 관리자 전용, module 계열 전용, 바로(주) 전용
// 핸들러가 RegisterRoutes(r, g)로 받아 자기 라우트에 g.Write/g.AdminOnly 등을 직접 적용한다.
type Gates struct {
	Write     func(http.Handler) http.Handler
	AdminOnly func(http.Handler) http.Handler
	// TopsolarOnly는 기존 이름을 유지한다. D-119 이후 의미는 module 계열(topsolar+cable) 전용이다.
	TopsolarOnly func(http.Handler) http.Handler
	BaroOnly     func(http.Handler) http.Handler
}

// NewGates — 운영 기본 가드 묶음
func NewGates() Gates {
	return Gates{
		Write:        RoleMiddleware("admin", "operator"),
		AdminOnly:    RoleMiddleware("admin"),
		TopsolarOnly: RequireTenantScope(TenantScopeTopsolar, TenantScopeCable),
		BaroOnly:     RequireTenantScope(TenantScopeBaro),
	}
}
