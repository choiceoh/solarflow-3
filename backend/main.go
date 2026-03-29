package main

import (
	"log"
	"net/http"
	"os"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/config"
	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/router"
)

func main() {
	cfg := config.Load()

	db, err := supa.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, &supa.ClientOptions{})
	if err != nil {
		log.Fatalf("❌ Supabase 연결 실패: %v", err)
	}
	log.Println("✅ Supabase 연결 성공")

	// 비유: Rust 계산실과의 연락선 확인 — 없어도 Go 서버는 정상 시작
	engineURL := os.Getenv("ENGINE_URL")
	if engineURL != "" {
		ec := engine.NewEngineClient(engineURL)
		_, err := ec.CheckHealth()
		if err != nil {
			log.Printf("⚠️  경고: Rust 엔진 연결 실패 — 계산 기능 비활성 (%v)", err)
		} else {
			log.Println("✅ Rust 엔진 연결 성공")
		}
	} else {
		log.Println("ℹ️  ENGINE_URL 미설정 — Rust 엔진 미사용")
	}

	r := router.New(db)

	log.Printf("🚀 SolarFlow 3.0 서버 시작: :%s", cfg.Port)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}
