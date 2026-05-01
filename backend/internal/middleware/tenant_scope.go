package middleware

import (
	"net/http"

	"solarflow-backend/internal/response"
)

// RequireTenantScope — 지정한 테넌트 스코프만 통과시키는 미들웨어 (D-108)
// 비유: 같은 건물 안에서 "탑솔라 라운지", "바로 라운지" 출입증을 따로 받는 구조
//
// 사용 예:
//
//	r.With(middleware.RequireTenantScope(middleware.TenantScopeTopsolar)).
//	    Route("/lcs", ...)
//
// AuthMiddleware 다음에 와야 한다(테넌트 스코프는 user_profiles에서 읽어 context에 들어 있음).
// 허용 목록에 없으면 403을 반환한다.
func RequireTenantScope(allowed ...string) func(http.Handler) http.Handler {
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, s := range allowed {
		allowedSet[s] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			scope := GetTenantScope(r.Context())
			if _, ok := allowedSet[scope]; !ok {
				response.RespondError(w, http.StatusForbidden, "이 리소스에 접근할 권한이 없습니다")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
