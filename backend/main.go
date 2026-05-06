// SolarFlow 3.0 백엔드 진입점.
// 모든 의존성 부트스트랩은 internal/app.New 로 위임 — main 은 cfg 로드와 서버 구동만.
// 실제 listener/graceful shutdown 은 internal/serve 가 담당 (Linux 는 tableflip,
// Windows 는 평이한 http.Server). 자세한 배포 흐름은 D-123 참조.
package main

import (
	"log/slog"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"solarflow-backend/internal/app"
	"solarflow-backend/internal/config"
	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/logger"
	"solarflow-backend/internal/router"
	"solarflow-backend/internal/serve"
)

func main() {
	logger.Init()

	cfg := config.Load()
	a, err := app.New(cfg)
	if err != nil {
		slog.Error("App 부트스트랩 실패", "error", err)
		os.Exit(1)
	}

	// D-059: 외부 단방향 동기화 cron worker (1시간 ticker, enabled+hourly 시트만).
	// 동일 핸들러 인스턴스를 router 가 또 하나 생성하지만 sync.Once 가 다중 시작을 막는다.
	handler.NewExternalSyncHandler(a.DB).StartHourlyWorker()

	// Prometheus 메트릭 라우터 — 127.0.0.1:9180/metrics. 외부 노출은 cloudflared ingress 에서
	// 의도적으로 차단(api.topworks.ltd 는 8080 만 매핑). 본 listener 는 로컬 Prometheus 에이전트 전용.
	// serve.Run 의 두 번째 listener 로 등록하여 tableflip 이 fd 인계까지 처리하도록 한다 (D-123).
	metricsRouter := chi.NewRouter()
	metricsRouter.Handle("/metrics", promhttp.Handler())

	mainAddr := "0.0.0.0:" + cfg.Port
	if err := serve.Run(
		serve.Server{Name: "main", Addr: mainAddr, Handler: router.New(a)},
		serve.Server{Name: "metrics", Addr: "127.0.0.1:9180", Handler: metricsRouter},
	); err != nil {
		slog.Error("서버 비정상 종료", "error", err)
		os.Exit(1)
	}
}
