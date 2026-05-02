package logger

import (
	"log/slog"
	"os"
	"time"

	"github.com/lmittmann/tint"
)

// newTintHandler — 개발용 컬러 출력 (TTY 가정).
// 운영 환경에서는 LOG_FORMAT=json 으로 전환.
func newTintHandler(level slog.Level) slog.Handler {
	return tint.NewHandler(os.Stdout, &tint.Options{
		Level:      level,
		TimeFormat: time.Kitchen,
	})
}
