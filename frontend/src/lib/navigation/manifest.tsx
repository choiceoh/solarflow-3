// frontend/src/lib/navigation/manifest.tsx — 라우트 + 사이드바 단일 정본
//
// 같은 코드/DB 를 호스트네임으로 분기해 여러 앱(module/cable/baro/...)을 운영한다.
// 라우트(`<Route>` 트리) + 사이드바(`NAV_GROUPS`) 가 흩어지면 새 도메인을 붙일 때
// sync 가 안 맞아 위험 — 이 모듈이 양쪽의 정본.
//
// 이력:
//   - PR-3a: ROUTES + NAV_GROUPS 를 이 파일에 통합
//   - PR-3b: NAV item 가시성을 서버 enabled_features 정본으로 전환
//   - PR-4 : NAV_GROUPS 를 packs/ 디렉토리 (erp-core / module-finance / baro-domain)
//            로 split. 이 파일은 ROUTES + 합친 NAV_GROUPS 만 export.
import { lazy, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';

import type { MenuKey, Role } from '@/config/permissions';
import type { TenantScope } from '@/lib/tenantScope';
// PR-4: NAV_GROUPS 는 pack 들의 nav items 를 합쳐 만든다.
// PR-7: packs/ 가 lib/navigation 에서 frontend/src/packs 로 승격 — pack 디렉토리가
// 자기 페이지 코드(pages/) 도 가짐. 순환 import 회피를 위해 packs/ 가 manifest 에서
// type 만 가져오게 한 invariant 유지.
import { ALL_PACKS, buildNavGroups } from '@/packs';

// === Lazy components ===
//
// PR-7 / PR-11: 페이지 코드는 packs/<id>/pages/ 디렉토리 안에 있다.
// erp-core (모든 테넌트 공통), module-finance (수입/금융), baro-domain (BARO).
// settings/* 는 시스템 공통이라 packs 외부 유지.
const InventoryPage = lazy(() => import('@/packs/erp-core/pages/InventoryPage'));
const OrdersPage = lazy(() => import('@/packs/erp-core/pages/OrdersPage'));
const DataPage = lazy(() => import('@/packs/erp-core/pages/DataPage'));
const LibraryPage = lazy(() => import('@/packs/erp-core/pages/LibraryPage'));
const ImportHubPage = lazy(() => import('@/packs/erp-core/pages/ImportHubPage'));
const AssistantPage = lazy(() => import('@/packs/erp-core/pages/AssistantPage'));
const InsightsPage = lazy(() => import('@/packs/erp-core/pages/InsightsPage'));
const ConstructionSitesPage = lazy(() => import('@/packs/erp-core/pages/masters/ConstructionSitesPage'));
const DBIntegrityPage = lazy(() => import('@/packs/erp-core/pages/admin/DBIntegrityPage'));
const ManufacturerNewPage = lazy(() => import('@/packs/erp-core/pages/data/ManufacturerNewPage'));
const ManufacturerEditPage = lazy(() => import('@/packs/erp-core/pages/data/ManufacturerEditPage'));
const ProductNewPage = lazy(() => import('@/packs/erp-core/pages/data/ProductNewPage'));
const ProductEditPage = lazy(() => import('@/packs/erp-core/pages/data/ProductEditPage'));
const PartnerNewPage = lazy(() => import('@/packs/erp-core/pages/data/PartnerNewPage'));
const PartnerEditPage = lazy(() => import('@/packs/erp-core/pages/data/PartnerEditPage'));
const WarehouseNewPage = lazy(() => import('@/packs/erp-core/pages/data/WarehouseNewPage'));
const WarehouseEditPage = lazy(() => import('@/packs/erp-core/pages/data/WarehouseEditPage'));
const BankNewPage = lazy(() => import('@/packs/erp-core/pages/data/BankNewPage'));
const BankEditPage = lazy(() => import('@/packs/erp-core/pages/data/BankEditPage'));

const ProcurementPage = lazy(() => import('@/packs/module-finance/pages/ProcurementPage'));
const CustomsPage = lazy(() => import('@/packs/module-finance/pages/CustomsPage'));
const SalesAnalysisPage = lazy(() => import('@/packs/module-finance/pages/SalesAnalysisPage'));
const BankingPage = lazy(() => import('@/packs/module-finance/pages/BankingPage'));
const PriceForecastPage = lazy(() => import('@/packs/module-finance/pages/PriceForecastPage'));
const PurchaseHistoryPage = lazy(() => import('@/packs/module-finance/pages/PurchaseHistoryPage'));
const ApprovalPage = lazy(() => import('@/packs/module-finance/pages/ApprovalPage'));

// settings/* 는 시스템 공통이라 그대로.
const SettingsLayout = lazy(() => import('@/packs/erp-core/pages/settings/SettingsLayout'));
const SettingsIndexRedirect = lazy(() =>
  import('@/packs/erp-core/pages/settings/SettingsLayout').then((m) => ({ default: m.SettingsIndexRedirect })),
);
const AdminSettingsPage = lazy(() => import('@/packs/erp-core/pages/settings/AdminSettingsPage'));
const AuditLogsPage = lazy(() => import('@/packs/erp-core/pages/settings/AuditLogsPage'));
const PersonalSettingsPage = lazy(() => import('@/packs/erp-core/pages/settings/PersonalSettingsPage'));
const SitePlaceholderPage = lazy(() => import('@/packs/erp-core/pages/settings/SitePlaceholderPage'));
const FeatureMatrixPage = lazy(() => import('@/packs/erp-core/pages/settings/FeatureMatrixPage'));
const PartnerPriceBookPage = lazy(() => import('@/packs/baro-domain/pages/PartnerPriceBookPage'));
const PartnerCockpitPage = lazy(() => import('@/packs/baro-domain/pages/PartnerCockpitPage'));
const QuoteBuilderPage = lazy(() => import('@/packs/baro-domain/pages/QuoteBuilderPage'));
const SalesHomePage = lazy(() => import('@/packs/baro-domain/pages/SalesHomePage'));
const RFMBoardPage = lazy(() => import('@/packs/baro-domain/pages/RFMBoardPage'));
const SalesSummaryPage = lazy(() => import('@/packs/baro-domain/pages/SalesSummaryPage'));
const InverterGuidePage = lazy(() => import('@/packs/baro-domain/pages/InverterGuidePage'));
const ShipmentNoticePage = lazy(() => import('@/packs/baro-domain/pages/ShipmentNoticePage'));
const IncomingBoardPage = lazy(() => import('@/packs/baro-domain/pages/IncomingBoardPage'));
const BaroPurchaseHistoryPage = lazy(() => import('@/packs/baro-domain/pages/BaroPurchaseHistoryPage'));
const GroupPurchaseRequestPage = lazy(() => import('@/packs/baro-domain/pages/GroupPurchaseRequestPage'));
const CallbackRecommendPage = lazy(() => import('@/packs/baro-domain/pages/CallbackRecommendPage'));
const BaroRequestInboxPage = lazy(() => import('@/packs/baro-domain/pages/BaroRequestInboxPage'));
const CreditBoardPage = lazy(() => import('@/packs/baro-domain/pages/CreditBoardPage'));
const DispatchBoardPage = lazy(() => import('@/packs/baro-domain/pages/DispatchBoardPage'));
const CRMInboxPage = lazy(() => import('@/packs/baro-domain/pages/CRMInboxPage'));
const StudyLearningPage = lazy(() => import('@/packs/study-domain/pages/StudyLearningPage'));
// WMS — 모든 테넌트 공유 (D-139~142). 폴리싱 PR.
const WarehouseLocationsPage = lazy(() => import('@/packs/erp-core/pages/wms/WarehouseLocationsPage'));
const PickingWorkPage = lazy(() => import('@/packs/erp-core/pages/wms/PickingWorkPage'));
const ReceivingLogPage = lazy(() => import('@/packs/erp-core/pages/wms/ReceivingLogPage'));
const CycleCountPage = lazy(() => import('@/packs/erp-core/pages/wms/CycleCountPage'));

// === Route spec ===

/**
 * 라우트 한 항목.
 *
 * 일반 라우트는 path/element 만 채우면 된다.
 * - roles: RoleGuard 로 감싸기
 * - wrap: ErrorBoundary 같은 wrapper 감싸기 (children 받아 ReactElement 반환)
 * - children: settings 같은 nested layout — index 또는 path 한 개씩 받음
 */
export type RouteSpec = {
  path: string;
  element: LazyExoticComponent<ComponentType<unknown>>;
  roles?: Role[];
  wrap?: (children: ReactElement) => ReactElement;
  children?: NestedRouteSpec[];
};

export type NestedRouteSpec = {
  /** path 또는 index 중 하나만 — react-router 의 두 양태에 매핑. */
  path?: string;
  index?: boolean;
  element: LazyExoticComponent<ComponentType<unknown>>;
  roles?: Role[];
};

// PurchaseHistoryErrorBoundary 는 lazy 가 아니라 named export 라 직접 import.
import { PurchaseHistoryErrorBoundary } from '@/packs/module-finance/pages/PurchaseHistoryErrorBoundary';

/**
 * ROUTES — App.tsx 가 자동 렌더하는 라우트 목록.
 *
 * 비-목표:
 *   - login, AppLayout 외곽, ProtectedRoute, "*" → /login redirect 같은 wrapper 라우트는
 *     이 목록에 안 넣고 App.tsx 에 인라인 유지 (구조적 라우트라 manifest 가 다루기 어려움).
 *   - LegacyRedirect (/inbound, /lc, /outbound) 는 App.tsx 에 인라인 유지.
 *   - / index, /dashboard redirect 도 인라인.
 */
export const ROUTES: RouteSpec[] = [
  { path: '/inventory', element: InventoryPage },
  { path: '/admin/db-integrity', element: DBIntegrityPage, roles: ['admin', 'operator'] },
  { path: '/import', element: ImportHubPage, roles: ['admin', 'operator'] },
  { path: '/library', element: LibraryPage },
  { path: '/data', element: DataPage, roles: ['admin', 'operator'] },
  { path: '/data/manufacturers/new', element: ManufacturerNewPage, roles: ['admin', 'operator'] },
  { path: '/data/manufacturers/:id/edit', element: ManufacturerEditPage, roles: ['admin', 'operator'] },
  { path: '/data/products/new', element: ProductNewPage, roles: ['admin', 'operator'] },
  { path: '/data/products/:id/edit', element: ProductEditPage, roles: ['admin', 'operator'] },
  { path: '/data/partners/new', element: PartnerNewPage, roles: ['admin', 'operator'] },
  { path: '/data/partners/:id/edit', element: PartnerEditPage, roles: ['admin', 'operator'] },
  { path: '/data/warehouses/new', element: WarehouseNewPage, roles: ['admin', 'operator'] },
  { path: '/data/warehouses/:id/edit', element: WarehouseEditPage, roles: ['admin', 'operator'] },
  { path: '/data/banks/new', element: BankNewPage, roles: ['admin', 'operator'] },
  { path: '/data/banks/:id/edit', element: BankEditPage, roles: ['admin', 'operator'] },
  { path: '/masters/construction-sites', element: ConstructionSitesPage },
  { path: '/procurement', element: ProcurementPage },
  {
    path: '/purchase-history',
    element: PurchaseHistoryPage,
    wrap: (c) => <PurchaseHistoryErrorBoundary>{c}</PurchaseHistoryErrorBoundary>,
  },
  { path: '/price-forecast', element: PriceForecastPage, roles: ['admin', 'operator', 'executive'] },
  { path: '/orders', element: OrdersPage },
  { path: '/customs', element: CustomsPage },
  { path: '/sales-analysis', element: SalesAnalysisPage },
  { path: '/banking', element: BankingPage },
  { path: '/insights/:metric', element: InsightsPage },
  { path: '/baro/price-book', element: PartnerPriceBookPage, roles: ['admin', 'operator'] },
  { path: '/baro/cockpit', element: PartnerCockpitPage },
  { path: '/baro/quote/new', element: QuoteBuilderPage, roles: ['admin', 'operator'] },
  { path: '/baro/home', element: SalesHomePage },
  { path: '/baro/rfm', element: RFMBoardPage },
  { path: '/baro/sales-summary', element: SalesSummaryPage, roles: ['admin', 'operator', 'executive'] },
  { path: '/baro/inverter-guide', element: InverterGuidePage },
  { path: '/baro/shipment-notice', element: ShipmentNoticePage },
  { path: '/baro/incoming', element: IncomingBoardPage },
  { path: '/baro/purchase-history', element: BaroPurchaseHistoryPage, roles: ['admin', 'operator', 'executive'] },
  { path: '/baro/group-purchase', element: GroupPurchaseRequestPage, roles: ['admin', 'operator'] },
  { path: '/baro/callback-recommend', element: CallbackRecommendPage },
  { path: '/group-trade/baro-inbox', element: BaroRequestInboxPage, roles: ['admin', 'operator'] },
  { path: '/baro/credit-board', element: CreditBoardPage },
  { path: '/baro/dispatch', element: DispatchBoardPage, roles: ['admin', 'operator'] },
  { path: '/crm/inbox', element: CRMInboxPage },
  { path: '/study/learning', element: StudyLearningPage },
  { path: '/approval', element: ApprovalPage },
  { path: '/assistant', element: AssistantPage },
  // WMS — 모든 테넌트 공유 (D-139~142)
  { path: '/wms/locations', element: WarehouseLocationsPage, roles: ['admin', 'operator'] },
  { path: '/wms/picking', element: PickingWorkPage, roles: ['admin', 'operator'] },
  { path: '/wms/receiving', element: ReceivingLogPage, roles: ['admin', 'operator'] },
  { path: '/wms/cycle-count', element: CycleCountPage, roles: ['admin', 'operator', 'executive'] },
  {
    path: '/settings',
    element: SettingsLayout,
    children: [
      { index: true, element: SettingsIndexRedirect },
      { path: 'admin', element: AdminSettingsPage, roles: ['admin'] },
      { path: 'audit-logs', element: AuditLogsPage, roles: ['admin'] },
      { path: 'site', element: SitePlaceholderPage, roles: ['admin'] },
      { path: 'feature-wiring', element: FeatureMatrixPage, roles: ['admin'] },
      { path: 'personal', element: PersonalSettingsPage },
    ],
  },
];

// === Sidebar nav ===

export interface CommandNavItem {
  key: string;
  label: string;
  /** 사이드바 접힘 상태에서 아이콘 대신 노출할 2자 축약 (P/O, L/C 등 라틴은 2영문, 한글은 2자) */
  abbr: string;
  path: string;
  icon: LucideIcon;
  menu: MenuKey;
  count?: number;
  /**
   * PR-3b: 가시성 정본은 서버 `/me` 의 `enabled_features` (D-120 카탈로그 기반).
   *
   * - feature 가 채워져 있으면: `enabled_features` 가 그 ID 를 포함할 때만 노출
   * - feature 가 비어 있으면: tenants 배열로 fallback (단순 프론트 페이지 / 카탈로그 미정의)
   *
   * 두 필드는 mutually exclusive 가 아니다 — feature 를 우선 평가하고 안 매칭이면
   * tenants 로 fallback 하지 않는다(서버가 false 라고 판단했으면 false).
   */
  feature?: string;
  /** D-108: 표시 허용 테넌트. feature 미지정 항목의 fallback 으로만 사용. */
  tenants?: TenantScope[];
  /** 운영 검증 미완 — 사이트 설정 > 메뉴 가시성에서 admin이 끌 수 있는 대상 표시 */
  isWip?: boolean;
}

export interface CommandNavGroup {
  label?: string;
  items: CommandNavItem[];
}

export interface SidebarMenuRegistryItem {
  key: string;
  label: string;
}

/**
 * MODULE_TENANTS — D-108/D-119 module 계열 = topsolar + cable.
 *
 * 정본은 lib/tenantScope.ts (PR-4 의 packs/ 분리 후 circular dep 회피).
 * 외부 호출자 호환을 위해 manifest 에서도 같은 이름으로 re-export.
 */
export { MODULE_TENANTS } from '@/lib/tenantScope';

/**
 * NAV_GROUPS — sidebar 구성. 그룹 순서 = 사이드바 위→아래 표시 순서.
 *
 * PR-4: 인라인 정의 대신 packs/ 디렉토리의 pack 들 (erp-core / module-finance /
 * baro-domain) 을 합쳐 빌드한다. 각 pack 의 NAV item 이 group 필드를 가지므로
 * buildNavGroups 가 그룹별로 재구성한다.
 *
 * 가시성:
 *   - feature 채움 → 서버 `enabled_features` 정본 사용 (PR-3b)
 *   - feature 비어 있고 tenants 만 있음 → 백엔드 카탈로그 미정의 페이지 fallback
 *   - 둘 다 없음 → 모든 테넌트 공통
 */
export const NAV_GROUPS: CommandNavGroup[] = buildNavGroups(ALL_PACKS);

/**
 * isItemVisible — sidebar 항목의 가시성 판단 단일 정본 (PR-3b).
 *
 * - tenants 가 있으면: 현재 호스트 테넌트가 포함될 때만 visible
 * - feature 가 있으면: enabledFeatures 가 그 ID 를 포함할 때만 visible
 * - feature 가 비어 있으면: tenants 배열만으로 판단 (단순 프론트 페이지 / 카탈로그 미정의)
 *
 * enabledFeatures 가 undefined(서버 응답에 필드 없음 — 옛 백엔드 호환) 면 feature 는 통과시키되,
 * tenants 도메인 가드는 그대로 적용한다. PR-2 이후 운영 백엔드는 항상 채워 보낸다.
 */
export function isItemVisible(item: CommandNavItem, currentTenant: TenantScope, enabledFeatures: ReadonlySet<string> | undefined): boolean {
  if (item.tenants && !item.tenants.includes(currentTenant)) {
    return false;
  }
  if (item.feature) {
    if (!enabledFeatures) {
      // 옛 응답 호환 — feature 정의는 있지만 서버가 enabled_features 를 안 보낸 경우.
      // tenant 가드는 위에서 이미 통과했다. 별도 도메인 제한이 없으면 레거시처럼 보인다.
      return true;
    }
    return enabledFeatures.has(item.feature);
  }
  return true;
}

/** 사이트 설정 > 메뉴 가시성 카드가 토글 후보로 노출하는 항목 (NAV_GROUPS 평탄화 + isWip 필터) */
export function listWipMenus(): SidebarMenuRegistryItem[] {
  return NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => i.isWip)
    .map((i) => ({ key: i.key, label: i.label }));
}

/**
 * D-112 사이드바 탭 카드가 메뉴 매핑 후보로 노출하는 항목.
 *
 * PR-3b: enabled_features 알면 그걸로 필터, 모르면 tenants 배열 fallback.
 * 호출 측이 enabledFeatures 를 안 넘기면 tenants 배열로만 — 옛 호출자 호환.
 */
export function listAllMenusForTenant(
  tenant: TenantScope,
  enabledFeatures?: ReadonlySet<string>,
): SidebarMenuRegistryItem[] {
  return NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => isItemVisible(i, tenant, enabledFeatures))
    .map((i) => ({ key: i.key, label: i.label }));
}
