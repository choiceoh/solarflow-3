// Package router — chi 라우터 구성 (D-RegisterRoutes 빅뱅).
// 핸들러는 자기 라우트·가드를 RegisterRoutes에서 직접 소유한다 (internal/handler/routes.go).
// 본 파일은 그 호출만 알파벳 순서로 늘어놓아 신규 도메인 추가 시 PR 충돌을 최소화한다.
package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/app"
	"solarflow-backend/internal/handler"
	"solarflow-backend/internal/middleware"
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
	r.Use(middleware.RequestLog)
	r.Use(middleware.CORSMiddleware)
	r.Get("/health", handler.HealthCheck)

	// 인스턴스 생성 — alias·중첩 라우트가 공유하는 핸들러는 미리 만든다.
	attachH := handler.NewAttachmentHandler(a.DB)
	ocrH := handler.NewOCRHandler(a.OCR)
	matchH := handler.NewReceiptMatchHandler(a.DB, a.Eng)
	publicH := handler.NewPublicHandler(a.DB, a.Eng)
	// AssistantHandler.ConfirmProposal/case "create_outbound"가 위임하므로 단일 인스턴스 공유.
	outboundH := handler.NewOutboundHandler(a.DB, a.Eng)

	// AssistantHandler는 public/auth 두 인스턴스로 분리.
	// - publicAssistantH: alias 없음, 비로그인 bare LLM 패스스루 전용 (도구는 user_id 부재로 자동 비활성)
	// - assistantH(아래): WithAlias로 ocrH/matchH 주입 — /assistant/ocr/*, /assistant/match/receipts/auto 위임
	publicAssistantH := handler.NewAssistantHandler(a.DB)

	// 인증 외 라우트
	attachH.RegisterPublicRoutes(r)
	r.Route("/api/v1/public", func(r chi.Router) {
		publicH.RegisterRoutes(r)
		r.Post("/assistant/chat", publicAssistantH.ChatStream)
		// 비스트리밍 fallback — PR-4 에서 제거.
		r.Post("/assistant/chat-legacy", publicAssistantH.Chat)
	})

	// 인증 라우트 — 알파벳 순서로 정렬 (PR 충돌 ↓, 신규 도메인은 자기 자리에 1줄 추가)
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(authMW)

		handler.NewAssistantHandler(a.DB).WithAlias(ocrH, matchH).WithWriters(outboundH).RegisterRoutes(r, a.Gates)
		attachH.RegisterRoutes(r, a.Gates)
		handler.NewAuditLogHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewBankHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewBLHandler(a.DB).RegisterRoutes(r, a.Gates, handler.NewBLLineHandler(a.DB))
		handler.NewCompanyHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewConstructionSiteHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewCostDetailHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewCreditBoardHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewDeclarationHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewDispatchRouteHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewExpenseHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewExportHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewImportHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewIntercompanyRequestHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewInventoryAllocationHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewLCHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewLimitChangeHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewManufacturerHandler(a.DB).RegisterRoutes(r, a.Gates)
		matchH.RegisterRoutes(r, a.Gates)
		handler.NewModuleDemandForecastHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewNoteHandler(a.DB).RegisterRoutes(r, a.Gates)
		ocrH.RegisterRoutes(r, a.Gates)
		handler.NewOrderHandler(a.DB).RegisterRoutes(r, a.Gates)
		outboundH.RegisterRoutes(r, a.Gates)
		partnerActH := handler.NewPartnerActivityHandler(a.DB)
		handler.NewPartnerHandler(a.DB).RegisterRoutes(r, a.Gates, partnerActH)
		partnerActH.RegisterRoutes(r, a.Gates)
		handler.NewPartnerPriceBookHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewPOHandler(a.DB).RegisterRoutes(r, a.Gates, handler.NewPOLineHandler(a.DB))
		handler.NewPriceHistoryHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewProductHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewReceiptHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewSaleHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewTTHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewUIConfigHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewUserHandler(a.DB).RegisterRoutes(r, a.Gates)
		handler.NewWarehouseHandler(a.DB).RegisterRoutes(r, a.Gates)
	})

	// Rust 계산실 프록시 — engine 미사용 환경에서는 라우트 자체를 mount하지 않는다.
	// calc/engine 트리는 별도 Route라 같은 authMW를 다시 주입한다.
	if a.HasEngine() {
		handler.NewCalcProxyHandler(a.Eng).RegisterRoutes(r, a.Gates, authMW)
	}
	return r
}
