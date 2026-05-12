// Package router — chi 라우터 구성 (D-20260512-090000).
//
// 핸들러는 자기 init() 에서 mount.Register(...) 로 라우트 트리 + FeatureID + Auth 그룹을
// 한 곳에 선언한다 (D-RegisterRoutes/D-110 의 핸들러-자기소유 정신 유지).
// 본 파일은 그 레지스트리를 3개 그룹 (root / public API / authed) 에 마운트하고, CalcProxy
// 의 조건부(HasEngine) 별도 인증 트리를 d.AuthMW 로 mount.Deps 에 흘려준다.
package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"solarflow-backend/internal/app"
	// handler 패키지의 init() 사이드이펙트(mount.Register 호출) 만 필요 — blank import.
	_ "solarflow-backend/internal/handler"
	_ "solarflow-backend/internal/domains/baro"
	_ "solarflow-backend/internal/domains/bl"
	_ "solarflow-backend/internal/domains/cost_detail"
	_ "solarflow-backend/internal/domains/declaration"
	_ "solarflow-backend/internal/domains/intercompany"
	_ "solarflow-backend/internal/domains/inventory"
	_ "solarflow-backend/internal/domains/lc"
	_ "solarflow-backend/internal/domains/order"
	_ "solarflow-backend/internal/domains/outbound"
	_ "solarflow-backend/internal/domains/po"
	_ "solarflow-backend/internal/domains/product"
	_ "solarflow-backend/internal/domains/sale"
	_ "solarflow-backend/internal/domains/tt"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/mount"
)

// New — App 의존성 컨테이너를 받아 chi.Mux를 구성한다.
// 운영용 진입점. AuthMiddleware는 Supabase JWKS 검증 + user_profiles 조회로 채워진다.
func New(a *app.App) http.Handler {
	return NewWithAuth(a, middleware.AuthMiddleware(a.DB))
}

// NewWithAuth — auth 미들웨어를 외부에서 주입할 수 있는 변형.
// 가드 매트릭스 테스트(router_test.go)에서 X-Test-Tenant/X-Test-Role 헤더로 컨텍스트를
// 직접 주입하는 stub auth를 사용하기 위해 분리. 운영 코드에서는 New(a)를 쓴다.
func NewWithAuth(a *app.App, authMW func(http.Handler) http.Handler) http.Handler {
	r := chi.NewRouter()
	// gzip 압축 — 가장 바깥(첫 Use)에 두어 RequestLog 의 statusCapturer 가 raw 바이트로
	// body_sha 를 계산하도록 한다. D-122 traffic replay diff 의 응답 동등성 비교 호환성 유지.
	// 기본 content-type 화이트리스트(application/json, text/* 등)에만 적용되므로
	// SSE(text/event-stream) 와 첨부 다운로드는 자동 제외.
	r.Use(chimw.Compress(5))
	r.Use(middleware.RequestLog)
	r.Use(middleware.Metrics)
	r.Use(middleware.CORSMiddleware)

	deps := buildMountDeps(a, authMW)

	// 1) AuthRoot — 라우터 루트에 직접 마운트 (인증·게이트 없음 또는 자체 토큰/authMW).
	//    /health, /api/v1/attachments/{id}/file (서명 토큰), /api/v1/baro/driver/{token} (PWA),
	//    CalcProxy /api/v1/calc/*, /api/v1/engine/* (조건부 + 자체 authMW).
	mount.MountRoot(deps, r)

	// 2) AuthPublicAPI — /api/v1/public/* 인증 미적용 그룹.
	r.Route("/api/v1/public", func(r chi.Router) {
		mount.MountPublicAPI(deps, r)
	})

	// 3) AuthAuthed — /api/v1/* 인증 + StudyTenantFence 그룹. 대부분의 라우트가 여기.
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(authMW)
		r.Use(middleware.StudyTenantFence)
		mount.MountAuthed(deps, r)
	})

	return r
}

// buildMountDeps — app.App + authMW 를 mount.Deps 로 옮긴다.
// app 이 mount.Deps 인터페이스를 구현하지 않고 plain struct 매핑을 쓰는 이유는
// internal/mount/mount.go 의 패키지 주석 참조.
// authMW 는 Phase 7 추가 — AuthRoot 그룹에서 자기 인증 트리를 별도로 묶는 CalcProxy 가 사용.
func buildMountDeps(a *app.App, authMW func(http.Handler) http.Handler) *mount.Deps {
	return &mount.Deps{
		DB:          a.DB,
		Engine:      a.Eng,
		OCR:         a.OCR,
		Pool:        a.Pool,
		WiringStore: a.WiringStore,
		Resolver:    a.Gates.FeatureGate.Resolver(),
		Gates:       a.Gates,
		AuthMW:      authMW,
	}
}
