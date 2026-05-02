package middleware

import "net/http"

// Gates — 라우트 보호 미들웨어 묶음 (D-RegisterRoutes)
// 비유: 출입증 검증대 4종 — 작성권한, 관리자 전용, 탑솔라 전용, 바로(주) 전용
// 핸들러가 RegisterRoutes(r, g)로 받아 자기 라우트에 g.Write/g.AdminOnly 등을 직접 적용한다.
type Gates struct {
	Write        func(http.Handler) http.Handler
	AdminOnly    func(http.Handler) http.Handler
	TopsolarOnly func(http.Handler) http.Handler
	BaroOnly     func(http.Handler) http.Handler
}

// NewGates — 운영 기본 가드 묶음
func NewGates() Gates {
	return Gates{
		Write:        RoleMiddleware("admin", "operator"),
		AdminOnly:    RoleMiddleware("admin"),
		TopsolarOnly: RequireTenantScope(TenantScopeTopsolar),
		BaroOnly:     RequireTenantScope(TenantScopeBaro),
	}
}
