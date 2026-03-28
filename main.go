package main

import (
	"log"
	"net/http"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/config"
	"solarflow-backend/internal/router"
)

func main() {
	// 설정 로드
	cfg := config.Load()

	// Supabase 연결
	db, err := supa.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, &supa.ClientOptions{})
	if err != nil {
		log.Fatalf("❌ Supabase 연결 실패: %v", err)
	}
	log.Println("✅ Supabase 연결 성공")

	// 라우터 생성 (모든 API 경로가 여기서 등록됨)
	r := router.New(db)

	// 서버 시작
	log.Printf("🚀 서버 시작: :%s", cfg.Port)
	log.Printf("📋 API 목록:")
	log.Printf("   GET  /health")
	log.Printf("   GET  /api/v1/companies")
	log.Printf("   POST /api/v1/companies")
	log.Printf("   GET  /api/v1/companies/{id}")
	log.Printf("   PUT  /api/v1/companies/{id}")
	log.Printf("   GET  /api/v1/manufacturers")
	log.Printf("   POST /api/v1/manufacturers")

	log.Fatal(http.ListenAndServe(":"+cfg.Port, r))
}
