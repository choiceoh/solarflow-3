package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/engine"
	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/middleware"
	"solarflow-backend/internal/ocr"

	supa "github.com/supabase-community/supabase-go"
)

// New — 라우터 생성 (engineClient는 nil 가능 — Rust 미사용 시)
func New(db *supa.Client, engineClient ...*engine.EngineClient) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.CORSMiddleware)

	// 비유: /health는 건물 밖에서도 볼 수 있는 안내판 — 인증 불필요
	r.Get("/health", handler.HealthCheck)

	// 짧은 만료 토큰이 붙은 PDF 열람 링크 — 브라우저 PDF 미리보기/다운로드용
	attachmentH := handler.NewAttachmentHandler(db)
	r.Get("/api/v1/attachments/{id}/file", attachmentH.ServeSigned)

	// 비유: 로비 안내판 — 로그인 전 화면용 read-only KPI/환율 (인증 불필요)
	var publicEngine *engine.EngineClient
	if len(engineClient) > 0 {
		publicEngine = engineClient[0]
	}
	publicH := handler.NewPublicHandler(db, publicEngine)
	r.Route("/api/v1/public", func(r chi.Router) {
		r.Get("/login-stats", publicH.LoginStats)
		r.Get("/fx/usdkrw", publicH.FXUsdKrw)
		r.Get("/metals/{symbol}", publicH.MetalPrice)
		r.Get("/polysilicon", publicH.Polysilicon)
		r.Get("/scfi", publicH.SCFI)
	})

	r.Route("/api/v1", func(r chi.Router) {
		// 비유: /api/v1 이하 모든 경로는 사원증(JWT) 필수
		r.Use(middleware.AuthMiddleware(db))

		// 비유: 데이터 입력·수정·삭제는 admin/operator만 — frontend canEdit 권한과 동기화
		// (executive/manager/viewer는 모두 read-only — config/permissions.ts 참조)
		write := middleware.RoleMiddleware("admin", "operator")
		// 비유: 사용자/시스템 설정은 admin 전용
		adminOnly := middleware.RoleMiddleware("admin")
		// D-108: 탑솔라 원가/금융/면장 응답은 탑솔라 테넌트 사용자에게만 — 바로 토큰은 403
		topsolarOnly := middleware.RequireTenantScope(middleware.TenantScopeTopsolar)
		// BARO Phase 1: 바로(주) 전용 도구 — 탑솔라 토큰은 403
		baroOnly := middleware.RequireTenantScope(middleware.TenantScopeBaro)

		companyH := handler.NewCompanyHandler(db)
		r.Route("/companies", func(r chi.Router) {
			r.Get("/", companyH.List)
			r.Get("/{id}", companyH.GetByID)
			r.With(write).Post("/", companyH.Create)
			r.With(write).Put("/{id}", companyH.Update)
			r.With(write).Patch("/{id}/status", companyH.ToggleStatus)
			r.With(write).Delete("/{id}", companyH.Delete)
		})

		mfgH := handler.NewManufacturerHandler(db)
		r.Route("/manufacturers", func(r chi.Router) {
			r.Get("/", mfgH.List)
			r.Get("/{id}", mfgH.GetByID)
			r.With(write).Post("/", mfgH.Create)
			r.With(write).Put("/{id}", mfgH.Update)
			r.With(write).Patch("/{id}/status", mfgH.ToggleStatus)
			r.With(write).Delete("/{id}", mfgH.Delete)
		})

		productH := handler.NewProductHandler(db)
		r.Route("/products", func(r chi.Router) {
			r.Get("/", productH.List)
			r.Get("/{id}", productH.GetByID)
			r.With(write).Post("/", productH.Create)
			r.With(write).Put("/{id}", productH.Update)
			r.With(write).Patch("/{id}/status", productH.ToggleStatus)
			r.With(write).Delete("/{id}", productH.Delete)
		})

		partnerH := handler.NewPartnerHandler(db)
		r.Route("/partners", func(r chi.Router) {
			r.Get("/", partnerH.List)
			r.Get("/{id}", partnerH.GetByID)
			r.With(write).Post("/", partnerH.Create)
			r.With(write).Put("/{id}", partnerH.Update)
			r.With(write).Patch("/{id}/status", partnerH.ToggleStatus)
			r.With(write).Delete("/{id}", partnerH.Delete)
		})

		warehouseH := handler.NewWarehouseHandler(db)
		r.Route("/warehouses", func(r chi.Router) {
			r.Get("/", warehouseH.List)
			r.Get("/{id}", warehouseH.GetByID)
			r.With(write).Post("/", warehouseH.Create)
			r.With(write).Put("/{id}", warehouseH.Update)
			r.With(write).Patch("/{id}/status", warehouseH.ToggleStatus)
			r.With(write).Delete("/{id}", warehouseH.Delete)
		})

		bankH := handler.NewBankHandler(db)
		r.Route("/banks", func(r chi.Router) {
			r.Get("/", bankH.List)
			r.Get("/{id}", bankH.GetByID)
			r.With(write).Post("/", bankH.Create)
			r.With(write).Put("/{id}", bankH.Update)
			r.With(write).Patch("/{id}/status", bankH.ToggleStatus)
			r.With(write).Delete("/{id}", bankH.Delete)
		})

		poH := handler.NewPOHandler(db)
		poLineH := handler.NewPOLineHandler(db)
		r.Route("/pos", func(r chi.Router) {
			r.Get("/", poH.List)
			r.Get("/{id}", poH.GetByID)
			r.With(write).Post("/", poH.Create)
			r.With(write).Put("/{id}", poH.Update)
			r.With(write).Delete("/{id}", poH.Delete)
			r.Route("/{poId}/lines", func(r chi.Router) {
				r.Get("/", poLineH.ListByPO)
				r.With(write).Post("/", poLineH.Create)
				r.With(write).Put("/{id}", poLineH.Update)
				r.With(write).Delete("/{id}", poLineH.Delete)
			})
		})

		lcH := handler.NewLCHandler(db)
		r.Route("/lcs", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: LC 금융정보는 탑솔라 전용
			r.Get("/", lcH.List)
			r.Get("/{id}/lines", lcH.ListLines)
			r.Get("/{id}", lcH.GetByID)
			r.With(write).Post("/", lcH.Create)
			r.With(write).Put("/{id}", lcH.Update)
			r.With(write).Delete("/{id}", lcH.Delete)
		})

		ttH := handler.NewTTHandler(db)
		r.Route("/tts", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: T/T 계약금은 탑솔라 전용
			r.Get("/", ttH.List)
			r.Get("/{id}", ttH.GetByID)
			r.With(write).Post("/", ttH.Create)
			r.With(write).Put("/{id}", ttH.Update)
			r.With(write).Delete("/{id}", ttH.Delete)
		})

		blH := handler.NewBLHandler(db)
		blLineH := handler.NewBLLineHandler(db)
		r.Route("/bls", func(r chi.Router) {
			r.Get("/", blH.List)
			r.Get("/{id}", blH.GetByID)
			r.With(write).Post("/", blH.Create)
			r.With(write).Put("/{id}", blH.Update)
			r.With(write).Delete("/{id}", blH.Delete)
			r.Route("/{blId}/lines", func(r chi.Router) {
				r.Get("/", blLineH.ListByBL)
				r.With(write).Post("/", blLineH.Create)
				r.With(write).Put("/{id}", blLineH.Update)
				r.With(write).Delete("/{id}", blLineH.Delete)
			})
		})

		declH := handler.NewDeclarationHandler(db)
		r.Route("/declarations", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: 수입면장은 탑솔라 전용
			r.Get("/", declH.List)
			r.Get("/{id}", declH.GetByID)
			r.With(write).Post("/", declH.Create)
			r.With(write).Put("/{id}", declH.Update)
			r.With(write).Delete("/{id}", declH.Delete)
		})

		costH := handler.NewCostDetailHandler(db)
		r.Route("/cost-details", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: 수입 원가는 탑솔라 전용
			r.Get("/", costH.List)
			r.Get("/{id}", costH.GetByID)
			r.With(write).Post("/", costH.Create)
			r.With(write).Put("/{id}", costH.Update)
			r.With(write).Delete("/{id}", costH.Delete)
		})

		expenseH := handler.NewExpenseHandler(db)
		r.Route("/expenses", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: 부대비용은 탑솔라 전용
			r.Get("/", expenseH.List)
			r.Get("/{id}", expenseH.GetByID)
			r.With(write).Post("/", expenseH.Create)
			r.With(write).Put("/{id}", expenseH.Update)
			r.With(write).Delete("/{id}", expenseH.Delete)
		})

		orderH := handler.NewOrderHandler(db)
		r.Route("/orders", func(r chi.Router) {
			r.Get("/", orderH.List)
			r.Get("/{id}", orderH.GetByID)
			r.With(write).Post("/", orderH.Create)
			r.With(write).Put("/{id}", orderH.Update)
			r.With(write).Delete("/{id}", orderH.Delete)
		})

		// BARO Phase 1: 거래처별 단가표 — 바로(주) 사용자 전용 (탑솔라 토큰 403)
		ppbH := handler.NewPartnerPriceBookHandler(db)
		r.Route("/partner-prices", func(r chi.Router) {
			r.Use(baroOnly)
			r.Get("/", ppbH.List)
			r.Get("/lookup", ppbH.Lookup)
			r.Get("/{id}", ppbH.GetByID)
			r.With(write).Post("/", ppbH.Create)
			r.With(write).Put("/{id}", ppbH.Update)
			r.With(write).Delete("/{id}", ppbH.Delete)
		})

		// BARO Phase 1: 빠른 재발주 — 바로(주) 사용자 전용
		r.Route("/baro/orders", func(r chi.Router) {
			r.Use(baroOnly)
			r.Get("/recent", orderH.RecentByPartner)
			r.With(write).Post("/{id}/clone", orderH.Clone)
		})

		// BARO Phase 3: 거래처별 미수금/한도 보드 — 바로(주) 사용자 전용
		creditH := handler.NewCreditBoardHandler(db)
		r.Route("/baro/credit-board", func(r chi.Router) {
			r.Use(baroOnly)
			r.Get("/", creditH.List)
		})

		// BARO Phase 4: 출고 배차/일정 보드 — 바로(주) 사용자 전용
		drH := handler.NewDispatchRouteHandler(db)
		r.Route("/baro/dispatch-routes", func(r chi.Router) {
			r.Use(baroOnly)
			r.Get("/", drH.List)
			r.Get("/{id}", drH.GetByID)
			r.Get("/{id}/outbounds", drH.Outbounds)
			r.With(write).Post("/", drH.Create)
			r.With(write).Put("/{id}", drH.Update)
			r.With(write).Delete("/{id}", drH.Delete)
			r.With(write).Post("/{id}/assign", drH.AssignOutbound)
			r.With(write).Post("/unassign", drH.UnassignOutbound)
		})

		// BARO Phase 2: 그룹내 매입 요청 — 바로(BARO)와 탑솔라(TS)가 같은 테이블에 다른 권한으로 접근
		// - BARO: 등록/내 목록/취소/입고 확인
		// - TS:   inbox 조회/거부/출고 연결
		icrH := handler.NewIntercompanyRequestHandler(db)
		r.Route("/intercompany-requests", func(r chi.Router) {
			// BARO 측 액션
			r.With(baroOnly).Get("/mine", icrH.Mine)
			r.With(baroOnly, write).Post("/", icrH.Create)
			r.With(baroOnly, write).Patch("/{id}/cancel", icrH.Cancel)
			r.With(baroOnly, write).Patch("/{id}/receive", icrH.Receive)

			// 탑솔라 측 액션
			r.With(topsolarOnly).Get("/inbox", icrH.Inbox)
			r.With(topsolarOnly, write).Patch("/{id}/reject", icrH.Reject)
			r.With(topsolarOnly, write).Patch("/{id}/fulfill", icrH.Fulfill)
		})

		receiptH := handler.NewReceiptHandler(db)
		r.Route("/receipts", func(r chi.Router) {
			r.Get("/", receiptH.List)
			r.Get("/{id}", receiptH.GetByID)
			r.With(write).Post("/", receiptH.Create)
			r.With(write).Put("/{id}", receiptH.Update)
			r.With(write).Delete("/{id}", receiptH.Delete)
		})

		matchH := handler.NewReceiptMatchHandler(db)
		r.Route("/receipt-matches", func(r chi.Router) {
			r.Get("/", matchH.List)
			r.With(write).Post("/", matchH.Create)
			r.With(write).Delete("/{id}", matchH.Delete)
		})

		outboundH := handler.NewOutboundHandler(db, engineClient...)
		r.Route("/outbounds", func(r chi.Router) {
			r.Get("/", outboundH.List)
			r.Get("/{id}", outboundH.GetByID)
			r.With(write).Post("/", outboundH.Create)
			r.With(write).Put("/{id}", outboundH.Update)
			r.With(write).Delete("/{id}", outboundH.Delete)
		})

		// 공사 현장 마스터 (자체/EPC 현장 + 공급 이력)
		siteH := handler.NewConstructionSiteHandler(db)
		r.Route("/construction-sites", func(r chi.Router) {
			r.Get("/", siteH.List)
			r.Get("/{id}", siteH.GetByID)
			r.With(write).Post("/", siteH.Create)
			r.With(write).Put("/{id}", siteH.Update)
			r.With(write).Patch("/{id}/status", siteH.ToggleActive)
			r.With(write).Delete("/{id}", siteH.Delete)
		})

		// 운영 forecast — 자체 공사/보정 수요 계획
		demandH := handler.NewModuleDemandForecastHandler(db)
		r.Route("/module-demand-forecasts", func(r chi.Router) {
			r.Get("/", demandH.List)
			r.With(write).Post("/", demandH.Create)
			r.With(write).Put("/{id}", demandH.Update)
			r.With(write).Delete("/{id}", demandH.Delete)
		})

		// 가용재고 배정 (판매예정/공사예정)
		allocH := handler.NewInventoryAllocationHandler(db)
		r.Route("/inventory/allocations", func(r chi.Router) {
			r.Get("/", allocH.List)
			r.Get("/{id}", allocH.GetByID)
			r.With(write).Post("/", allocH.Create)
			r.With(write).Put("/{id}", allocH.Update)
			r.With(write).Delete("/{id}", allocH.Delete)
		})

		saleH := handler.NewSaleHandler(db)
		r.Route("/sales", func(r chi.Router) {
			r.Get("/", saleH.List)
			r.Get("/{id}", saleH.GetByID)
			r.With(write).Post("/", saleH.Create)
			r.With(write).Put("/{id}", saleH.Update)
			r.With(write).Delete("/{id}", saleH.Delete)
		})

		auditH := handler.NewAuditLogHandler(db)
		r.Route("/audit-logs", func(r chi.Router) {
			r.Get("/", auditH.List)
		})

		limitH := handler.NewLimitChangeHandler(db)
		r.Route("/limit-changes", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: LC 한도 변경 이력은 탑솔라 전용
			r.Get("/", limitH.List)
			r.With(write).Post("/", limitH.Create)
		})

		priceH := handler.NewPriceHistoryHandler(db)
		r.Route("/price-histories", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: 수입 단가 이력은 탑솔라 전용
			r.Get("/", priceH.List)
			r.Get("/{id}", priceH.GetByID)
			r.With(write).Post("/", priceH.Create)
			r.With(write).Put("/{id}", priceH.Update)
		})

		// 비유: 포스트잇 메모 관리 (Step 31)
		noteH := handler.NewNoteHandler(db)
		r.Route("/notes", func(r chi.Router) {
			r.Get("/", noteH.List)
			r.With(write).Post("/", noteH.Create)
			r.With(write).Put("/{id}", noteH.Update)
			r.With(write).Delete("/{id}", noteH.Delete)
		})

		// 비유: 업무 서류함 — LC 전문 PDF 등 첨부파일 보관
		r.Route("/attachments", func(r chi.Router) {
			r.Get("/", attachmentH.List)
			r.Get("/{id}/access", attachmentH.Access)
			r.Get("/{id}/download", attachmentH.Download)
			r.With(write).Post("/", attachmentH.Create)
			r.With(write).Delete("/{id}", attachmentH.Delete)
		})

		// 비유: OCR 검토대 — 서류 이미지/PDF를 장부에 넣기 전 원문으로 읽어냄
		ocrH := handler.NewOCRHandler(ocr.NewFromEnv())
		r.Route("/ocr", func(r chi.Router) {
			r.Use(write)
			r.Get("/health", ocrH.Health)
			r.Post("/extract", ocrH.Extract)
		})

		// 비유: 아마란스10 ERP 내보내기 — 입고/출고 .xlsx (Step 29C)
		exportH := handler.NewExportHandler(db)
		r.Route("/export/amaranth", func(r chi.Router) {
			r.Use(topsolarOnly) // D-108: 아마란스10은 탑솔라 ERP — 바로는 사용하지 않음
			r.Get("/inbound", exportH.AmaranthInbound)
			r.Get("/outbound", exportH.AmaranthOutbound)
			r.Get("/sales", exportH.AmaranthSalesClosing)
			r.Get("/rpa-package", exportH.DownloadRPAPackage)
			r.Get("/jobs", exportH.ListUploadJobs)
			r.Get("/jobs/{id}/download", exportH.DownloadUploadJobFile)
			r.With(write).Post("/outbound/jobs", exportH.CreateOutboundUploadJob)
			r.With(write).Post("/jobs/{id}/claim", exportH.ClaimUploadJob)
			r.With(write).Put("/jobs/{id}/status", exportH.UpdateUploadJobStatus)
		})

		// 비유: 엑셀 일괄 등록 창구 — 7종 Import API (Step 29B) — 쓰기 권한 필수
		importH := handler.NewImportHandler(db)
		r.Route("/import", func(r chi.Router) {
			r.Use(write)
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
		// 사용자 관리 (admin 전용) — 라우터 미들웨어 + 핸들러 requireAdmin 이중 검증
		r.Route("/users", func(r chi.Router) {
			r.Use(adminOnly)
			r.Get("/", userH.ListUsers)
			r.Post("/", userH.CreateUser)
			r.Put("/{id}/role", userH.UpdateRole)
			r.Put("/{id}/active", userH.UpdateActive)
			r.Put("/{id}/password", userH.ResetPassword)
		})
	})

	// 비유: Rust 계산실 프록시 — 프론트→Go→Rust 중계
	// engineClient가 전달된 경우에만 계산 프록시 라우트 등록
	if len(engineClient) > 0 && engineClient[0] != nil {
		ec := engineClient[0]
		calcProxy := handler.NewCalcProxyHandler(ec)

		r.Route("/api/v1/calc", func(r chi.Router) {
			r.Use(middleware.AuthMiddleware(db))
			// D-108: 탑솔라 원가/금융 응답이 들어가는 계산은 탑솔라 테넌트만
			topsolarOnly := middleware.RequireTenantScope(middleware.TenantScopeTopsolar)
			r.Post("/inventory", calcProxy.Inventory)
			r.With(topsolarOnly).Post("/landed-cost", calcProxy.LandedCost)
			r.With(topsolarOnly).Post("/exchange-compare", calcProxy.ExchangeCompare)
			r.With(topsolarOnly).Post("/lc-fee", calcProxy.LcFee)
			r.With(topsolarOnly).Post("/lc-limit-timeline", calcProxy.LcLimitTimeline)
			r.With(topsolarOnly).Post("/lc-maturity-alert", calcProxy.LcMaturityAlert)
			r.With(topsolarOnly).Post("/margin-analysis", calcProxy.MarginAnalysis)
			r.Post("/customer-analysis", calcProxy.CustomerAnalysis)
			r.With(topsolarOnly).Post("/price-trend", calcProxy.PriceTrend)
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
