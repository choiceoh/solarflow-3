// SolarFlow 3.0 백엔드 진입점.
// 모든 의존성 부트스트랩은 internal/app.New로 위임 — main은 cfg 로드와 ListenAndServe만.
package main

import (
	"log"
	"net/http"

	"solarflow-backend/internal/app"
	"solarflow-backend/internal/config"
	"solarflow-backend/internal/router"
)

func main() {
	cfg := config.Load()
	a, err := app.New(cfg)
	if err != nil {
		log.Fatalf("❌ App 부트스트랩 실패: %v", err)
	}
	addr := "0.0.0.0:" + cfg.Port
	log.Printf("🚀 SolarFlow 3.0 서버 시작: %s", addr)
	log.Fatal(http.ListenAndServe(addr, router.New(a)))
}
