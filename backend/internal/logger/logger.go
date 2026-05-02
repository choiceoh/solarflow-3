// Package logger — slog 기반 구조화 로깅 초기화.
//
// 환경변수 LOG_FORMAT 으로 출력 포맷 선택:
//   - "json"  → JSON 핸들러 (운영 — Loki/CloudWatch 파싱 가능)
//   - "tint"  → tint 컬러 핸들러 (개발 — 사람이 읽기 좋은 색상)
//   - 미설정  → 표준 슬래시h 텍스트 핸들러 (안전한 기본값)
//
// 모든 로그는 slog.SetDefault 로 등록되어 표준 log 패키지 호출도
// JSON 포맷으로 흘러간다. 호출자는 slog.Info/Warn/Error 를 권장.
package logger

import (
	"log/slog"
	"os"
	"strings"
)

// Init — 앱 부팅 시 main에서 1회 호출. slog 기본 핸들러를 설정한다.
// 반환된 *slog.Logger 는 main 부트스트랩 단계 로그용 (slog.Default 와 동일).
func Init() *slog.Logger {
	level := parseLevel(os.Getenv("LOG_LEVEL"))
	format := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT")))

	var handler slog.Handler
	opts := &slog.HandlerOptions{Level: level}

	switch format {
	case "json":
		handler = slog.NewJSONHandler(os.Stdout, opts)
	case "tint":
		handler = newTintHandler(level)
	default:
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
