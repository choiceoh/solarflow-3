// Package feature — feature 카탈로그(D-120)
//
// SolarFlow의 모든 테넌트 격리는 feature_id 단위로 표현된다.
// 각 feature는:
//   - 어느 라우트(들)를 게이트하는가 (Paths)
//   - 어느 테넌트가 기본으로 사용하는가 (DefaultTenants)
//   - 데이터 스코프 힌트 (DefaultDataScope)
//
// 신규 라우트 추가 시 절차:
//  1. 본 파일에 Feature 엔트리 추가 (또는 기존 엔트리의 Paths에 라인 1줄 추가)
//  2. harness/FEATURE-WIRING-MATRIX.md 의 표에 같은 행 추가
//  3. 라우트 정의에서 r.Use(g.Feature(feature.IDXxx)) 호출
//  4. go test ./internal/feature ./internal/router 통과 확인 (coverage / matrix consistency)
//
// 단계 (1)~(3) 중 하나라도 빠지면 coverage_test 또는 matrix_consistency_test 가 잡는다.
package feature

// FeatureID — 카탈로그에 등록된 feature 식별자.
// 자유 문자열 게이트 호출(g.Feature("foo"))을 막기 위해 별도 타입을 둔다.
type FeatureID string

// 사전 정의 테넌트 집합 — 한 곳에서만 변경하면 카탈로그 전체에 반영된다.
var (
	// TenantSetAll — 모든 테넌트가 공유하는 공통 기능에 부여한다.
	TenantSetAll = []string{"topsolar", "cable", "baro"}
	// TenantSetModule — module 계열(D-119) = topsolar + cable. 수입/금융/원가 영역.
	TenantSetModule = []string{"topsolar", "cable"}
	// TenantSetTopsolarOnly — 탑솔라 단독. 아마란스 RPA 등 외부 시스템 연동이 후보.
	TenantSetTopsolarOnly = []string{"topsolar"}
	// TenantSetBaroOnly — 바로(주) 전용(D-108).
	TenantSetBaroOnly = []string{"baro"}
)

// DataScopeKind — 데이터 배선 힌트(D-120).
//
// 이번 PR 에서는 enforcement 를 추가하지 않고 분류만 둔다.
// row_filter / column_mask 의 실제 강제는 별도 후속 작업(쿼리 레이어 통합) 에서 도입한다.
type DataScopeKind string

const (
	// DataScopeGlobal — 모든 테넌트가 모든 행/컬럼을 본다.
	DataScopeGlobal DataScopeKind = "global"
	// DataScopeTenantCompany — 테넌트별 법인 분리(예: BARO 는 BR 법인 행만).
	DataScopeTenantCompany DataScopeKind = "tenant_company"
	// DataScopeColumnMasked — 같은 행이지만 일부 컬럼이 가려진 sanitized 응답(D-116).
	DataScopeColumnMasked DataScopeKind = "column_masked"
	// DataScopeTenantOwned — 테넌트가 자기 행만 보고 다른 테넌트 행은 안 보임(예: CRM 활동 로그).
	DataScopeTenantOwned DataScopeKind = "tenant_owned"
)

// Feature — 카탈로그 한 항목.
type Feature struct {
	ID             FeatureID
	Name           string        // 사람이 읽는 이름(매트릭스 표에 노출)
	Description    string        // 한 줄 설명
	DefaultTenants []string      // 기본 enabled 테넌트 집합. DB override 가 없으면 이게 강제된다.
	DefaultScope   DataScopeKind // 데이터 스코프 힌트(이번 PR 에서 enforcement 없음)
	Paths          []string      // chi 라우트 패턴. coverage_test 가 이 목록 ↔ 실제 chi 트리 일치를 검증한다.
}

