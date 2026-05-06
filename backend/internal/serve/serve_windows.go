//go:build windows

// Package serve — Windows 개발 환경 fallback.
// tableflip 은 fork+exec 모델이라 Windows 미지원. Windows 는 dev-only 이므로
// graceful shutdown 만 지원하고 SIGHUP zero-downtime 재시작은 생략.
// 운영(Linux)에서는 serve_unix.go 가 활성화된다.
package serve

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const shutdownTimeout = 30 * time.Second

// Run — addr 에 listener 를 띄우고 SIGINT/SIGTERM 시 graceful shutdown.
func Run(addr string, handler http.Handler) error {
	server := &http.Server{Addr: addr, Handler: handler}
	go func() {
		slog.Info("SolarFlow 3.0 서버 시작 (windows dev mode)", "addr", addr, "pid", os.Getpid())
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http.ListenAndServe 비정상 종료", "error", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	s := <-sig
	slog.Info("종료 신호 수신 — graceful shutdown 시작", "signal", s.String())

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		slog.Error("graceful shutdown 실패", "error", err)
		return err
	}
	slog.Info("서버 graceful shutdown 완료")
	return nil
}
