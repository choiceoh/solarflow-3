package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/middleware"

	supa "github.com/supabase-community/supabase-go"
)

// New — 라우터 생성 (engineClient는 nil 가능 — Rust 미사용 시)
func New(db *supa.Client, engineClient ...*engine.EngineClient) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.CORSMiddleware)

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
			r.Delete("/{id}", companyH.Delete)
		})

		mfgH := handler.NewManufacturerHandler(db)
		r.Route("/manufacturers", func(r chi.Router) {
			r.Get("/", mfgH.List)
			r.Post("/", mfgH.Create)
			r.Get("/{id}", mfgH.GetByID)
			r.Put("/{id}", mfgH.Update)
			r.Patch("/{id}/status", mfgH.ToggleStatus)
			r.Delete("/{id}", mfgH.Delete)
		})

		productH := handler.NewProductHandler(db)
		r.Route("/products", func(r chi.Router) {
			r.Get("/", productH.List)
			r.Post("/", productH.Create)
			r.Get("/{id}", productH.GetByID)
			r.Put("/{id}", productH.Update)
			r.Patch("/{id}/status", productH.ToggleStatus)
			r.Delete("/{id}", productH.Delete)
		})

		partnerH := handler.NewPartnerHandler(db)
		r.Route("/partners", func(r chi.Router) {
			r.Get("/", partnerH.List)
			r.Post("/", partnerH.Create)
			r.Get("/{id}", partnerH.GetByID)
			r.Put("/{id}", partnerH.Update)
			r.Patch("/{id}/status", partnerH.ToggleStatus)
			r.Delete("/{id}", partnerH.Delete)
		})

		warehouseH := handler.NewWarehouseHandler(db)
		r.Route("/warehouses", func(r chi.Router) {
			r.Get("/", warehouseH.List)
			r.Post("/", warehouseH.Create)
			r.Get("/{id}", warehouseH.GetByID)
			r.Put("/{id}", warehouseH.Update)
			r.Patch("/{id}/status", warehouseH.ToggleStatus)
			r.Delete("/{id}", warehouseH.Delete)
		})

		bankH := handler.NewBankHandler(db)
		r.Route("/banks", func(r chi.Router) {
			r.Get("/", bankH.List)
			r.Post("/", bankH.Create)
			r.Get("/{id}", bankH.GetByID)
			r.Put("/{id}", bankH.Update)
			r.Patch("/{id}/status", bankH.ToggleStatus)
			r.Delete("/{id}", bankH.Delete)
		})

		poH := handler.NewPOHandler(db)
		poLineH := handler.NewPOLineHandler(db)
		r.Route("/pos", func(r chi.Router) {
			r.Get("/", poH.List)
			r.Post("/", poH.Create)
			r.Get("/{id}", poH.GetByID)
			r.Put("/{id}", poH.Update)
			r.Delete("/{id}", poH.Delete)
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
			r.Get("/{id}/lines", lcH.ListLines)
			r.Get("/{id}", lcH.GetByID)
			r.Put("/{id}", lcH.Update)
			r.Delete("/{id}", lcH.Delete)
		})

		ttH := handler.NewTTHandler(db)
		r.Route("/tts", func(r chi.Router) {
			r.Get("/", ttH.List)
			r.Post("/", ttH.Create)
			r.Get("/{id}", ttH.GetByID)
			r.Put("/{id}", ttH.Update)
			r.Delete("/{id}", ttH.Delete)
		})

		blH := handler.NewBLHandler(db)
		blLineH := handler.NewBLLineHandler(db)
		r.Route("/bls", func(r chi.Router) {
			r.Get("/", blH.List)
			r.Post("/", blH.Create)
			r.Get("/{id}", blH.GetByID)
			r.Put("/{id}", blH.Update)
			r.Delete("/{id}", blH.Delete)
			r.Route("/{blId}/lines", func(r chi.Router) {
				r.Get("/", blLineH.ListByBL)
				r.Post("/", blLineH.Create)
				r.Put("/{id}", blLineH.Update)
				r.Delete("/{id}", blLineH.Delete)
			})
		})

		declH := handler.NewDeclarationHandler(db)
		r.Route("/declarations", func(r chi.Router) {
			r.Get("/", declH.List)
			r.Post("/", declH.Create)
			r.Get("/{id}", declH.GetByID)
			r.Put("/{id}", declH.Update)
			r.Delete("/{id}", declH.Delete)
		})

		costH := handler.NewCostDetailHandler(db)
		r.Route("/cost-details", func(r chi.Router) {
			r.Get("/", costH.List)
			r.Post("/", costH.Create)
			r.Get("/{id}", costH.GetByID)
			r.Put("/{id}", costH.Update)
			r.Delete("/{id}", costH.Delete)
		})

		expenseH := handler.NewExpenseHandler(db)
		r.Route("/expenses", func(r chi.Router) {
			r.Get("/", expenseH.List)
			r.Post("/", expenseH.Create)
			r.Get("/{id}", expenseH.GetByID)
			r.Put("/{id}", expenseH.Update)
			r.Delete("/{id}", expenseH.Delete)
		})

		orderH := handler.NewOrderHandler(db)
		r.Route("/orders", func(r chi.Router) {
			r.Get("/", orderH.List)
			r.Post("/", orderH.Create)
			r.Get("/{id}", orderH.GetByID)
			r.Put("/{id}", orderH.Update)
			r.Delete("/{id}", orderH.Delete)
		})

		receiptH := handler.NewReceiptHandler(db)
		r.Route("/receipts", func(r chi.Router) {
			r.Get("/", receiptH.List)
			r.Post("/", receiptH.Create)
			r.Get("/{id}", receiptH.GetByID)
			r.Put("/{id}", receiptH.Update)
			r.Delete("/{id}", receiptH.Delete)
		})

		matchH := handler.NewReceiptMatchHandler(db)
		r.Route("/receipt-matches", func(r chi.Router) {
			r.Get("/", matchH.List)
			r.Post("/", matchH.Create)
			r.Delete("/{id}", matchH.Delete)
		})

		outboundH := handler.NewOutboundHandler(db)
		r.Route("/outbounds", func(r chi.Router) {
			r.Get("/", outboundH.List)
			r.Post("/", outboundH.Create)
			r.Get("/{id}", outboundH.GetByID)
			r.Put("/{id}", outboundH.Update)
			r.Delete("/{id}", outboundH.Delete)
		})

		// 공사 현장 마스터 (자체/EPC 현장 + 공급 이력)
		siteH := handler.NewConstructionSiteHandler(db)
		r.Route("/construction-sites", func(r chi.Router) {
			r.Get("/", siteH.List)
			r.Post("/", siteH.Create)
			r.Get("/{id}", siteH.GetByID)
			r.Put("/{id}", siteH.Update)
			r.Patch("/{id}/status", siteH.ToggleActive)
			r.Delete("/{id}", siteH.Delete)
		})

		// 운영 forecast — 자체 공사/보정 수요 계획
		demandH := handler.NewModuleDemandForecastHandler(db)
		r.Route("/module-demand-forecasts", func(r chi.Router) {
			r.Get("/", demandH.List)
			r.Post("/", demandH.Create)
			r.Put("/{id}", demandH.Update)
			r.Delete("/{id}", demandH.Delete)
		})

		// 가용재고 배정 (판매예정/공사예정)
		allocH := handler.NewInventoryAllocationHandler(db)
		r.Route("/inventory/allocations", func(r chi.Router) {
			r.Get("/", allocH.List)
			r.Post("/", allocH.Create)
			r.Get("/{id}", allocH.GetByID)
			r.Put("/{id}", allocH.Update)
			r.Delete("/{id}", allocH.Delete)
		})

		saleH := handler.NewSaleHandler(db)
		r.Route("/sales", func(r chi.Router) {
			r.Get("/", saleH.List)
			r.Post("/", saleH.Create)
			r.Get("/{id}", saleH.GetByID)
			r.Put("/{id}", saleH.Update)
		})

		limitH := handler.NewLimitChangeHandler(db)
		r.Route("/limit-changes", func(r chi.Router) {
			r.Get("/", limitH.List)
			r.Post("/", limitH.Create)
		})

		priceH := handler.NewPriceHistoryHandler(db)
		r.Route("/price-histories", func(r chi.Router) {
			r.Get("/", priceH.List)
			r.Post("/", priceH.Create)
			r.Get("/{id}", priceH.GetByID)
			r.Put("/{id}", priceH.Update)
		})

		// 비유: 포스트잇 메모 관리 (Step 31)
		noteH := handler.NewNoteHandler(db)
		r.Route("/notes", func(r chi.Router) {
			r.Get("/", noteH.List)
			r.Post("/", noteH.Create)
			r.Put("/{id}", noteH.Update)
			r.Delete("/{id}", noteH.Delete)
		})

		// 비유: 업무 서류함 — LC 전문 PDF 등 첨부파일 보관
		attachmentH := handler.NewAttachmentHandler(db)
		r.Route("/attachments", func(r chi.Router) {
			r.Get("/", attachmentH.List)
			r.Post("/", attachmentH.Create)
			r.Get("/{id}/download", attachmentH.Download)
			r.Delete("/{id}", attachmentH.Delete)
		})

		// 비유: 아마란스10 ERP 내보내기 — 입고/출고 .xlsx (Step 29C)
		exportH := handler.NewExportHandler(db)
		r.Route("/export/amaranth", func(r chi.Router) {
			r.Get("/inbound", exportH.AmaranthInbound)
			r.Get("/outbound", exportH.AmaranthOutbound)
		})

		// 비유: 엑셀 일괄 등록 창구 — 7종 Import API (Step 29B)
		importH := handler.NewImportHandler(db)
		r.Route("/import", func(r chi.Router) {
			r.Post("/inbound", importH.Inbound)
			r.Post("/outbound", importH.Outbound)
			r.Post("/sales", importH.Sales)
			r.Post("/declarations", importH.Declarations)
			r.Post("/expenses", importH.Expenses)
			r.Post("/orders", importH.Orders)
			r.Post("/receipts", importH.Receipts)
		})

		// 비유: "내 인사카드 보기" — 로그인한 사용자의 프로필 조회
		userH := handler.NewUserHandler(db)
		r.Get("/users/me", userH.GetMe)
		// 사용자 관리 (admin 전용)
		r.Get("/users", userH.ListUsers)
		r.Post("/users", userH.CreateUser)
		r.Put("/users/{id}/role", userH.UpdateRole)
		r.Put("/users/{id}/active", userH.UpdateActive)
		r.Put("/users/{id}/password", userH.ResetPassword)
	})

	// 비유: Rust 계산실 프록시 — 프론트→Go→Rust 중계
	// engineClient가 전달된 경우에만 계산 프록시 라우트 등록
	if len(engineClient) > 0 && engineClient[0] != nil {
		ec := engineClient[0]
		calcProxy := handler.NewCalcProxyHandler(ec)

		r.Route("/api/v1/calc", func(r chi.Router) {
			r.Use(middleware.AuthMiddleware(db))
			r.Post("/inventory", calcProxy.Inventory)
			r.Post("/landed-cost", calcProxy.LandedCost)
			r.Post("/exchange-compare", calcProxy.ExchangeCompare)
			r.Post("/lc-fee", calcProxy.LcFee)
			r.Post("/lc-limit-timeline", calcProxy.LcLimitTimeline)
			r.Post("/lc-maturity-alert", calcProxy.LcMaturityAlert)
			r.Post("/margin-analysis", calcProxy.MarginAnalysis)
			r.Post("/customer-analysis", calcProxy.CustomerAnalysis)
			r.Post("/price-trend", calcProxy.PriceTrend)
			r.Post("/supply-forecast", calcProxy.SupplyForecast)
			r.Post("/outstanding-list", calcProxy.OutstandingList)
			r.Post("/receipt-match-suggest", calcProxy.ReceiptMatchSuggest)
			r.Post("/search", calcProxy.Search)
			r.Post("/inventory-turnover", calcProxy.InventoryTurnover)
		})

		r.Route("/api/v1/engine", func(r chi.Router) {
			r.Use(middleware.AuthMiddleware(db))
			r.Get("/health", calcProxy.EngineHealth)
			r.Get("/ready", calcProxy.EngineReady)
		})
	}

	return r
}
