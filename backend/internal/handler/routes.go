package handler

// 본 파일은 모든 핸들러의 RegisterRoutes 메서드를 한 곳에 모은다 (D-RegisterRoutes 빅뱅).
// 각 메서드는 자기 핸들러가 소유하는 URL·가드·중첩 라우트를 한 번에 선언한다.
//
// 핸들러 파일 prefix 컨벤션 (시각적 그룹핑, 패키지는 단일 handler 유지):
//   - master_*  : 마스터 CRUD (bank/company/manufacturer/partner/product/warehouse/construction_site)
//   - tx_*      : 거래·재무 트랜잭션 (po/lc/bl/sale/receipt/declaration/expense/import-financial 등)
//   - baro_*    : 바로(주) 전용 (D-109)
//   - sys_*     : 시스템·관리 (user/ui_config/audit_log/note/public/health/attachment)
//   - ai_*      : AI 도우미·OCR (assistant/assistant_tools/ocr)
//   - io_*      : 일괄 import/export (Amaranth)
//   - routes.go : 본 파일 (분류 안함, 중앙)
//
// 신규 도메인 추가 시 절차:
//   1. 위 prefix 중 하나를 골라 새 핸들러 파일 추가 (예: master_xxx.go)
//   2. NewXxxHandler/메서드 작성
//   3. 본 파일에 (h *XxxHandler) RegisterRoutes(r chi.Router, g middleware.Gates) 추가
//   4. internal/router/router.go의 알파벳 자리에 1줄 호출 추가
//   5. router_test.go의 routes.golden 갱신 (`go test -run TestRouteSnapshot -update`)

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"solarflow-backend/internal/middleware"
)

// ---- 알파벳 순서로 정렬 (PR 충돌 ↓) ----

// AssistantHandler — /assistant 서브트리.
// ocrH·matchH는 alias 라우트(/assistant/ocr/*, /assistant/match/receipts/auto) 위임용 — 생성자에서 주입.
func (h *AssistantHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/assistant", func(r chi.Router) {
		r.Post("/chat", h.ChatStream)
		// 대화 세션 영구 저장소 — 우측상단 세션목록이 사용
		r.Get("/sessions", h.ListSessions)
		r.With(g.Write).Post("/sessions", h.CreateSession)
		r.Get("/sessions/{id}", h.GetSession)
		r.With(g.Write).Patch("/sessions/{id}", h.UpdateSession)
		r.With(g.Write).Delete("/sessions/{id}", h.DeleteSession)
		// alias of /api/v1/ocr/* — AI 통합 입구로도 노출
		if h.ocrH != nil {
			r.Get("/ocr/health", h.ocrH.Health)
			r.Post("/ocr/extract", h.ocrH.Extract)
		}
		// alias of /api/v1/receipt-matches/auto — AI 통합 입구로도 노출
		if h.matchH != nil {
			r.With(g.Write).Post("/match/receipts/auto", h.matchH.AutoMatch)
		}
	})
}

// AttachmentHandler — 두 메서드로 분할:
// - RegisterPublicRoutes: /api/v1/attachments/{id}/file — 짧은 만료 토큰 PDF 열람 (인증 불필요)
// - RegisterRoutes: /attachments — 인증 내 일반 CRUD
func (h *AttachmentHandler) RegisterPublicRoutes(r chi.Router) {
	r.Get("/api/v1/attachments/{id}/file", h.ServeSigned)
}

func (h *AttachmentHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/attachments", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}/access", h.Access)
		r.Get("/{id}/download", h.Download)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// AuditLogHandler — /audit-logs (read-only).
func (h *AuditLogHandler) RegisterRoutes(r chi.Router, _ middleware.Gates) {
	r.Route("/audit-logs", func(r chi.Router) {
		r.Get("/", h.List)
	})
}

