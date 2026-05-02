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
	addr := "0.0.0.0:" + cfg.Port
	slog.Info("SolarFlow 3.0 서버 시작", "addr", addr)
	if err := http.ListenAndServe(addr, router.New(a)); err != nil {
		log.Fatal(err)
	}
}
