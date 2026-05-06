//go:build !windows

// Package serve — zero-downtime HTTP 서버 (Linux/macOS).
//
// 배포 흐름 (D-123):
//  1. cron-deploy.sh 가 새 바이너리를 .new → 운영 자리로 원자 swap.
//  2. `systemctl --user kill -s HUP solarflow-go.service` 로 SIGHUP 송신.
//  3. 현재 프로세스가 SIGHUP 을 받으면 tableflip Upgrader 가 fork+exec.
//     자식이 부모의 listener fd 를 SO_REUSEPORT 로 인계받아 즉시 accept 시작.
//  4. 자식이 Ready() 호출 → 부모는 새 요청 수락을 멈추고 진행 중 요청을 드레인.
//  5. 부모 종료. 사용자 체감 다운타임 0.
//
// SIGTERM/SIGINT (systemctl stop, ctrl-c) 도 같은 graceful shutdown 경로 사용.
package serve

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cloudflare/tableflip"
)

// shutdownTimeout — graceful shutdown 시 진행 중 요청 드레인 한도.
// 너무 짧으면 LC 일괄 import 같은 무거운 핸들러가 잘리고,
// 너무 길면 deploy 흐름 전체가 늘어진다. 30s 가 두 사이의 보수적 절충.
const shutdownTimeout = 30 * time.Second

// Run — addr 에 listener 를 띄우고 SIGHUP 으로 zero-downtime 재시작을 지원한다.
// SIGTERM/SIGINT 수신 시 graceful shutdown 후 nil 반환.
// 자식 프로세스로 인계가 끝나서 정상 종료할 때도 nil 반환.
func Run(addr string, handler http.Handler) error {
	upg, err := tableflip.New(tableflip.Options{
		// UpgradeTimeout 기본값(1분) 사용. 자식이 1분 내 Ready() 호출 못 하면 부모는 계속 가동.
	})
	if err != nil {
		return err
	}
	defer upg.Stop()

	// SIGHUP 핸들러 — 배포 스크립트가 보내는 신호.
	// tableflip 자체도 같은 일을 하지만, 명시적으로 받아 로그를 남긴다.
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGHUP)
		for range sig {
			slog.Info("SIGHUP 수신 — graceful upgrade 시작")
			if err := upg.Upgrade(); err != nil {
				slog.Error("graceful upgrade 실패 — 부모 프로세스 유지", "error", err)
			}
		}
	}()

	// tableflip 의 Listen 은 부모가 살아있으면 부모로부터 fd 를 인계받고,
	// 처음 시작이거나 부모가 죽었으면 새로 bind 한다.
	ln, err := upg.Listen("tcp", addr)
	if err != nil {
		return err
	}

	server := &http.Server{Handler: handler}
	go func() {
		slog.Info("SolarFlow 3.0 서버 시작", "addr", addr, "pid", os.Getpid())
		if err := server.Serve(ln); err != nil && err != http.ErrServerClosed {
			slog.Error("http.Serve 비정상 종료", "error", err)
		}
	}()

	// 부모가 살아있으면 "이제 끝내도 된다" 신호. 첫 실행이면 즉시 통과.
	if err := upg.Ready(); err != nil {
		return err
	}

	// 두 가지 종료 경로:
	//   - upg.Exit(): 자식이 Ready 했으니 우리(부모)는 드레인 후 종료.
	//   - SIGTERM/SIGINT: 운영자/systemd 가 unit 자체를 멈춤.
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-upg.Exit():
		slog.Info("자식 프로세스 인계 완료 — 부모 드레인 시작")
	case s := <-sig:
		slog.Info("종료 신호 수신 — graceful shutdown 시작", "signal", s.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		slog.Error("graceful shutdown 실패", "error", err)
		return err
	}
	slog.Info("서버 graceful shutdown 완료")
	return nil
}
