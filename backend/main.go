// SolarFlow 3.0 백엔드 진입점.
// 모든 의존성 부트스트랩은 internal/app.New로 위임 — main은 cfg 로드와 ListenAndServe만.
package main

import (
	"log"
	"log/slog"
	"net/http"
	"os"

	"solarflow-backend/internal/app"
	"solarflow-backend/internal/config"
	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/logger"
	"solarflow-backend/internal/router"
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

	addr := "0.0.0.0:" + cfg.Port
	slog.Info("SolarFlow 3.0 서버 시작", "addr", addr)
	if err := http.ListenAndServe(addr, router.New(a)); err != nil {
		log.Fatal(err)
	}
}
