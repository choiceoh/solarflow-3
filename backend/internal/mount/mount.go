// Package mount — feature-self-mounting 라우트 레지스트리 (D-20260512-090000).
//
// 동기: D-RegisterRoutes 빅뱅(D-110) 은 핸들러가 자기 라우트를 소유한다는 원칙은
// 유지하되, 그 RegisterRoutes 메서드를 internal/handler/routes.go 단일 파일에
// 알파벳 순으로 한 번 더 모아 두고, internal/router/router.go 가 다시 알파벳 순으로
// New + RegisterRoutes 호출을 늘어놓는 *3-way 중앙 집계* 형태였다.
//
// 본 패키지는 그 중앙 집계를 없앤다. 각 핸들러 파일이 자기 init() 에서
//   mount.Register(mount.Spec{ID: feature.IDXxx, Mount: func(d *mount.Deps, r chi.Router){...}})
// 한 줄로 자기 라우트를 등록하고, router.New 는 mount.MountAuthed/MountPublic 헬퍼로
// 한 번에 walk 한다. 신규 도메인 추가 시 핸들러 파일 1개로 끝 — routes.go·router.go
// 동시 수정 강제 사라짐.
//
// Deps 는 *interface 가 아닌 plain struct* 다. interface 라면 app 패키지가
// 메서드 이름과 필드 이름이 충돌하지 않도록 receiver 이름을 발명해야 하고, 그
// 발명한 이름이 코드 전반에 새 어휘를 들이게 된다. struct + 명시적 매핑이
// 라이트하다.
//
// init() 등록 순서: Go 패키지 초기화 순서가 결정한다. router 가 handler 를
// import 하면 handler 패키지 전체의 init() 가 router.New 실행 전에 끝나 있다.
// 즉 mount.All() 호출 시점에 모든 Spec 이 등록돼 있음이 보장된다.
package mount

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	supa "github.com/supabase-community/supabase-go"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/feature"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/ocr"
)

// AuthMode — Spec 이 마운트될 라우트 그룹 선택.
type AuthMode int

const (
	// AuthAuthed — /api/v1/* (auth + StudyTenantFence). 대부분의 라우트.
	AuthAuthed AuthMode = iota
	// AuthPublicAPI — /api/v1/public/* (인증 미적용 그룹). FXSpot/login-stats/SCFI 등.
	AuthPublicAPI
	// AuthRoot — 라우터 루트에 직접 마운트 (그룹 prefix 없음).
	// 예: /health, /api/v1/attachments/{id}/file (토큰 가드), /api/v1/baro/driver/{token}.
	AuthRoot
)

// Deps — 핸들러 init() 가 등록한 Mount 함수가 받는 의존성 묶음.
// app.App 의 필드를 1:1 로 옮겨 담는다 (router.New 에서 채움).
type Deps struct {
	DB          *supa.Client
	Engine      *engine.EngineClient // nil 허용 — HasEngine() 으로 분기
	OCR         *ocr.Client
	Pool        *pgxpool.Pool // nil 허용 — AI 첨부 시트 동적 jsonb 쿼리 전용 pgx 풀
	WiringStore feature.WiringStore
	Resolver    *feature.Resolver
	Gates       middleware.Gates
	// AuthMW — 인증 미들웨어. AuthRoot 그룹에서 자기 인증 트리를 별도로 묶어야 하는 핸들러
	// (대표 사례: CalcProxy — /api/v1/calc, /api/v1/engine 가 main /api/v1 그룹과 별도로
	// authMW 만 적용되고 StudyTenantFence 는 제외) 가 사용한다.
	// AuthAuthed/AuthPublicAPI 그룹은 router 가 그룹 자체에 미들웨어를 걸어주므로 사용 불필요.
	AuthMW func(http.Handler) http.Handler
	// BaroCompany — BARO 토큰일 때 강제 격리할 BR 법인 ID 룩업기 (D-108 격리 강화).
	// outbound/sale/receipt 등 ERP 공통 핸들러가 GetTenantScope==baro 일 때 company_id 쿼리를
	// 무시하고 이 ID 로 강제 필터링한다. nil 가능 — 호출 측에서 nil 검사.
	BaroCompany *middleware.BaroCompanyResolver
}

// HasEngine — Rust 엔진 사용 가능 여부 (CalcProxy 등 conditional 마운트용).
func (d *Deps) HasEngine() bool { return d != nil && d.Engine != nil }

// MountFn — 핸들러가 자기 라우트를 chi.Router 에 등록하는 함수.
// Spec.Auth 가 결정한 그룹 안에서 호출된다 (이미 r.Use(authMW) 가 적용된 상태).
type MountFn func(d *Deps, r chi.Router)

// Spec — 한 핸들러 (혹은 한 라우트 트리) 의 자기소개.
//
// ID 는 feature 카탈로그 ID. 비어 있으면 feature gate 미적용 라우트
// (예: /health, /api/v1/public/* 그룹). feature_coverage_test 가
// (a) ID 있는 Spec 의 라우트는 catalog.Paths 와 일치 (b) ID 비어있는 라우트는
// unrestrictedAllowlist 에 있을 것을 강제하므로 본 패키지는 ID 자체를 검증하지 않는다.
//
// Mount 가 nil 이면 Register 가 panic — 등록 시점 실수 즉시 발견.
type Spec struct {
	ID    feature.FeatureID
	Auth  AuthMode
	Mount MountFn
}

var registry []Spec

// Register — 핸들러 init() 에서 호출. ID 가 비어있지 않은 경우 중복 등록은 panic.
// (비어있는 ID 는 여러 Spec 이 가질 수 있다 — 무가드 라우트가 여럿일 수 있으므로.)
func Register(s Spec) {
	if s.Mount == nil {
		panic(fmt.Sprintf("mount.Register: Mount is nil (ID=%q)", s.ID))
	}
	if s.ID != "" {
		for _, ex := range registry {
			if ex.ID == s.ID {
				panic(fmt.Sprintf("mount.Register: duplicate FeatureID %q", s.ID))
			}
		}
	}
	registry = append(registry, s)
}

// All — 등록된 Spec 의 복사본 (테스트·진단용).
func All() []Spec {
	out := make([]Spec, len(registry))
	copy(out, registry)
	return out
}

// Reset — 테스트 격리 전용. 운영 코드에서 호출 금지.
func Reset() { registry = nil }

// MountAuthed — AuthAuthed 그룹에 등록된 모든 Spec 을 chi.Router 에 마운트.
// router.New 의 r.Route("/api/v1", ...) 블록 안에서 호출한다.
func MountAuthed(d *Deps, r chi.Router) { mountGroup(d, r, AuthAuthed) }

// MountPublicAPI — AuthPublicAPI 그룹 (/api/v1/public/*) 마운트.
func MountPublicAPI(d *Deps, r chi.Router) { mountGroup(d, r, AuthPublicAPI) }

// MountRoot — AuthRoot 그룹 (라우터 루트) 마운트.
func MountRoot(d *Deps, r chi.Router) { mountGroup(d, r, AuthRoot) }

func mountGroup(d *Deps, r chi.Router, mode AuthMode) {
	for _, s := range registry {
		if s.Auth == mode {
			s.Mount(d, r)
		}
	}
}
