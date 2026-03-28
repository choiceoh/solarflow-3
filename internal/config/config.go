package config

import (
	"log"
	"os"
)

// Config는 앱 전체 설정을 담는 구조체
// 비유: 건물의 관리사무소 — 모든 설정 정보가 여기에
type Config struct {
	Port        string
	SupabaseURL string
	SupabaseKey string
}

// Load는 환경변수에서 설정을 읽어옴
func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	supabaseKey := os.Getenv("SUPABASE_KEY")

	if supabaseURL == "" || supabaseKey == "" {
		log.Println("⚠️  SUPABASE_URL 또는 SUPABASE_KEY가 설정되지 않았습니다")
	}

	return &Config{
		Port:        port,
		SupabaseURL: supabaseURL,
		SupabaseKey: supabaseKey,
	}
}
