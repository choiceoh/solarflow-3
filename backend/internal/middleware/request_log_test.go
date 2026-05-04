package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRequestLog_CapturesQueryTenantUserAndBodyHash — D-122 보강 검증.
//
// 시나리오:
//  1. RequestLog → 가짜 auth → 핸들러
//  2. auth 가 SetUserContext 로 tenant/user 채움
//  3. 핸들러가 응답 본문 작성
//  4. RequestLog 가 log line 에 query/tenant/user/body_sha 모두 기록했는지 확인
//
// 이전 RequestLog 는 path 만 기록해 query 가 다른 동일 path 요청을 구분 못 했고,
// outer middleware 라 auth context 를 못 봤다. D-122 staging replay diff 의 입력
// 정보를 충분히 확보하기 위해 보강했다.
func TestRequestLog_CapturesQueryTenantUserAndBodyHash(t *testing.T) {
	var logBuf bytes.Buffer
	prevLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(prevLogger) })

	body := []byte(`{"hello":"world"}`)
	sum := sha256.Sum256(body)
	expectedSHA := hex.EncodeToString(sum[:])

	// 가짜 auth — RequestLog 다음에 와서 SetUserContext 호출
	stubAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := SetUserContext(r.Context(),
				"user-42", "operator", "u@solarflow.local", TenantScopeBaro, nil)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(body)
	})

	chain := RequestLog(stubAuth(handler))
	req := httptest.NewRequest("GET", "/api/v1/baro/incoming/?from=2026-01-01&warehouse=W3", nil)
	rec := httptest.NewRecorder()
	chain.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: 기대 200, 실제 %d", rec.Code)
	}

	var entry map[string]any
	if err := json.Unmarshal(logBuf.Bytes(), &entry); err != nil {
		t.Fatalf("로그가 JSON 한 줄 아님: %v\n%s", err, logBuf.String())
	}

	checks := map[string]string{
		"method":   "GET",
		"path":     "/api/v1/baro/incoming/",
		"query":    "from=2026-01-01&warehouse=W3",
		"tenant":   TenantScopeBaro,
		"user":     "user-42",
		"body_sha": expectedSHA,
	}
	for k, want := range checks {
		got, ok := entry[k].(string)
		if !ok {
			t.Errorf("로그에 %q 필드 없음 또는 string 아님: %v", k, entry[k])
			continue
		}
		if got != want {
			t.Errorf("로그 %q: 기대 %q, 실제 %q", k, want, got)
		}
	}
	if got, _ := entry["bytes"].(float64); int64(got) != int64(len(body)) {
		t.Errorf("로그 bytes: 기대 %d, 실제 %v", len(body), entry["bytes"])
	}
}

// TestRequestLog_NoAuthFallbackToBlankTenant — /health, /public/* 처럼 인증 미통과
// 라우트는 SetUserContext 가 호출 안 되므로 tenant/user 는 빈 문자열로 기록.
func TestRequestLog_NoAuthFallbackToBlankTenant(t *testing.T) {
	var logBuf bytes.Buffer
	prevLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(prevLogger) })

	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	chain := RequestLog(handler)

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()
	chain.ServeHTTP(rec, req)

	var entry map[string]any
	if err := json.Unmarshal(logBuf.Bytes(), &entry); err != nil {
		t.Fatalf("로그 JSON 아님: %v\n%s", err, logBuf.String())
	}
	if got, _ := entry["tenant"].(string); got != "" {
		t.Errorf("auth 없는 요청에 tenant=%q (빈 문자열 기대)", got)
	}
	if got, _ := entry["user"].(string); got != "" {
		t.Errorf("auth 없는 요청에 user=%q (빈 문자열 기대)", got)
	}
}

// TestObservability_SetThenGet — pointer holder 가 mutation 후 read 시 같은 값을 본다.
func TestObservability_SetThenGet(t *testing.T) {
	ctx, _ := withObservability(context.Background())
	SetObservability(ctx, func(o *Observability) {
		o.UserID = "u1"
		o.TenantScope = TenantScopeCable
	})
	got := GetObservability(ctx)
	if got.UserID != "u1" || got.TenantScope != TenantScopeCable {
		t.Errorf("Observability mutation 미반영: %+v", got)
	}
}

// TestObservability_NoHolder — context 에 holder 없으면 SetObservability 는 no-op,
// GetObservability 는 빈 구조체.
func TestObservability_NoHolder(t *testing.T) {
	ctx := context.Background()
	SetObservability(ctx, func(o *Observability) {
		o.UserID = "should-not-stick"
	})
	got := GetObservability(ctx)
	if got.UserID != "" {
		t.Errorf("holder 없는 ctx 에서 mutation 누수: %+v", got)
	}
}

// TestRequestLog_LargeResponseDoesNotPanic — 큰 응답 (예: 엑셀 export) 에서 hash 누적이 정상.
func TestRequestLog_LargeResponseDoesNotPanic(t *testing.T) {
	var logBuf bytes.Buffer
	prevLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logBuf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(prevLogger) })

	big := strings.Repeat("X", 10*1024*1024) // 10 MB
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// 청크 단위 쓰기 — Write() 가 여러 번 호출돼도 hash 가 누적되는지
		for i := 0; i < 10; i++ {
			_, _ = w.Write([]byte(big[i*1024*1024 : (i+1)*1024*1024]))
		}
	})
	chain := RequestLog(handler)
	req := httptest.NewRequest("GET", "/api/v1/export/all", nil)
	rec := httptest.NewRecorder()
	chain.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: %d", rec.Code)
	}
	var entry map[string]any
	if err := json.Unmarshal(logBuf.Bytes(), &entry); err != nil {
		t.Fatalf("로그 JSON 아님: %v", err)
	}
	if got, _ := entry["bytes"].(float64); int64(got) != int64(len(big)) {
		t.Errorf("bytes: 기대 %d, 실제 %v", len(big), entry["bytes"])
	}
	bigSum := sha256.Sum256([]byte(big))
	expected := hex.EncodeToString(bigSum[:])
	if got, _ := entry["body_sha"].(string); got != expected {
		t.Errorf("body_sha 불일치 (청크 누적 깨짐)")
	}
}