// BankHandler — 은행 마스터 CRUD.
func (h *BankHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/banks", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		// 비유: PUT 과 PATCH 같은 핸들러 — UpdateBankRequest 의 모든 필드가 optional
		// (포인터 + omitempty) 이라 부분 업데이트로 그대로 동작. 메타 GUI 의 inline
		// 편집 (셀 클릭 → PATCH /api/v1/banks/{id} { 한 필드 } ) 가 이 라우트로.
		r.With(g.Write).Patch("/{id}", h.Update)
		r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// BaroIncomingHandler — BARO 전용 입고예정/ETA 보드 (가격·환율 제외).
func (h *BaroIncomingHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/baro/incoming", func(r chi.Router) {
		r.Use(g.BaroOnly)
		r.Get("/", h.List)
	})
}

// BaroPurchaseHistoryHandler — BARO 자체 매입 원가/구매이력 (BR 법인만).
func (h *BaroPurchaseHistoryHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/baro/purchase-history", func(r chi.Router) {
		r.Use(g.BaroOnly)
		r.With(middleware.RoleMiddleware("admin", "operator", "executive")).Get("/", h.List)
	})
}

// BLHandler — 선하증권 + 중첩 라인. 자식 BLLineHandler를 인자로 받아 부모 안에서 마운트한다.
func (h *BLHandler) RegisterRoutes(r chi.Router, g middleware.Gates, lineH *BLLineHandler) {
	r.Route("/bls", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
		r.Route("/{blId}/lines", func(r chi.Router) {
			r.Get("/", lineH.ListByBL)
			r.With(g.Write).Post("/", lineH.Create)
			r.With(g.Write).Put("/{id}", lineH.Update)
			r.With(g.Write).Delete("/{id}", lineH.Delete)
		})
	})
}

// CalcProxyHandler — Rust 계산실 프록시. router.New에서 HasEngine() 분기 후 직접 호출한다.
// authMW는 router 외부에서 주입 — calc/engine은 별도 r.Route 트리이므로 여기서 Use 처리.
// D-108: 탑솔라 원가/금융 응답이 들어가는 계산은 g.TopsolarOnly 적용.
func (h *CalcProxyHandler) RegisterRoutes(root chi.Router, g middleware.Gates, authMW func(http.Handler) http.Handler) {
	root.Route("/api/v1/calc", func(r chi.Router) {
		r.Use(authMW)
		r.Post("/inventory", h.Inventory)
		r.With(g.TopsolarOnly).Post("/landed-cost", h.LandedCost)
		r.With(g.TopsolarOnly).Post("/exchange-compare", h.ExchangeCompare)
		r.With(g.TopsolarOnly).Post("/lc-fee", h.LcFee)
		r.With(g.TopsolarOnly).Post("/lc-limit-timeline", h.LcLimitTimeline)
		r.With(g.TopsolarOnly).Post("/lc-maturity-alert", h.LcMaturityAlert)
		r.With(g.TopsolarOnly).Post("/margin-analysis", h.MarginAnalysis)
		r.Post("/customer-analysis", h.CustomerAnalysis)
		r.With(g.TopsolarOnly).Post("/price-trend", h.PriceTrend)
		r.Post("/supply-forecast", h.SupplyForecast)
		r.Post("/outstanding-list", h.OutstandingList)
		r.Post("/receipt-match-suggest", h.ReceiptMatchSuggest)
		r.Post("/search", h.Search)
		r.Post("/inventory-turnover", h.InventoryTurnover)
	})
	root.Route("/api/v1/engine", func(r chi.Router) {
		r.Use(authMW)
		r.Get("/health", h.EngineHealth)
		r.Get("/ready", h.EngineReady)
	})
}