// 카탈로그 ID 상수 — 라우트 정의에서 자유 문자열 대신 이 상수를 쓴다.
//
// 명명: domain.action[.qualifier] 도트 표기(D-120).
// 분류:
//   - master.*     : 마스터 CRUD (모든 테넌트 공유)
//   - tx.*         : 거래 트랜잭션
//   - calc.*       : Rust 계산엔진 프록시 (계산 결과 별로 게이트가 다름)
//   - baro.*       : BARO 전용 도메인
//   - intercompany.* : 그룹내 매입/요청 양방향
//   - crm.*        : CRM(BARO 전용 D-109)
//   - io.*         : 일괄 import/export
//   - ai.*         : AI 도우미·OCR
//   - sys.*        : 시스템·관리 (settings/users/notes/audit/...)
//   - engine.*     : Rust 엔진 헬스
const (
	// ---- master.* (all tenants) ----
	IDMasterBank             FeatureID = "master.bank"
	IDMasterCompany          FeatureID = "master.company"
	IDMasterCompanyAlias     FeatureID = "master.company_alias"
	IDMasterManufacturer     FeatureID = "master.manufacturer"
	IDMasterPartner          FeatureID = "master.partner"
	IDMasterPartnerAlias     FeatureID = "master.partner_alias"
	IDMasterProduct          FeatureID = "master.product"
	IDMasterProductAlias     FeatureID = "master.product_alias"
	IDMasterWarehouse        FeatureID = "master.warehouse"
	IDMasterConstructionSite FeatureID = "master.construction_site"

	// ---- tx.* (all tenants 공유) ----
	IDTxOrder                 FeatureID = "tx.order"
	IDTxOutbound              FeatureID = "tx.outbound"
	IDTxSale                  FeatureID = "tx.sale"
	IDTxReceipt               FeatureID = "tx.receipt"
	IDTxReceiptMatch          FeatureID = "tx.receipt_match"
	IDTxPO                    FeatureID = "tx.po"
	IDTxBL                    FeatureID = "tx.bl"
	IDTxInventoryAllocation   FeatureID = "tx.inventory_allocation"
	IDTxModuleDemandForecast  FeatureID = "tx.module_demand_forecast"

	// ---- tx.* (module 계열 = topsolar+cable, D-108/D-119) ----
	IDTxCostDetail   FeatureID = "tx.cost_detail"
	IDTxDeclaration  FeatureID = "tx.declaration"
	IDTxExpense      FeatureID = "tx.expense"
	IDTxLC           FeatureID = "tx.lc"
	IDTxLCLimit      FeatureID = "tx.lc_limit"
	IDTxPriceHistory FeatureID = "tx.price_history"
	IDTxTT           FeatureID = "tx.tt"

	// ---- intercompany.* (양방향) ----
	IDIntercompanyRequestBaro  FeatureID = "intercompany.request.baro"  // BARO 측 입력 액션
	IDIntercompanyRequestInbox FeatureID = "intercompany.request.inbox" // module 측 처리 액션

	// ---- crm.* (BARO 전용 D-109) ----
	IDCRMPartnerActivity FeatureID = "crm.partner_activity"

	// ---- baro.* (BARO 전용) ----
	IDBaroIncoming        FeatureID = "baro.incoming"
	IDBaroPurchaseHistory FeatureID = "baro.purchase_history"
	IDBaroCreditBoard     FeatureID = "baro.credit_board"
	IDBaroDispatch        FeatureID = "baro.dispatch"
	IDBaroOrders          FeatureID = "baro.orders"
	IDBaroPriceBook       FeatureID = "baro.price_book"

	// ---- calc.* (Rust 계산 프록시) ----
	IDCalcInventory          FeatureID = "calc.inventory"
	IDCalcLandedCost         FeatureID = "calc.landed_cost"
	IDCalcExchangeCompare    FeatureID = "calc.exchange_compare"
	IDCalcLCFee              FeatureID = "calc.lc_fee"
	IDCalcLCLimitTimeline    FeatureID = "calc.lc_limit_timeline"
	IDCalcLCMaturityAlert    FeatureID = "calc.lc_maturity_alert"
	IDCalcMarginAnalysis     FeatureID = "calc.margin_analysis"
	IDCalcCustomerAnalysis   FeatureID = "calc.customer_analysis"
	IDCalcPriceTrend         FeatureID = "calc.price_trend"
	IDCalcSupplyForecast     FeatureID = "calc.supply_forecast"
	IDCalcOutstandingList    FeatureID = "calc.outstanding_list"
	IDCalcReceiptMatchSugges FeatureID = "calc.receipt_match_suggest"
	IDCalcSearch             FeatureID = "calc.search"
	IDCalcInventoryTurnover  FeatureID = "calc.inventory_turnover"

	// ---- io.* ----
	IDIOImport         FeatureID = "io.import"
	IDIOExportAmaranth FeatureID = "io.export.amaranth"
	IDIOExportAll      FeatureID = "io.export.all" // admin 전용 통합 덤프

	// ---- ai.* ----
	IDAIAssistant FeatureID = "ai.assistant"
	IDAIOCR       FeatureID = "ai.ocr"

	// ---- sys.* ----
	IDSysAttachment     FeatureID = "sys.attachment"
	IDSysAuditLog       FeatureID = "sys.audit_log"
	IDSysLibraryPost    FeatureID = "sys.library_post"
	IDSysNote           FeatureID = "sys.note"
	IDSysSystemSettings FeatureID = "sys.system_settings"
	IDSysUIConfig       FeatureID = "sys.ui_config"
	IDSysUser           FeatureID = "sys.user"
	IDSysExternalSync   FeatureID = "sys.external_sync" // D-059

	// ---- engine.* ----
	IDEngineHealth FeatureID = "engine.health"
)

