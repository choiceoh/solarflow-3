package middleware

import (
	"net/http"
	"strings"

	"solarflow-backend/internal/response"
	"solarflow-backend/internal/tenant"
)

// StudyTenantFence — study.topworks.ltd 테넌트가 기존 ERP API를 우연히 상속하지 않게 막는다.
//
// 비유: 교육장 출입증을 든 신입이 창고/금융 사무실까지 들어가지 않도록 복도에서 한 번 더
// 방향을 잡아주는 안내 데스크다. study 테넌트는 /study 학습 API와 자기 프로필만 통과한다.
func StudyTenantFence(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if GetTenantScope(r.Context()) != string(tenant.IDStudy) {
			next.ServeHTTP(w, r)
			return
		}
		if isStudyAllowedPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		response.RespondError(w, http.StatusForbidden, "study 테넌트는 학습 도메인 API만 사용할 수 있습니다")
	})
}

func isStudyAllowedPath(path string) bool {
	if path == "/api/v1/study" || strings.HasPrefix(path, "/api/v1/study/") {
		return true
	}
	if path == "/api/v1/users/me" || strings.HasPrefix(path, "/api/v1/users/me/") {
		return true
	}
	return false
}
