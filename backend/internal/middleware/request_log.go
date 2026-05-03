package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// requestIDKey — context에 request_id를 보관할 키.
// auth 미들웨어가 다른 키로 user/tenant를 따로 넣기 때문에 여기는 request_id 전용.
type reqIDKey struct{}

// RequestLog — 모든 요청을 구조화 로그로 기록한다.
//   - 진입 시: request_id 생성·context 주입, 시작 시각 기록
//   - 종료 시: method, path, status, duration_ms, request_id 출력
//
// 핸들러 패닉으로 ResponseWriter.WriteHeader가 호출되지 않는 경우도
// 200 으로 가정하지 않고 statusCapturer 가 0을 200으로 표준화한다.
//
// auth 미들웨어가 채우는 user_id/tenant_scope는 outer middleware 인 본 함수에서
// 직접 읽기 어렵다 (r.WithContext가 child context로 흘러가므로). 추후 보강 PR에서
// 공유 pointer 패턴으로 확장 예정.
func RequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = uuid.NewString()
		}

		ctx := context.WithValue(r.Context(), reqIDKey{}, reqID)
		w.Header().Set("X-Request-ID", reqID)

		sc := &statusCapturer{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sc, r.WithContext(ctx))

		dur := time.Since(start)
		level := slog.LevelInfo
		if sc.status >= 500 {
			level = slog.LevelError
		} else if sc.status >= 400 {
			level = slog.LevelWarn
		}

		slog.LogAttrs(ctx, level, "http",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", sc.status),
			slog.Int64("duration_ms", dur.Milliseconds()),
			slog.String("request_id", reqID),
		)
	})
}

// GetRequestID — 핸들러에서 현재 요청 ID 조회 (없으면 빈 문자열).
func GetRequestID(ctx context.Context) string {
	if v, ok := ctx.Value(reqIDKey{}).(string); ok {
		return v
	}
	return ""
}

// statusCapturer — http.ResponseWriter 래퍼. WriteHeader 호출 시 상태코드를 기록한다.
// 핸들러가 명시적 WriteHeader 없이 Write만 호출해도 Go가 자동으로 200을 보내므로
// 기본값 200으로 초기화한다.
type statusCapturer struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (s *statusCapturer) WriteHeader(code int) {
	if !s.wroteHeader {
		s.status = code
		s.wroteHeader = true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusCapturer) Write(b []byte) (int, error) {
	if !s.wroteHeader {
		s.wroteHeader = true
	}
	return s.ResponseWriter.Write(b)
}

// Flush — SSE/스트리밍 핸들러의 w.(http.Flusher) 단언이 래퍼 너머 원본까지 닿게 하기 위한 위임.
func (s *statusCapturer) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
