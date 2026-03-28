package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/middleware"

	supa "github.com/supabase-community/supabase-go"
)

func New(db *supa.Client) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.CORS)

	// 비유: /health는 건물 밖에서도 볼 수 있는 안내판 — 인증 불필요
	r.Get("/health", handler.HealthCheck)

	r.Route("/api/v1", func(r chi.Router) {
		// 비유: /api/v1 이하 모든 경로는 사원증(JWT) 필수
		r.Use(middleware.AuthMiddleware(db))

		companyH := handler.NewCompanyHandler(db)
		r.Route("/companies", func(r chi.Router) {
			r.Get("/", companyH.List)
			r.Post("/", companyH.Create)
			r.Get("/{id}", companyH.GetByID)
			r.Put("/{id}", companyH.Update)
			r.Patch("/{id}/status", companyH.ToggleStatus)
		})

		mfgH := handler.NewManufacturerHandler(db)
		r.Route("/manufacturers", func(r chi.Router) {
			r.Get("/", mfgH.List)
			r.Post("/", mfgH.Create)
			r.Get("/{id}", mfgH.GetByID)
			r.Put("/{id}", mfgH.Update)
		})

		productH := handler.NewProductHandler(db)
		r.Route("/products", func(r chi.Router) {
			r.Get("/", productH.List)
			r.Post("/", productH.Create)
			r.Get("/{id}", productH.GetByID)
			r.Put("/{id}", productH.Update)
		})

		partnerH := handler.NewPartnerHandler(db)
		r.Route("/partners", func(r chi.Router) {
			r.Get("/", partnerH.List)
			r.Post("/", partnerH.Create)
			r.Get("/{id}", partnerH.GetByID)
			r.Put("/{id}", partnerH.Update)
		})

		warehouseH := handler.NewWarehouseHandler(db)
		r.Route("/warehouses", func(r chi.Router) {
			r.Get("/", warehouseH.List)
			r.Post("/", warehouseH.Create)
			r.Get("/{id}", warehouseH.GetByID)
			r.Put("/{id}", warehouseH.Update)
		})

		bankH := handler.NewBankHandler(db)
		r.Route("/banks", func(r chi.Router) {
			r.Get("/", bankH.List)
			r.Post("/", bankH.Create)
			r.Get("/{id}", bankH.GetByID)
			r.Put("/{id}", bankH.Update)
		})

		poH := handler.NewPOHandler(db)
		poLineH := handler.NewPOLineHandler(db)
		r.Route("/pos", func(r chi.Router) {
			r.Get("/", poH.List)
			r.Post("/", poH.Create)
			r.Get("/{id}", poH.GetByID)
			r.Put("/{id}", poH.Update)
			r.Route("/{poId}/lines", func(r chi.Router) {
				r.Get("/", poLineH.ListByPO)
				r.Post("/", poLineH.Create)
				r.Put("/{id}", poLineH.Update)
				r.Delete("/{id}", poLineH.Delete)
			})
		})

		lcH := handler.NewLCHandler(db)
		r.Route("/lcs", func(r chi.Router) {
			r.Get("/", lcH.List)
			r.Post("/", lcH.Create)
			r.Get("/{id}", lcH.GetByID)
			r.Put("/{id}", lcH.Update)
		})

		ttH := handler.NewTTHandler(db)
		r.Route("/tts", func(r chi.Router) {
			r.Get("/", ttH.List)
			r.Post("/", ttH.Create)
			r.Get("/{id}", ttH.GetByID)
			r.Put("/{id}", ttH.Update)
		})

		blH := handler.NewBLHandler(db)
		blLineH := handler.NewBLLineHandler(db)
		r.Route("/bls", func(r chi.Router) {
			r.Get("/", blH.List)
			r.Post("/", blH.Create)
			r.Get("/{id}", blH.GetByID)
			r.Put("/{id}", blH.Update)
			r.Route("/{blId}/lines", func(r chi.Router) {
				r.Get("/", blLineH.ListByBL)
				r.Post("/", blLineH.Create)
				r.Put("/{id}", blLineH.Update)
				r.Delete("/{id}", blLineH.Delete)
			})
		})
	})

	return r
}
