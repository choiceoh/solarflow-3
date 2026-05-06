//go:build !windows

// Package serve — zero-downtime HTTP 서버 (Linux/macOS).
//
// 배포 흐름 (D-123):
//  1. cron-deploy.sh 가 새 바이너리를 .new → 운영 자리로 원자 swap.
//  2. `systemctl --user reload solarflow-go.service` → ExecReload=kill -HUP $MAINPID.
//  3. 현재 프로세스가 SIGHUP 을 받으면 tableflip Upgrader 가 fork+exec.
//     자식이 부모의 listener fd 를 인계받아 즉시 accept 시작.
//  4. 자식이 Ready() 호출 → sd_notify(MAINPID=child) 로 systemd 에 PID 갱신 알림.
//     부모는 새 요청 수락을 멈추고 진행 중 요청을 드레인 후 종료.
//  5. 사용자 체감 다운타임 0.
//
// systemd 호환:
//   - unit 파일에 Type=notify + NotifyAccess=all 필수 (자식이 sd_notify 보냄).
//   - 없으면 부모 종료 시 systemd 가 cgroup 전체 SIGTERM 을 보내 자식도 죽는다.
//
// SIGTERM/SIGINT (systemctl stop, ctrl-c) 도 같은 graceful shutdown 경로 사용.
package serve

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cloudflare/tableflip"
	"github.com/coreos/go-systemd/v22/daemon"
)

// shutdownTimeout — graceful shutdown 시 진행 중 요청 드레인 한도.
// 너무 짧으면 LC 일괄 import 같은 무거운 핸들러가 잘리고,
// 너무 길면 deploy 흐름 전체가 늘어진다. 30s 가 두 사이의 보수적 절충.
const shutdownTimeout = 30 * time.Second

// Server — Run 에 등록할 단일 listener 정의.
// Addr 는 tableflip.Listen 에 그대로 전달된다 ("host:port" 형식).
type Server struct {
	Addr    string
	Handler http.Handler
	// Name — 로그 라벨 (예: "main", "metrics"). 미지정 시 Addr 사용.
	Name string
}

// Run — servers 의 모든 listener 를 tableflip 으로 띄우고 SIGHUP zero-downtime 재시작 지원.
// 각 listener 는 동일 Upgrader 에 등록돼 SIGHUP 시 자식이 모두 인계받는다.
func Run(servers ...Server) error {
	if len(servers) == 0 {
		return fmt.Errorf("serve.Run: 등록할 server 가 없음")
	}

	upg, err := tableflip.New(tableflip.Options{})
	if err != nil {
		return err
	}
	defer upg.Stop()

	// SIGHUP 핸들러 — 배포 스크립트가 보내는 신호.
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

	httpServers := make([]*http.Server, 0, len(servers))
	for _, s := range servers {
		name := s.Name
		if name == "" {
			name = s.Addr
		}
		var ln net.Listener
		ln, err = upg.Listen("tcp", s.Addr)
		if err != nil {
			return fmt.Errorf("listener %s bind 실패: %w", name, err)
		}
		httpSrv := &http.Server{Handler: s.Handler}
		httpServers = append(httpServers, httpSrv)

		slog.Info("listener 시작", "name", name, "addr", s.Addr, "pid", os.Getpid())
		go func(srv *http.Server, l net.Listener, label string) {
			if err := srv.Serve(l); err != nil && err != http.ErrServerClosed {
				slog.Error("http.Serve 비정상 종료", "name", label, "error", err)
			}
		}(httpSrv, ln, name)
	}

	// tableflip 부모(있다면)에게 우리 준비 완료 알림.
	if err := upg.Ready(); err != nil {
		return err
	}

	// systemd 에 새 MainPID 알림 (Type=notify + NotifyAccess=all 필수).
	// SdNotify 는 NOTIFY_SOCKET 환경변수가 없으면 (false, nil) 반환 — dev 환경 안전.
	sent, sderr := daemon.SdNotify(false, fmt.Sprintf("READY=1\nMAINPID=%d", os.Getpid()))
	if sderr != nil {
		slog.Warn("sd_notify 실패 (Type=notify 가 아닐 수 있음)", "error", sderr)
	} else if sent {
		slog.Info("sd_notify READY=1 + MAINPID 송신 완료", "pid", os.Getpid())
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
	for i, srv := range httpServers {
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("graceful shutdown 실패", "idx", i, "error", err)
		}
	}
	slog.Info("서버 graceful shutdown 완료")
	return nil
}
