// Package app — 백엔드 의존성 단일 컨테이너 (D-RegisterRoutes)
// main.go가 cfg만 들고 New로 부트스트랩하면, 라우터/핸들러가 필요한 의존성을 여기서 가져간다.
package app

import (
	"context"
	"log"
	"os"

	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/config"
	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/feature"
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
	// WiringStore — D-120 feature override 영속화 (PR-9). 운영에서는 SupabaseWiringStore.
	// nil 이면 PUT 핸들러가 503 으로 막힘.
	WiringStore feature.WiringStore
}

// New — App 부트스트랩. cfg를 받아 Supabase·Rust 엔진·OCR·Gates를 모두 초기화한다.
// engine 헬스체크 실패는 경고만 — App은 정상 반환 (현행 main.go 동작 보존).
func New(cfg *config.Config) (*App, error) {
	db, err := supa.NewClient(cfg.SupabaseURL, cfg.SupabaseKey, &supa.ClientOptions{})
	if err != nil {
		return nil, err
	}
	if cfg.SupabaseAnonKey != "" && cfg.SupabaseKey != cfg.SupabaseAnonKey {
		log.Println("✅ Supabase 연결 성공 (service_role)")
	} else {
		log.Println("✅ Supabase 연결 성공 (anon — RLS 적용)")
	}

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

	// PR-9: WiringStore (PR-5b 의 인라인 DB 호출을 인터페이스 뒤로) 인스턴스 생성.
	wiringStore := feature.NewSupabaseWiringStore(db)

	// PR-5b/9: tenant_features 테이블에서 (tenant, feature_id) override 를 startup 에 한 번 로드.
	// 실패해도 catalog default 로 동작 — 운영 정지 막음.
	resolver := feature.NewResolver(nil)
	if loaded, err := loadFeatureOverrides(wiringStore, resolver); err != nil {
		log.Printf("⚠️  tenant_features override 로딩 실패 — catalog default 만 사용: %v", err)
	} else if loaded > 0 {
		log.Printf("✅ tenant_features override %d건 로드", loaded)
	}

	return &App{
		DB:          db,
		Eng:         eng,
		OCR:         ocr.NewFromEnv(),
		Cfg:         cfg,
		Gates:       middleware.NewGatesWithResolver(resolver),
		WiringStore: wiringStore,
	}, nil
}

// loadFeatureOverrides — Store 가 들고 있는 tenant_features 행을 resolver 에 일괄 적용.
//
// PR-5b: admin 이 매트릭스 화면에서 토글한 override 가 재시작 후에도 유지되도록.
// PR-9 : DB 호출 자체를 WiringStore 뒤로 옮겨 단위 테스트 가능하게.
func loadFeatureOverrides(store feature.WiringStore, resolver *feature.Resolver) (int, error) {
	if store == nil {
		return 0, nil
	}
	rows, err := store.LoadOverrides(context.Background())
	if err != nil {
		return 0, err
	}
	for _, row := range rows {
		resolver.SetOverride(row.Tenant, row.FeatureID, row.Enabled)
	}
	return len(rows), nil
}

// HasEngine — Rust 계산 엔진 사용 가능 여부 (calc/engine 라우트 mount 분기에 사용)
func (a *App) HasEngine() bool { return a.Eng != nil }