// Catalog — 모든 feature 정의의 단일 정본.
//
// 변경 시:
//   - Paths 는 chi 가 보고하는 패턴 그대로 적는다(예: "/api/v1/cost-details/", "/api/v1/cost-details/{id}").
//   - DefaultTenants 는 가능한 사전 정의 집합(TenantSetXxx)을 재사용한다.
//   - harness/FEATURE-WIRING-MATRIX.md 의 표를 같은 PR에서 갱신한다(테스트가 잡는다).
var Catalog = map[FeatureID]Feature{
	// ===== master.* =====
	IDMasterBank: {
		ID: IDMasterBank, Name: "은행 마스터", Description: "은행 마스터 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/banks/", "/api/v1/banks/{id}",
			"/api/v1/banks/{id}/status",
		},
	},
	IDMasterCompany: {
		ID: IDMasterCompany, Name: "법인 마스터", Description: "법인 마스터 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/companies/", "/api/v1/companies/{id}",
			"/api/v1/companies/{id}/status",
		},
	},
	IDMasterCompanyAlias: {
		ID: IDMasterCompanyAlias, Name: "법인 별칭", Description: "법인명 별칭 매핑(외부 양식 변환기 매핑)",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/company-aliases/"},
	},
	IDMasterManufacturer: {
		ID: IDMasterManufacturer, Name: "제조사 마스터", Description: "제조사 마스터 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/manufacturers/", "/api/v1/manufacturers/{id}",
			"/api/v1/manufacturers/{id}/status",
		},
	},
	IDMasterPartner: {
		ID: IDMasterPartner, Name: "거래처 마스터", Description: "거래처 마스터 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/partners/", "/api/v1/partners/{id}",
			"/api/v1/partners/{id}/status",
		},
	},
	IDMasterPartnerAlias: {
		ID: IDMasterPartnerAlias, Name: "거래처 별칭", Description: "거래처명 별칭 매핑 (D-057 출고+매출 자동등록 흐름)",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/partner-aliases/"},
	},
	IDMasterProduct: {
		ID: IDMasterProduct, Name: "품번 마스터", Description: "품번 마스터 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/products/", "/api/v1/products/{id}",
			"/api/v1/products/{id}/status",
		},
	},
	IDMasterProductAlias: {
		ID: IDMasterProductAlias, Name: "품번 별칭", Description: "품번 별칭 매핑(외부 양식 변환기 매핑)",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/product-aliases/"},
	},
	IDMasterWarehouse: {
		ID: IDMasterWarehouse, Name: "창고 마스터", Description: "창고 마스터 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/warehouses/", "/api/v1/warehouses/{id}",
			"/api/v1/warehouses/{id}/status",
		},
	},
	IDMasterConstructionSite: {
		ID: IDMasterConstructionSite, Name: "공사현장 마스터", Description: "자체/EPC 공사 현장",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/construction-sites/", "/api/v1/construction-sites/{id}",
			"/api/v1/construction-sites/{id}/status",
		},
	},

	// ===== tx.* (all tenants) =====
	IDTxOrder: {
		ID: IDTxOrder, Name: "수주", Description: "수주 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/orders/", "/api/v1/orders/{id}"},
	},
	IDTxOutbound: {
		ID: IDTxOutbound, Name: "출고", Description: "출고 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/outbounds/", "/api/v1/outbounds/{id}"},
	},
	IDTxSale: {
		ID: IDTxSale, Name: "매출", Description: "매출 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/sales/", "/api/v1/sales/{id}"},
	},
	IDTxReceipt: {
		ID: IDTxReceipt, Name: "수금", Description: "수금 CRUD",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/receipts/", "/api/v1/receipts/{id}"},
	},
	IDTxReceiptMatch: {
		ID: IDTxReceiptMatch, Name: "수금/매출 매칭", Description: "매칭 + 자동 매칭",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/receipt-matches/", "/api/v1/receipt-matches/{id}", "/api/v1/receipt-matches/auto"},
	},
	IDTxPO: {
		ID: IDTxPO, Name: "PO 발주", Description: "PO + 라인",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/pos/", "/api/v1/pos/{id}",
			"/api/v1/pos/{poId}/lines/", "/api/v1/pos/{poId}/lines/{id}",
		},
	},
	IDTxBL: {
		ID: IDTxBL, Name: "B/L 입고", Description: "B/L + 라인",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/bls/", "/api/v1/bls/{id}",
			"/api/v1/bls/{blId}/lines/", "/api/v1/bls/{blId}/lines/{id}",
		},
	},
	IDTxInventoryAllocation: {
		ID: IDTxInventoryAllocation, Name: "가용재고 배정", Description: "판매예정/공사예정 배정",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/inventory/allocations/", "/api/v1/inventory/allocations/{id}"},
	},
	IDTxModuleDemandForecast: {
		ID: IDTxModuleDemandForecast, Name: "수요 forecast", Description: "자체 공사/보정 수요",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/module-demand-forecasts/", "/api/v1/module-demand-forecasts/{id}"},
	},

	// ===== tx.* (module = topsolar+cable, D-108/D-119) =====
	IDTxCostDetail: {
		ID: IDTxCostDetail, Name: "수입 원가", Description: "수입 원가 명세 (module 계열)",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/cost-details/", "/api/v1/cost-details/{id}"},
	},
	IDTxDeclaration: {
		ID: IDTxDeclaration, Name: "수입 면장", Description: "수입 면장 (module 계열)",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/declarations/", "/api/v1/declarations/{id}"},
	},
	IDTxExpense: {
		ID: IDTxExpense, Name: "부대비용", Description: "부대비용 (module 계열)",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/expenses/", "/api/v1/expenses/{id}"},
	},
	IDTxLC: {
		ID: IDTxLC, Name: "L/C 신용장", Description: "L/C + 라인 (module 계열)",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/lcs/", "/api/v1/lcs/{id}", "/api/v1/lcs/{id}/lines"},
	},
	IDTxLCLimit: {
		ID: IDTxLCLimit, Name: "LC 한도 변경 이력", Description: "LC 한도 (module 계열, DELETE 없음)",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/limit-changes/"},
	},
	IDTxPriceHistory: {
		ID: IDTxPriceHistory, Name: "수입 단가 이력", Description: "단가 이력 (module 계열)",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/price-histories/", "/api/v1/price-histories/{id}"},
	},
	IDTxTT: {
		ID: IDTxTT, Name: "T/T 계약금", Description: "T/T (module 계열)",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/tts/", "/api/v1/tts/{id}"},
	},

	// ===== intercompany.* =====
	IDIntercompanyRequestBaro: {
		ID: IDIntercompanyRequestBaro, Name: "그룹내 매입 요청 (BARO 측)", Description: "BARO 측 입력/취소/입고확인",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeTenantOwned,
		Paths: []string{
			"/api/v1/intercompany-requests/mine",
			"/api/v1/intercompany-requests/",
			"/api/v1/intercompany-requests/{id}/cancel",
			"/api/v1/intercompany-requests/{id}/receive",
		},
	},
	IDIntercompanyRequestInbox: {
		ID: IDIntercompanyRequestInbox, Name: "그룹내 매입 요청 (module 측 inbox)", Description: "module 측 처리/거부/출고연결",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/intercompany-requests/inbox",
			"/api/v1/intercompany-requests/{id}/reject",
			"/api/v1/intercompany-requests/{id}/fulfill",
		},
	},

	// ===== crm.* (D-109 BARO 전용) =====
	IDCRMPartnerActivity: {
		ID: IDCRMPartnerActivity, Name: "CRM 거래처 활동", Description: "활동 로그 + 미처리 문의함",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeTenantOwned,
		Paths: []string{
			"/api/v1/partner-activities/",
			"/api/v1/partner-activities/{id}/followup",
			"/api/v1/me/open-followups",
			"/api/v1/partners/{id}/activities",
		},
	},

	// ===== baro.* =====
	IDBaroIncoming: {
		ID: IDBaroIncoming, Name: "BARO 입고예정", Description: "ETA·수량 read-only sanitized (D-116)",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeColumnMasked,
		Paths: []string{"/api/v1/baro/incoming/"},
	},
	IDBaroPurchaseHistory: {
		ID: IDBaroPurchaseHistory, Name: "BARO 자체 매입원가", Description: "BR 법인 원가 read-only (D-117)",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeTenantCompany,
		Paths: []string{"/api/v1/baro/purchase-history/"},
	},
	IDBaroCreditBoard: {
		ID: IDBaroCreditBoard, Name: "BARO 미수금/한도 보드", Description: "Phase 3",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeTenantCompany,
		Paths: []string{"/api/v1/baro/credit-board/"},
	},
	IDBaroDispatch: {
		ID: IDBaroDispatch, Name: "BARO 배차/일정", Description: "Phase 4",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeTenantOwned,
		Paths: []string{
			"/api/v1/baro/dispatch-routes/",
			"/api/v1/baro/dispatch-routes/{id}",
			"/api/v1/baro/dispatch-routes/{id}/outbounds",
			"/api/v1/baro/dispatch-routes/{id}/assign",
			"/api/v1/baro/dispatch-routes/unassign",
		},
	},
	IDBaroOrders: {
		ID: IDBaroOrders, Name: "BARO 빠른 재발주", Description: "최근 수주 + 클론",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeTenantCompany,
		Paths: []string{
			"/api/v1/baro/orders/recent",
			"/api/v1/baro/orders/{id}/clone",
		},
	},
	IDBaroPriceBook: {
		ID: IDBaroPriceBook, Name: "BARO 거래처별 단가표", Description: "Phase 1",
		DefaultTenants: TenantSetBaroOnly, DefaultScope: DataScopeTenantOwned,
		Paths: []string{
			"/api/v1/partner-prices/", "/api/v1/partner-prices/{id}",
			"/api/v1/partner-prices/lookup",
		},
	},

	// ===== calc.* =====
	IDCalcInventory: {
		ID: IDCalcInventory, Name: "재고 집계 계산", Description: "Rust 엔진 — 모든 테넌트",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/inventory"},
	},
	IDCalcLandedCost: {
		ID: IDCalcLandedCost, Name: "Landed Cost", Description: "Rust 엔진 — module 계열",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/landed-cost"},
	},
	IDCalcExchangeCompare: {
		ID: IDCalcExchangeCompare, Name: "환율 비교", Description: "Rust 엔진 — module 계열",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/exchange-compare"},
	},
	IDCalcLCFee: {
		ID: IDCalcLCFee, Name: "LC 수수료 계산", Description: "Rust 엔진 — module 계열",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/lc-fee"},
	},
	IDCalcLCLimitTimeline: {
		ID: IDCalcLCLimitTimeline, Name: "LC 한도 타임라인", Description: "Rust 엔진 — module 계열",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/lc-limit-timeline"},
	},
	IDCalcLCMaturityAlert: {
		ID: IDCalcLCMaturityAlert, Name: "LC 만기 알림", Description: "Rust 엔진 — module 계열",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/lc-maturity-alert"},
	},
	IDCalcMarginAnalysis: {
		ID: IDCalcMarginAnalysis, Name: "마진 분석", Description: "Rust 엔진 — module 계열",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/margin-analysis"},
	},
	IDCalcCustomerAnalysis: {
		ID: IDCalcCustomerAnalysis, Name: "거래처 분석", Description: "Rust 엔진 — 모든 테넌트",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/customer-analysis"},
	},
	IDCalcPriceTrend: {
		ID: IDCalcPriceTrend, Name: "단가 추이", Description: "Rust 엔진 — module 계열",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/price-trend"},
	},
	IDCalcSupplyForecast: {
		ID: IDCalcSupplyForecast, Name: "수급 전망", Description: "Rust 엔진 — 모든 테넌트",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/supply-forecast"},
	},
	IDCalcOutstandingList: {
		ID: IDCalcOutstandingList, Name: "미수금 리스트", Description: "Rust 엔진 — 모든 테넌트",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/outstanding-list"},
	},
	IDCalcReceiptMatchSugges: {
		ID: IDCalcReceiptMatchSugges, Name: "수금 매칭 추천", Description: "Rust 엔진 — 모든 테넌트",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/receipt-match-suggest"},
	},
	IDCalcSearch: {
		ID: IDCalcSearch, Name: "전역 검색", Description: "Rust 엔진 — 모든 테넌트",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/search"},
	},
	IDCalcInventoryTurnover: {
		ID: IDCalcInventoryTurnover, Name: "재고 회전율", Description: "Rust 엔진 — 모든 테넌트",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/calc/inventory-turnover"},
	},

	// ===== io.* =====
	IDIOImport: {
		ID: IDIOImport, Name: "엑셀 일괄 등록", Description: "9종 import write",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/import/inbound", "/api/v1/import/outbound", "/api/v1/import/sales",
			"/api/v1/import/declarations", "/api/v1/import/expenses", "/api/v1/import/orders",
			"/api/v1/import/receipts", "/api/v1/import/purchase-orders", "/api/v1/import/lcs",
		},
	},
	IDIOExportAmaranth: {
		ID: IDIOExportAmaranth, Name: "아마란스 RPA 연동", Description: "탑솔라 외부 시스템",
		DefaultTenants: TenantSetModule, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/export/amaranth/inbound",
			"/api/v1/export/amaranth/outbound",
			"/api/v1/export/amaranth/sales",
			"/api/v1/export/amaranth/rpa-package",
			"/api/v1/export/amaranth/jobs",
			"/api/v1/export/amaranth/jobs/{id}/download",
			"/api/v1/export/amaranth/outbound/jobs",
			"/api/v1/export/amaranth/jobs/{id}/claim",
			"/api/v1/export/amaranth/jobs/{id}/status",
		},
	},
	IDIOExportAll: {
		ID: IDIOExportAll, Name: "통합 데이터 덤프", Description: "admin 전용 전체 컬렉션 dump",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeTenantCompany,
		Paths: []string{"/api/v1/export/all"},
	},

	// ===== ai.* =====
	IDAIAssistant: {
		ID: IDAIAssistant, Name: "AI 도우미", Description: "Assistant 채팅 + 세션",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeTenantOwned,
		Paths: []string{
			"/api/v1/assistant/chat",
			"/api/v1/assistant/sessions", "/api/v1/assistant/sessions/{id}",
			"/api/v1/assistant/ocr/health", "/api/v1/assistant/ocr/extract",
			"/api/v1/assistant/match/receipts/auto",
			"/api/v1/assistant/proposals/{id}/confirm",
			"/api/v1/assistant/proposals/{id}/reject",
		},
	},
	IDAIOCR: {
		ID: IDAIOCR, Name: "AI OCR", Description: "OCR 추출",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/ocr/health", "/api/v1/ocr/extract"},
	},

	// ===== sys.* =====
	IDSysAttachment: {
		ID: IDSysAttachment, Name: "첨부파일", Description: "첨부 CRUD + 다운로드",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/attachments/",
			"/api/v1/attachments/{id}",
			"/api/v1/attachments/{id}/access",
			"/api/v1/attachments/{id}/download",
		},
	},
	IDSysAuditLog: {
		ID: IDSysAuditLog, Name: "감사 로그", Description: "read-only",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/audit-logs/"},
	},
	IDSysLibraryPost: {
		ID: IDSysLibraryPost, Name: "자료실", Description: "library_posts CRUD + 첨부 연결",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/library-posts/", "/api/v1/library-posts/{id}"},
	},
	IDSysNote: {
		ID: IDSysNote, Name: "포스트잇 메모", Description: "Step 31",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeTenantOwned,
		Paths: []string{"/api/v1/notes/", "/api/v1/notes/{id}"},
	},
	IDSysSystemSettings: {
		ID: IDSysSystemSettings, Name: "사이트 전역 설정", Description: "메뉴 가시성·공지 배너 등",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/system-settings/{key}"},
	},
	IDSysUIConfig: {
		ID: IDSysUIConfig, Name: "GUI 메타 편집기", Description: "UI 메타 정의 (admin 쓰기)",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/ui-configs/", "/api/v1/ui-configs/{scope}/{config_id}"},
	},
	IDSysUser: {
		ID: IDSysUser, Name: "사용자", Description: "/me + admin 사용자 관리",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/users/me", "/api/v1/users/me/password",
			"/api/v1/users/me/persona", "/api/v1/users/me/preferences",
			"/api/v1/users/", "/api/v1/users/{id}",
			"/api/v1/users/{id}/role", "/api/v1/users/{id}/active",
			"/api/v1/users/{id}/password",
		},
	},
	IDSysExternalSync: {
		ID: IDSysExternalSync, Name: "외부 동기화 소스",
		Description: "외부 시트(구글 시트 등) 단방향 동기화 — 수동 + 1시간 cron (D-059)",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{
			"/api/v1/external-sync-sources/",
			"/api/v1/external-sync-sources/{id}",
			"/api/v1/external-sync-sources/{id}/run",
			"/api/v1/external-format/google-sheet",
		},
	},

	// ===== engine.* =====
	IDEngineHealth: {
		ID: IDEngineHealth, Name: "Rust 엔진 헬스", Description: "/engine/health, /engine/ready",
		DefaultTenants: TenantSetAll, DefaultScope: DataScopeGlobal,
		Paths: []string{"/api/v1/engine/health", "/api/v1/engine/ready"},
	},
}

// Get — 안전한 카탈로그 조회.
func Get(id FeatureID) (Feature, bool) {
	f, ok := Catalog[id]
	return f, ok
}

// AllIDs — 카탈로그에 등록된 모든 feature_id.
func AllIDs() []FeatureID {
	out := make([]FeatureID, 0, len(Catalog))
	for id := range Catalog {
		out = append(out, id)
	}
	return out
}
