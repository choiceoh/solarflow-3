package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/middleware"

	supa "github.com/supabase-community/supabase-go"
)

// New는 전체 라우터를 생성하고 모든 경로를 등록
// 비유: 건물 안내판 — 어떤 요청이 어느 방으로 가는지 정해줌
func New(db *supa.Client) http.Handler {
	r := chi.NewRouter()

	// ── 미들웨어 (현관 보안 게이트) ──
	r.Use(middleware.CORS)

	// ── 헬스체크 ──
	r.Get("/health", handler.HealthCheck)

	// ── API v1 ──
	r.Route("/api/v1", func(r chi.Router) {

		// 법인 관리
		companyH := handler.NewCompanyHandler(db)
		r.Route("/companies", func(r chi.Router) {
			r.Get("/", companyH.List)             // GET    /api/v1/companies
			r.Post("/", companyH.Create)           // POST   /api/v1/companies
			r.Get("/{id}", companyH.GetByID)       // GET    /api/v1/companies/{id}
			r.Put("/{id}", companyH.Update)        // PUT    /api/v1/companies/{id}
			r.Patch("/{id}/status", companyH.ToggleStatus) // PATCH  /api/v1/companies/{id}/status
		})

		// 제조사 관리
		mfgH := handler.NewManufacturerHandler(db)
		r.Route("/manufacturers", func(r chi.Router) {
			r.Get("/", mfgH.List)
			r.Post("/", mfgH.Create)
			r.Get("/{id}", mfgH.GetByID)
			r.Put("/{id}", mfgH.Update)
		})

		// TODO: Step 3에서 추가
		// r.Route("/products", ...)
		// r.Route("/partners", ...)
		// r.Route("/warehouses", ...)
		// r.Route("/banks", ...)
	})

	return r
}