// CompanyHandler — 법인 마스터 CRUD.
func (h *CompanyHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/companies", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		// 메타 GUI inline 편집 진입점 — UpdateCompanyRequest 가 pointer + omitempty
		r.With(g.Write).Patch("/{id}", h.Update)
		r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// ConstructionSiteHandler — 공사 현장 마스터 (자체/EPC).
func (h *ConstructionSiteHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/construction-sites", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		// 메타 GUI inline 편집 진입점 — UpdateConstructionSiteRequest 가 pointer + omitempty
		r.With(g.Write).Patch("/{id}", h.Update)
		r.With(g.Write).Patch("/{id}/status", h.ToggleActive)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// CostDetailHandler — 수입 원가 (D-108 탑솔라 전용).
func (h *CostDetailHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/cost-details", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// CreditBoardHandler — 거래처별 미수금/한도 보드 (BARO Phase 3, baroOnly).
func (h *CreditBoardHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/baro/credit-board", func(r chi.Router) {
		r.Use(g.BaroOnly)
		r.Get("/", h.List)
	})
}

// DeclarationHandler — 수입 면장 (D-108 탑솔라 전용).
func (h *DeclarationHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/declarations", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// DispatchRouteHandler — 출고 배차/일정 보드 (BARO Phase 4, baroOnly).
func (h *DispatchRouteHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/baro/dispatch-routes", func(r chi.Router) {
		r.Use(g.BaroOnly)
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.Get("/{id}/outbounds", h.Outbounds)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
		r.With(g.Write).Post("/{id}/assign", h.AssignOutbound)
		r.With(g.Write).Post("/unassign", h.UnassignOutbound)
	})
}

// ExpenseHandler — 부대비용 (D-108 탑솔라 전용).
func (h *ExpenseHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/expenses", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// ExportHandler — 아마란스10 ERP 내보내기 (D-108 탑솔라 전용).
func (h *ExportHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/export/amaranth", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/inbound", h.AmaranthInbound)
		r.Get("/outbound", h.AmaranthOutbound)
		r.Get("/sales", h.AmaranthSalesClosing)
		r.Get("/rpa-package", h.DownloadRPAPackage)
		r.Get("/jobs", h.ListUploadJobs)
		r.Get("/jobs/{id}/download", h.DownloadUploadJobFile)
		r.With(g.Write).Post("/outbound/jobs", h.CreateOutboundUploadJob)
		r.With(g.Write).Post("/jobs/{id}/claim", h.ClaimUploadJob)
		r.With(g.Write).Put("/jobs/{id}/status", h.UpdateUploadJobStatus)
	})
}

// ImportHandler — 엑셀 일괄 등록 7종 (모두 write).
func (h *ImportHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/import", func(r chi.Router) {
		r.Use(g.Write)
		r.Post("/inbound", h.Inbound)
		r.Post("/outbound", h.Outbound)
		r.Post("/sales", h.Sales)
		r.Post("/declarations", h.Declarations)
		r.Post("/expenses", h.Expenses)
		r.Post("/orders", h.Orders)
		r.Post("/receipts", h.Receipts)
	})
}

// IntercompanyRequestHandler — 그룹내 매입 요청 (BARO Phase 2, 양쪽 테넌트가 같은 테이블 다른 권한).
func (h *IntercompanyRequestHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/intercompany-requests", func(r chi.Router) {
		// BARO 측 액션
		r.With(g.BaroOnly).Get("/mine", h.Mine)
		r.With(g.BaroOnly, g.Write).Post("/", h.Create)
		r.With(g.BaroOnly, g.Write).Patch("/{id}/cancel", h.Cancel)
		r.With(g.BaroOnly, g.Write).Patch("/{id}/receive", h.Receive)
		// 탑솔라 측 액션
		r.With(g.TopsolarOnly).Get("/inbox", h.Inbox)
		r.With(g.TopsolarOnly, g.Write).Patch("/{id}/reject", h.Reject)
		r.With(g.TopsolarOnly, g.Write).Patch("/{id}/fulfill", h.Fulfill)
	})
}

