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
	// SupabaseKey — supa.Client 가 PostgREST 호출 시 사용하는 API key.
	// SUPABASE_SERVICE_ROLE_KEY 가 설정돼 있으면 그 값(RLS 우회), 없으면 SUPABASE_KEY(anon).
	// admin/배선 토글처럼 RLS 정책 없이 server-side 에서 직접 쓰는 테이블 때문에
	// 운영에서는 service_role 이 필요하다 (D-070 RoleMiddleware 가 admin 게이트).
	SupabaseKey string
	// SupabaseAnonKey — Supabase Auth password grant 등 anon 으로 호출해야 하는 경로용.
	// verifyCurrentPassword 같은 곳이 직접 os.Getenv 로 읽지만 호환을 위해 보존.
	SupabaseAnonKey string
}

// Load는 환경변수에서 설정을 읽어옴
func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	anonKey := os.Getenv("SUPABASE_KEY")
	serviceKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	supabaseKey := serviceKey
	if supabaseKey == "" {
		supabaseKey = anonKey
		if supabaseKey != "" {
			log.Println("⚠️  SUPABASE_SERVICE_ROLE_KEY 미설정 — anon key 로 동작 (RLS 정책 없는 테이블 쓰기 차단)")
		}
	}

	if supabaseURL == "" || supabaseKey == "" {
		log.Println("⚠️  SUPABASE_URL 또는 SUPABASE_KEY/SERVICE_ROLE_KEY 가 설정되지 않았습니다")
	}

	return &Config{
		Port:            port,
		SupabaseURL:     supabaseURL,
		SupabaseKey:     supabaseKey,
		SupabaseAnonKey: anonKey,
	}
}
