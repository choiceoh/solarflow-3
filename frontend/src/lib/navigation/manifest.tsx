// frontend/src/lib/navigation/manifest.tsx — 라우트 + 사이드바 단일 정본 (PR-3a)
//
// 같은 코드/DB 를 호스트네임으로 분기해 여러 앱(module/cable/baro/...)을 운영한다.
// 라우트 정의(`<Route>` 트리)와 사이드바 구성(`NAV_GROUPS`)이 흩어져 있으면 새 도메인을
// 붙일 때 두 군데 다 손대야 하고 sync 가 안 맞을 위험이 있다 — 이 모듈이 양쪽의 정본.
//
// PR-3a 범위:
//   - 라우트 spec(`ROUTES`)과 sidebar 구성(`NAV_GROUPS`) 을 이 파일에 모은다.
//   - 가시성 로직(tenants 인라인 배열) 은 기존 그대로 보존 — 회귀 위험 ↓.
//
// PR-3b(후속): NAV_GROUPS 의 `tenants:` 배열을 `feature.enabled_features` 기준으로
// 전환해 서버/UI sync 를 자동 보장한다.
import { lazy, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react';
import {
  BarChart3,
  Bell,
  Bot,
  Box,
  Calculator,
  ClipboardList,
  Database,
  FileSignature,
  FileSpreadsheet,
  History,
  Home,
  Inbox,
  Landmark,
  LibraryBig,
  type LucideIcon,
  PackagePlus,
  ReceiptText,
  ScrollText,
  ShieldAlert,
  Ship,
  Settings,
  Tags,
  TrendingUp,
  Trophy,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';

import type { MenuKey, Role } from '@/config/permissions';
import type { TenantScope } from '@/lib/tenantScope';

// === Lazy components ===
//
// App.tsx 의 인라인 lazy import 들을 그대로 옮긴다. PurchaseHistoryErrorBoundary 처럼
// `wrap` 으로 감싸야 하는 케이스는 RouteSpec 의 wrap 함수로 처리.
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const ProcurementPage = lazy(() => import('@/pages/ProcurementPage'));
const PurchaseHistoryPage = lazy(() => import('@/pages/PurchaseHistoryPage'));
const PriceForecastPage = lazy(() => import('@/pages/PriceForecastPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const CustomsPage = lazy(() => import('@/pages/CustomsPage'));
const SalesAnalysisPage = lazy(() => import('@/pages/SalesAnalysisPage'));
const BankingPage = lazy(() => import('@/pages/BankingPage'));
const ApprovalPage = lazy(() => import('@/pages/ApprovalPage'));
const SettingsLayout = lazy(() => import('@/pages/settings/SettingsLayout'));
const SettingsIndexRedirect = lazy(() =>
  import('@/pages/settings/SettingsLayout').then((m) => ({ default: m.SettingsIndexRedirect })),
);
const AdminSettingsPage = lazy(() => import('@/pages/settings/AdminSettingsPage'));
const DBIntegrityPage = lazy(() => import('@/pages/admin/DBIntegrityPage'));
const AuditLogsPage = lazy(() => import('@/pages/settings/AuditLogsPage'));
const PersonalSettingsPage = lazy(() => import('@/pages/settings/PersonalSettingsPage'));
const SitePlaceholderPage = lazy(() => import('@/pages/settings/SitePlaceholderPage'));
const AssistantPage = lazy(() => import('@/pages/AssistantPage'));
const ConstructionSitesPage = lazy(() => import('@/pages/masters/ConstructionSitesPage'));
const DataPage = lazy(() => import('@/pages/DataPage'));
const ImportHubPage = lazy(() => import('@/pages/ImportHubPage'));
const LibraryPage = lazy(() => import('@/pages/LibraryPage'));
const ManufacturerNewPage = lazy(() => import('@/pages/data/ManufacturerNewPage'));
const ManufacturerEditPage = lazy(() => import('@/pages/data/ManufacturerEditPage'));
const ProductNewPage = lazy(() => import('@/pages/data/ProductNewPage'));
const ProductEditPage = lazy(() => import('@/pages/data/ProductEditPage'));
const PartnerNewPage = lazy(() => import('@/pages/data/PartnerNewPage'));
const PartnerEditPage = lazy(() => import('@/pages/data/PartnerEditPage'));
const WarehouseNewPage = lazy(() => import('@/pages/data/WarehouseNewPage'));
const WarehouseEditPage = lazy(() => import('@/pages/data/WarehouseEditPage'));
const BankNewPage = lazy(() => import('@/pages/data/BankNewPage'));
const BankEditPage = lazy(() => import('@/pages/data/BankEditPage'));
const PartnerPriceBookPage = lazy(() => import('@/pages/baro/PartnerPriceBookPage'));
const PartnerCockpitPage = lazy(() => import('@/pages/baro/PartnerCockpitPage'));
const QuoteBuilderPage = lazy(() => import('@/pages/baro/QuoteBuilderPage'));
const SalesHomePage = lazy(() => import('@/pages/baro/SalesHomePage'));
const RFMBoardPage = lazy(() => import('@/pages/baro/RFMBoardPage'));
const SalesSummaryPage = lazy(() => import('@/pages/baro/SalesSummaryPage'));
const InverterGuidePage = lazy(() => import('@/pages/baro/InverterGuidePage'));
const ShipmentNoticePage = lazy(() => import('@/pages/baro/ShipmentNoticePage'));
const IncomingBoardPage = lazy(() => import('@/pages/baro/IncomingBoardPage'));
const BaroPurchaseHistoryPage = lazy(() => import('@/pages/baro/BaroPurchaseHistoryPage'));
const GroupPurchaseRequestPage = lazy(() => import('@/pages/baro/GroupPurchaseRequestPage'));
const BaroRequestInboxPage = lazy(() => import('@/pages/group-trade/BaroRequestInboxPage'));
const CreditBoardPage = lazy(() => import('@/pages/baro/CreditBoardPage'));
const DispatchBoardPage = lazy(() => import('@/pages/baro/DispatchBoardPage'));
const CRMInboxPage = lazy(() => import('@/pages/CRMInboxPage'));
const InsightsPage = lazy(() => import('@/pages/InsightsPage'));

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
import { PurchaseHistoryErrorBoundary } from '@/pages/PurchaseHistoryErrorBoundary';

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
  { path: '/group-trade/baro-inbox', element: BaroRequestInboxPage, roles: ['admin', 'operator'] },
  { path: '/baro/credit-board', element: CreditBoardPage },
  { path: '/baro/dispatch', element: DispatchBoardPage, roles: ['admin', 'operator'] },
  { path: '/crm/inbox', element: CRMInboxPage },
  { path: '/approval', element: ApprovalPage },
  { path: '/assistant', element: AssistantPage },
  {
    path: '/settings',
    element: SettingsLayout,
    children: [
      { index: true, element: SettingsIndexRedirect },
      { path: 'admin', element: AdminSettingsPage, roles: ['admin'] },
      { path: 'audit-logs', element: AuditLogsPage, roles: ['admin'] },
      { path: 'site', element: SitePlaceholderPage, roles: ['admin'] },
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

/** D-108/D-119: module 계열 = topsolar + cable. PR-3b 에서 feature 기반으로 대체 예정. */
export const MODULE_TENANTS: TenantScope[] = ['topsolar', 'cable'];

/**
 * NAV_GROUPS — sidebar 구성. 그룹 순서 = 사이드바 위→아래 표시 순서.
 *
 * 가시성:
 *   - feature 채움 → 서버 `enabled_features` 정본 사용 (PR-3b)
 *   - feature 비어 있고 tenants 만 있음 → 백엔드 카탈로그 미정의 페이지 fallback
 *   - 둘 다 없음 → 모든 테넌트 공통
 */
export const NAV_GROUPS: CommandNavGroup[] = [
  {
    items: [
      // D-127: BARO 영업 일일 홈 — 단순 프론트 페이지, 카탈로그 미정의 — tenants fallback.
      { key: 'baro-home', label: '영업 홈', abbr: '홈', path: '/baro/home', icon: Home, menu: 'baro_home', tenants: ['baro'] },
      { key: 'inventory', label: '가용재고', abbr: '재고', path: '/inventory', icon: Box, menu: 'inventory' },
    ],
  },
  {
    label: '구매',
    items: [
      { key: 'po', label: 'P/O 발주', abbr: 'PO', path: '/procurement', icon: ClipboardList, menu: 'procurement', feature: 'tx.po' },
      { key: 'lc', label: 'L/C 개설', abbr: 'LC', path: '/procurement?tab=lc', icon: Landmark, menu: 'lc', feature: 'tx.lc' },
      { key: 'bl', label: 'B/L 입고', abbr: 'BL', path: '/procurement?tab=bl', icon: Ship, menu: 'inbound', feature: 'tx.bl' },
      { key: 'customs', label: '면장/원가', abbr: '면장', path: '/customs', icon: Calculator, menu: 'inbound', feature: 'tx.declaration' },
      { key: 'baro-inbox', label: '그룹 요청', abbr: '그룹', path: '/group-trade/baro-inbox', icon: Inbox, menu: 'baro_inbox', feature: 'intercompany.request.inbox' },
      { key: 'baro-purchase', label: '그룹내 매입', abbr: '매입', path: '/baro/group-purchase', icon: PackagePlus, menu: 'baro_group_purchase', feature: 'intercompany.request.baro' },
      { key: 'baro-incoming', label: '입고예정', abbr: '입고', path: '/baro/incoming', icon: Ship, menu: 'baro_incoming', feature: 'baro.incoming' },
      { key: 'baro-purchase-history', label: '구매이력', abbr: '이력', path: '/baro/purchase-history', icon: ReceiptText, menu: 'baro_purchase_history', feature: 'baro.purchase_history' },
    ],
  },
  {
    label: '판매',
    items: [
      { key: 'orders', label: '수주 관리', abbr: '수주', path: '/orders', icon: ScrollText, menu: 'orders', feature: 'tx.order' },
      { key: 'outbound', label: '출고/판매', abbr: '출고', path: '/orders?tab=outbound', icon: Truck, menu: 'outbound', feature: 'tx.outbound' },
      { key: 'receipts', label: '수금 관리', abbr: '수금', path: '/orders?tab=receipts', icon: Wallet, menu: 'receipts', feature: 'tx.receipt' },
      { key: 'crm-inbox', label: '내 미처리 문의', abbr: '문의', path: '/crm/inbox', icon: Inbox, menu: 'crm_inbox', feature: 'crm.partner_activity' },
      { key: 'baro-cockpit', label: '거래처 360', abbr: '360', path: '/baro/cockpit', icon: Users, menu: 'baro_cockpit', feature: 'baro.partner_cockpit' },
      // D-126: 통합 견적 빌더 — 카탈로그 미정의 — tenants fallback.
      { key: 'baro-quote', label: '견적 빌더', abbr: '견적', path: '/baro/quote/new', icon: Calculator, menu: 'baro_quote', tenants: ['baro'] },
      // D-130: 인버터 호환 가이드 — 카탈로그 미정의 — tenants fallback.
      { key: 'baro-inverter', label: '인버터 가이드', abbr: '인버', path: '/baro/inverter-guide', icon: Zap, menu: 'baro_inverter', tenants: ['baro'] },
      // D-131: 출하 알림 메시지 빌더 — 카탈로그 미정의 — tenants fallback.
      { key: 'baro-shipment', label: '출하 알림', abbr: '알림', path: '/baro/shipment-notice', icon: Bell, menu: 'baro_shipment', tenants: ['baro'] },
      { key: 'baro-price-book', label: '거래처 단가표', abbr: '단가', path: '/baro/price-book', icon: Tags, menu: 'baro_price_book', feature: 'baro.price_book' },
      { key: 'baro-dispatch', label: '배차/일정', abbr: '배차', path: '/baro/dispatch', icon: Truck, menu: 'baro_dispatch', feature: 'baro.dispatch' },
    ],
  },
  {
    label: '현황',
    items: [
      { key: 'banking', label: 'L/C 한도', abbr: '한도', path: '/banking', icon: Landmark, menu: 'banking', feature: 'master.bank' },
      { key: 'analysis', label: '매출 분석', abbr: '분석', path: '/sales-analysis', icon: BarChart3, menu: 'customs', feature: 'calc.margin_analysis' },
      { key: 'purchase-history', label: '구매 이력', abbr: '이력', path: '/purchase-history', icon: History, menu: 'purchase_history', feature: 'tx.price_history' },
      { key: 'price-forecast', label: '가격예측', abbr: '가격', path: '/price-forecast', icon: TrendingUp, menu: 'price_forecast', feature: 'tx.price_benchmark' },
      { key: 'baro-credit', label: '미수금/한도', abbr: '미수', path: '/baro/credit-board', icon: ShieldAlert, menu: 'baro_credit', feature: 'baro.credit_board' },
      { key: 'baro-rfm', label: '거래처 RFM', abbr: 'RFM', path: '/baro/rfm', icon: Trophy, menu: 'baro_rfm', feature: 'baro.rfm' },
      { key: 'baro-sales-summary', label: '매출 요약', abbr: '매출', path: '/baro/sales-summary', icon: BarChart3, menu: 'baro_sales_summary', feature: 'baro.sales_summary' },
    ],
  },
  {
    label: '도구',
    items: [
      { key: 'import-hub', label: '엑셀 입력', abbr: '입력', path: '/import', icon: FileSpreadsheet, menu: 'import_hub', feature: 'io.import' },
      { key: 'data', label: '마스터', abbr: '기준', path: '/data', icon: Database, menu: 'masters' },
      { key: 'library', label: '자료실', abbr: '자료', path: '/library', icon: LibraryBig, menu: 'library', feature: 'sys.library_post' },
      { key: 'assistant', label: 'AI', abbr: 'AI', path: '/assistant', icon: Bot, menu: 'assistant', feature: 'ai.assistant' },
      // 결재안 — 카탈로그 미정의 — tenants fallback.
      { key: 'approval', label: '결재안', abbr: '결재', path: '/approval', icon: FileSignature, menu: 'approval', tenants: MODULE_TENANTS, isWip: true },
      { key: 'db-integrity', label: 'DB 정합성', abbr: '정합', path: '/admin/db-integrity', icon: ShieldAlert, menu: 'settings', feature: 'sys.db_integrity' },
      { key: 'settings', label: '설정', abbr: '설정', path: '/settings', icon: Settings, menu: 'settings', feature: 'sys.system_settings' },
    ],
  },
];

/**
 * isItemVisible — sidebar 항목의 가시성 판단 단일 정본 (PR-3b).
 *
 * - feature 가 있으면: enabledFeatures 가 그 ID 를 포함할 때만 visible
 * - feature 가 비어 있으면: tenants 배열 fallback (단순 프론트 페이지 / 카탈로그 미정의)
 *
 * enabledFeatures 가 undefined(서버 응답에 필드 없음 — 옛 백엔드 호환) 면
 * fallback 으로 tenants 배열을 본다. PR-2 이후 운영 백엔드는 항상 채워 보낸다.
 */
export function isItemVisible(item: CommandNavItem, currentTenant: TenantScope, enabledFeatures: ReadonlySet<string> | undefined): boolean {
  if (item.feature) {
    if (!enabledFeatures) {
      // 옛 응답 호환 — feature 정의는 있지만 서버가 enabled_features 를 안 보낸 경우.
      // tenants 배열이 동시에 있으면 그걸 쓰고, 둘 다 없으면 보임.
      return !item.tenants || item.tenants.includes(currentTenant);
    }
    return enabledFeatures.has(item.feature);
  }
  return !item.tenants || item.tenants.includes(currentTenant);
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