// InventoryAllocationHandler — 가용재고 배정 (판매예정/공사예정).
func (h *InventoryAllocationHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/inventory/allocations", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// LCHandler — 신용장 (D-108 탑솔라 전용).
func (h *LCHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/lcs", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/", h.List)
		r.Get("/{id}/lines", h.ListLines)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// LimitChangeHandler — LC 한도 변경 이력 (D-108 탑솔라 전용).
func (h *LimitChangeHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/limit-changes", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/", h.List)
		r.With(g.Write).Post("/", h.Create)
	})
}

// ManufacturerHandler — 제조사 마스터 CRUD.
func (h *ManufacturerHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/manufacturers", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		// 메타 GUI inline 편집 진입점 — UpdateManufacturerRequest 의 모든 필드가 optional.
		r.With(g.Write).Patch("/{id}", h.Update)
		r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// ModuleDemandForecastHandler — 운영 forecast (자체 공사/보정 수요 계획).
func (h *ModuleDemandForecastHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/module-demand-forecasts", func(r chi.Router) {
		r.Get("/", h.List)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// NoteHandler — 포스트잇 메모 관리 (Step 31).
func (h *NoteHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/notes", func(r chi.Router) {
		r.Get("/", h.List)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// OCRHandler — OCR 검토대 (write 그룹).
func (h *OCRHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/ocr", func(r chi.Router) {
		r.Use(g.Write)
		r.Get("/health", h.Health)
		r.Post("/extract", h.Extract)
	})
}

// OrderHandler — /orders CRUD + /baro/orders (BARO 빠른 재발주).
// 같은 핸들러가 두 prefix를 갖는 유일한 경우 — 한 메서드에서 두 트리 모두 마운트.
func (h *OrderHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/orders", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
	r.Route("/baro/orders", func(r chi.Router) {
		r.Use(g.BaroOnly)
		r.Get("/recent", h.RecentByPartner)
		r.With(g.Write).Post("/{id}/clone", h.Clone)
	})
}

// OutboundHandler — 출고 CRUD.
func (h *OutboundHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/outbounds", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// PartnerActivityHandler — CRM 활동 로그 (BARO 전용). /partners/{id}/activities는 PartnerHandler가 마운트.
func (h *PartnerActivityHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/partner-activities", func(r chi.Router) {
		r.Use(g.BaroOnly)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Patch("/{id}/followup", h.ToggleFollowup)
	})
	r.With(g.BaroOnly).Get("/me/open-followups", h.MyOpenFollowups)
}

// PartnerHandler — /partners CRUD + /{id}/activities (PartnerActivity 위임).
func (h *PartnerHandler) RegisterRoutes(r chi.Router, g middleware.Gates, activityH *PartnerActivityHandler) {
	r.Route("/partners", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		// CRM 활동 로그는 BARO 전용 alias — 탑솔라 토큰은 403
		r.With(g.BaroOnly).Get("/{id}/activities", activityH.ListByPartner)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		// 메타 GUI inline 편집 진입점 — UpdatePartnerRequest 의 모든 필드가 optional.
		r.With(g.Write).Patch("/{id}", h.Update)
		r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// PartnerPriceBookHandler — 거래처별 단가표 (BARO Phase 1, baroOnly).
func (h *PartnerPriceBookHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/partner-prices", func(r chi.Router) {
		r.Use(g.BaroOnly)
		r.Get("/", h.List)
		r.Get("/lookup", h.Lookup)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// POHandler — 발주 + 중첩 라인. 자식 POLineHandler를 인자로 받아 부모 안에서 마운트.
func (h *POHandler) RegisterRoutes(r chi.Router, g middleware.Gates, lineH *POLineHandler) {
	r.Route("/pos", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
		r.Route("/{poId}/lines", func(r chi.Router) {
			r.Get("/", lineH.ListByPO)
			r.With(g.Write).Post("/", lineH.Create)
			r.With(g.Write).Put("/{id}", lineH.Update)
			r.With(g.Write).Delete("/{id}", lineH.Delete)
		})
	})
}

// PriceHistoryHandler — 수입 단가 이력 (D-108 탑솔라 전용, DELETE 없음).
func (h *PriceHistoryHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/price-histories", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
	})
}

