package middleware

import "net/http"

// CORS는 브라우저의 보안 정책을 처리하는 미들웨어
// 비유: 건물 현관의 보안 게이트 — "이 사람 들어와도 되나요?" 확인
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// OPTIONS = 브라우저가 "이 요청 보내도 돼?" 하고 미리 물어보는 것
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
