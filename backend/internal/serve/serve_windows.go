//go:build windows

// Package serve — Windows 개발 환경 fallback.
// tableflip 은 fork+exec 모델이라 Windows 미지원. Windows 는 dev-only 이므로
// graceful shutdown 만 지원하고 SIGHUP zero-downtime 재시작은 생략.
// 운영(Linux)에서는 serve_unix.go 가 활성화된다.
package serve

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

const shutdownTimeout = 30 * time.Second

// Server — Run 에 등록할 단일 listener 정의 (serve_unix.go 와 동일 시그니처).
type Server struct {
	Addr    string
	Handler http.Handler
	Name    string
}

// Run — servers 의 모든 listener 를 띄우고 SIGINT/SIGTERM 시 모두 graceful shutdown.
func Run(servers ...Server) error {
	if len(servers) == 0 {
		return fmt.Errorf("serve.Run: 등록할 server 가 없음")
	}

	httpServers := make([]*http.Server, 0, len(servers))
	for _, s := range servers {
		name := s.Name
		if name == "" {
			name = s.Addr
		}
		srv := &http.Server{Addr: s.Addr, Handler: s.Handler}
		httpServers = append(httpServers, srv)
		slog.Info("listener 시작 (windows dev)", "name", name, "addr", s.Addr, "pid", os.Getpid())
		go func(srv *http.Server, label string) {
			if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				slog.Error("http.ListenAndServe 비정상 종료", "name", label, "error", err)
			}
		}(srv, name)
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	s := <-sig
	slog.Info("종료 신호 수신 — graceful shutdown 시작", "signal", s.String())

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	var wg sync.WaitGroup
	for _, srv := range httpServers {
		wg.Add(1)
		go func(srv *http.Server) {
			defer wg.Done()
			if err := srv.Shutdown(ctx); err != nil {
				slog.Error("graceful shutdown 실패", "error", err)
			}
		}(srv)
	}
	wg.Wait()
	slog.Info("서버 graceful shutdown 완료")
	return nil
}
