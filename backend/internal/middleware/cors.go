package middleware

import (
	"net/http"
	"os"
	"strings"
)

// allowedOriginsMap — 환경변수에서 허용 도메인을 읽어 맵으로 변환
// 비유: 건물 출입 허용 명단 — 이 명단에 있는 사이트만 API 호출 가능
func allowedOriginsMap() map[string]bool {
	raw := os.Getenv("CORS_ORIGINS")
	if raw == "" {
		// 비유: 명단이 없으면 개발용 기본값만 허용
		return map[string]bool{"http://localhost:5173": true}
	}

	result := make(map[string]bool)
	for _, origin := range strings.Split(raw, ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			result[origin] = true
		}
	}
	return result
}

// CORSMiddleware — 브라우저 CORS 정책을 처리하는 미들웨어
// 비유: 건물 현관의 보안 게이트 — "이 사이트에서 온 요청 통과시켜도 되나요?" 확인
func CORSMiddleware(next http.Handler) http.Handler {
	origins := allowedOriginsMap()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// 비유: 허용 명단에 있는 출처만 CORS 헤더 부여
		if origin != "" && origins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Expose-Headers", "X-Total-Count")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "3600")
		}

		// 비유: OPTIONS = 브라우저가 "이 요청 보내도 돼?" 하고 미리 물어보는 것
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