// ProductHandler — 품번 마스터 CRUD.
func (h *ProductHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/products", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// PublicHandler — 인증 외 read-only KPI/환율 (router에서 /api/v1/public 그룹 안에 마운트).
func (h *PublicHandler) RegisterRoutes(r chi.Router) {
	r.Get("/login-stats", h.LoginStats)
	r.Get("/fx/usdkrw", h.FXUsdKrw)
	r.Get("/metals/{symbol}", h.MetalPrice)
	r.Get("/polysilicon", h.Polysilicon)
	r.Get("/scfi", h.SCFI)
}

// ReceiptHandler — 수금 CRUD.
func (h *ReceiptHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/receipts", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// ReceiptMatchHandler — 수금/매출 매칭 + 일괄 자동 매칭.
func (h *ReceiptMatchHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/receipt-matches", func(r chi.Router) {
		r.Get("/", h.List)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Delete("/{id}", h.Delete)
		r.With(g.Write).Post("/auto", h.AutoMatch)
	})
}

// SaleHandler — 매출 CRUD.
func (h *SaleHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/sales", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// TTHandler — T/T 계약금 (D-108 탑솔라 전용).
func (h *TTHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/tts", func(r chi.Router) {
		r.Use(g.TopsolarOnly)
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}

// SystemSettingsHandler — 사이트 단위 전역 설정 (메뉴 가시성·공지 배너 등). 읽기는 인증, 쓰기는 admin.
func (h *SystemSettingsHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/system-settings", func(r chi.Router) {
		r.Get("/{key}", h.Get)
		r.With(g.AdminOnly).Put("/{key}", h.Upsert)
	})
}

// UIConfigHandler — 운영자 GUI 메타 편집기 (Phase 3). 읽기는 인증, 쓰기는 admin.
func (h *UIConfigHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/ui-configs", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{scope}/{config_id}", h.GetByScopeID)
		r.With(g.AdminOnly).Put("/{scope}/{config_id}", h.Upsert)
		r.With(g.AdminOnly).Delete("/{scope}/{config_id}", h.Delete)
	})
}

// UserHandler — /users/me (모든 인증) + /users (admin 전용).
func (h *UserHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Get("/users/me", h.GetMe)
	r.Put("/users/me", h.UpdateMyProfile)
	r.Put("/users/me/password", h.ChangeMyPassword)
	r.Put("/users/me/persona", h.UpdateMyPersona) // D-112: 사이드바 탭 즉시 저장
	r.Put("/users/me/preferences", h.UpdateMyPreferences)
	r.Route("/users", func(r chi.Router) {
		r.Use(g.AdminOnly)
		r.Get("/", h.ListUsers)
		r.Post("/", h.CreateUser)
		r.Put("/{id}", h.UpdateProfile)
		r.Put("/{id}/role", h.UpdateRole)
		r.Put("/{id}/active", h.UpdateActive)
		r.Put("/{id}/password", h.ResetPassword)
	})
}

// WarehouseHandler — 창고 마스터 CRUD.
func (h *WarehouseHandler) RegisterRoutes(r chi.Router, g middleware.Gates) {
	r.Route("/warehouses", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.With(g.Write).Post("/", h.Create)
		r.With(g.Write).Put("/{id}", h.Update)
		// 메타 GUI inline 편집 진입점 — UpdateWarehouseRequest 의 모든 필드가 optional
		// (포인터 + omitempty) 이라 부분 업데이트로 동작.
		r.With(g.Write).Patch("/{id}", h.Update)
		r.With(g.Write).Patch("/{id}/status", h.ToggleStatus)
		r.With(g.Write).Delete("/{id}", h.Delete)
	})
}
