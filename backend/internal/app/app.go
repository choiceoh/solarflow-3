// Package app — 백엔드 의존성 단일 컨테이너 (D-RegisterRoutes)
// main.go가 cfg만 들고 New로 부트스트랩하면, 라우터/핸들러가 필요한 의존성을 여기서 가져간다.
package app

import (
	"log"
	"os"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/config"
	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/ocr"
)

// App — 단일 의존성 컨테이너. nil 가능 의존성은 Eng 하나만이며 HasEngine으로 분기한다.
type App struct {
	DB    *supa.Client
	Eng   *engine.EngineClient // nil 허용 — Rust 엔진 미사용 환경
	OCR   *ocr.Client
	Cfg   *config.Config
	Gates middleware.Gates
}

// New — App 부트스트랩. cfg를 받아 Supabase·Rust 엔진·OCR·Gates를 모두 초기화한다.
// engine 헬스체크 실패는 경고만 — App은 정상 반환 (현행 main.go 동작 보존).
func New(cfg *config.Config) (*App, error) {
	db, err := supa.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, &supa.ClientOptions{})
	if err != nil {
		return nil, err
	}
	log.Println("✅ Supabase 연결 성공")

	var eng *engine.EngineClient
	if engineURL := os.Getenv("ENGINE_URL"); engineURL != "" {
		eng = engine.NewEngineClient(engineURL)
		if _, herr := eng.CheckHealth(); herr != nil {
			log.Printf("⚠️  경고: Rust 엔진 연결 실패 — 계산 기능 비활성 (%v)", herr)
		} else {
			log.Println("✅ Rust 엔진 연결 성공")
		}
	} else {
		log.Println("ℹ️  ENGINE_URL 미설정 — Rust 엔진 미사용")
	}

	return &App{
		DB:    db,
		Eng:   eng,
		OCR:   ocr.NewFromEnv(),
		Cfg:   cfg,
		Gates: middleware.NewGates(),
	}, nil
}

// HasEngine — Rust 계산 엔진 사용 가능 여부 (calc/engine 라우트 mount 분기에 사용)
func (a *App) HasEngine() bool { return a.Eng != nil }
