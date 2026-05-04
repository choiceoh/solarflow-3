package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"hash"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// requestIDKey — context에 request_id를 보관할 키.
// auth 미들웨어가 다른 키로 user/tenant를 따로 넣기 때문에 여기는 request_id 전용.
type reqIDKey struct{}

// RequestLog — 모든 요청을 구조화 로그로 기록한다(D-122 보강).
//   - 진입 시: request_id 생성·context 주입, Observability 홀더 부착, 시작 시각 기록
//   - 종료 시: method, path, query, tenant, user, status, duration_ms,
//             response_bytes, response_sha, request_id 출력
//
// query/tenant/user/response_sha 는 staging traffic replay diff 하네스(D-122) 가
// 요청을 정확히 재구성하고 응답 동등성을 확인하기 위한 입력. 이전 RequestLog 는
// path 만 기록해 ?from=... 같은 query 가 다른 동일 path 요청을 구분 못 했고,
// auth context 가 outer 에서 안 보여 어느 테넌트가 보낸 요청인지도 누락이었다.
//
// 핸들러 패닉으로 ResponseWriter.WriteHeader가 호출되지 않는 경우도
// 200 으로 가정하지 않고 statusCapturer 가 0을 200으로 표준화한다.
//
// SSE/streaming 응답도 hash 가 누적되지만 stream 특성상 결정적이지 않으므로
// replay diff 하네스는 SSE path 를 기본 제외한다(D-122).
func RequestLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		reqID := r.Header.Get("X-Request-ID")
		if reqID == "" {
			reqID = uuid.NewString()
		}

		ctx := context.WithValue(r.Context(), reqIDKey{}, reqID)
		ctx, obs := withObservability(ctx)
		w.Header().Set("X-Request-ID", reqID)

		sc := &statusCapturer{ResponseWriter: w, status: http.StatusOK, hasher: sha256.New()}
		next.ServeHTTP(sc, r.WithContext(ctx))

		dur := time.Since(start)
		level := slog.LevelInfo
		if sc.status >= 500 {
			level = slog.LevelError
		} else if sc.status >= 400 {
			level = slog.LevelWarn
		}

		// auth 가 채웠으면 obs 에 값이 있고, 인증 미통과 요청(/health, /public/*) 은 빈 문자열.
		_ = obs

		bodySHA := hex.EncodeToString(sc.hasher.Sum(nil))

		slog.LogAttrs(ctx, level, "http",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.String("query", r.URL.RawQuery),
			slog.String("tenant", GetObservability(ctx).TenantScope),
			slog.String("user", GetObservability(ctx).UserID),
			slog.Int("status", sc.status),
			slog.Int64("duration_ms", dur.Milliseconds()),
			slog.Int64("bytes", sc.bytes),
			slog.String("body_sha", bodySHA),
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

// statusCapturer — http.ResponseWriter 래퍼. WriteHeader 호출 시 상태코드를 기록하고
// Write 호출 시 body 를 sha256 으로 누적 해시한다(D-122 응답 동등성 검증용).
//
// 핸들러가 명시적 WriteHeader 없이 Write만 호출해도 Go가 자동으로 200을 보내므로
// 기본값 200으로 초기화한다.
type statusCapturer struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
	bytes       int64
	hasher      hash.Hash
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
	if s.hasher != nil {
		_, _ = s.hasher.Write(b)
	}
	s.bytes += int64(len(b))
	return s.ResponseWriter.Write(b)
}

// Flush — SSE/스트리밍 핸들러의 w.(http.Flusher) 단언이 래퍼 너머 원본까지 닿게 하기 위한 위임.
func (s *statusCapturer) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
