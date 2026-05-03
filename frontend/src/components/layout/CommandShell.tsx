import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  Box,
  Calculator,
  ClipboardList,
  FileSpreadsheet,
  FileSignature,
  History,
  Landmark,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Inbox,
  PackagePlus,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldAlert,
  Ship,
  Sun,
  Tags,
  Truck,
  Wallet,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { detectTenantScope, type TenantScope } from '@/lib/tenantScope';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import AlertBell from '@/components/layout/AlertBell';
import FloatingMwEaCalculator from '@/components/common/FloatingMwEaCalculator';
import { FloatingAssistantButton } from '@/components/assistant/FloatingAssistantButton';
import { canAccessMenu, type MenuKey, type Role } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { usePermission } from '@/hooks/usePermission';
import { useSidebarTabs } from '@/hooks/useSidebarTabs';
import { useUserPersona } from '@/hooks/useUserPersona';
import { useAppStore } from '@/stores/appStore';
import { useEffect, useMemo, useState } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'sf.sidebar.collapsed';
function readCollapsedFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
import type { AlertItem } from '@/types/alerts';

interface CommandNavItem {
  key: string;
  label: string;
  /** 사이드바 접힘 상태에서 아이콘 대신 노출할 2자 축약 (P/O, L/C 등 라틴은 2영문, 한글은 2자) */
  abbr: string;
  path: string;
  icon: LucideIcon;
  menu: MenuKey;
  count?: number;
  /** D-108: 표시 허용 테넌트. 미지정이면 모든 테넌트 공통. */
  tenants?: TenantScope[];
  /** 운영 검증 미완 — 사이트 설정 > 메뉴 가시성에서 admin이 끌 수 있는 대상 표시 */
  isWip?: boolean;
}

export interface SidebarMenuRegistryItem {
  key: string;
  label: string;
}

/** 사이트 설정 > 메뉴 가시성 카드가 토글 후보로 노출하는 항목 (NAV_GROUPS 평탄화 + isWip 필터) */
export function listWipMenus(): SidebarMenuRegistryItem[] {
  return NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => i.isWip)
    .map((i) => ({ key: i.key, label: i.label }));
}

/** D-112 사이드바 탭 카드가 메뉴 매핑 후보로 노출하는 항목 (현재 테넌트의 모든 NAV 메뉴) */
export function listAllMenusForTenant(tenant: TenantScope): SidebarMenuRegistryItem[] {
  return NAV_GROUPS.flatMap((g) => g.items)
    .filter((i) => !i.tenants || i.tenants.includes(tenant))
    .map((i) => ({ key: i.key, label: i.label }));
}

interface CommandNavGroup {
  label?: string;
  items: CommandNavItem[];
}

const NAV_GROUPS: CommandNavGroup[] = [
  {
    items: [
      { key: 'inventory', label: '가용재고', abbr: '재고', path: '/inventory', icon: Box, menu: 'inventory' },
    ],
  },
  {
    label: '구매',
    items: [
      // D-108: 탑솔라 수입 흐름 — 바로(주)에는 노출하지 않음
      { key: 'po', label: 'P/O 발주', abbr: 'PO', path: '/procurement', icon: ClipboardList, menu: 'procurement', tenants: ['topsolar'] },
      { key: 'lc', label: 'L/C 개설', abbr: 'LC', path: '/procurement?tab=lc', icon: Landmark, menu: 'lc', tenants: ['topsolar'] },
      { key: 'bl', label: 'B/L 입고', abbr: 'BL', path: '/procurement?tab=bl', icon: Ship, menu: 'inbound', tenants: ['topsolar'] },
      { key: 'customs', label: '면장/원가', abbr: '면장', path: '/customs', icon: Calculator, menu: 'inbound', tenants: ['topsolar'] },
      // BARO Phase 2: 탑솔라 측 — 바로(주)가 보낸 매입 요청 처리 inbox
      { key: 'baro-inbox', label: '그룹 요청', abbr: '그룹', path: '/group-trade/baro-inbox', icon: Inbox, menu: 'baro_inbox', tenants: ['topsolar'] },
      // BARO Phase 2: 바로(주) 측 — 탑솔라로부터 매입할 모듈을 등록
      { key: 'baro-purchase', label: '그룹내 매입', abbr: '매입', path: '/baro/group-purchase', icon: PackagePlus, menu: 'baro_group_purchase', tenants: ['baro'] },
      // BARO 영업용 — 가격·환율 없이 공급예정 ETA만 확인
      { key: 'baro-incoming', label: '입고예정', abbr: '입고', path: '/baro/incoming', icon: Ship, menu: 'baro_incoming', tenants: ['baro'] },
      // BARO 자체 구매 — 국내 타사/그룹내 매입 원가 이력
      { key: 'baro-purchase-history', label: '구매이력', abbr: '이력', path: '/baro/purchase-history', icon: ReceiptText, menu: 'baro_purchase_history', tenants: ['baro'] },
    ],
  },
  {
    label: '판매',
    items: [
      { key: 'orders', label: '수주 관리', abbr: '수주', path: '/orders', icon: ScrollText, menu: 'orders' },
      { key: 'outbound', label: '출고/판매', abbr: '출고', path: '/orders?tab=outbound', icon: Truck, menu: 'outbound' },
      { key: 'receipts', label: '수금 관리', abbr: '수금', path: '/orders?tab=receipts', icon: Wallet, menu: 'receipts' },
      // CRM 1차: 인바운드 후속 — 바로(주) 전용 (탑솔라는 인바운드 비중이 적어 미사용)
      { key: 'crm-inbox', label: '내 미처리 문의', abbr: '문의', path: '/crm/inbox', icon: Inbox, menu: 'crm_inbox', tenants: ['baro'] },
      // BARO Phase 1: 거래처별 단가표 (BARO 전용)
      { key: 'baro-price-book', label: '거래처 단가표', abbr: '단가', path: '/baro/price-book', icon: Tags, menu: 'baro_price_book', tenants: ['baro'] },
      // BARO Phase 4: 배차/일정 보드 (BARO 전용)
      { key: 'baro-dispatch', label: '배차/일정', abbr: '배차', path: '/baro/dispatch', icon: Truck, menu: 'baro_dispatch', tenants: ['baro'] },
    ],
  },
  {
    label: '현황',
    items: [
      // D-108: LC 한도/매출 분석은 탑솔라 전용 (원가 기반)
      { key: 'banking', label: 'L/C 한도', abbr: '한도', path: '/banking', icon: Landmark, menu: 'banking', tenants: ['topsolar'] },
      { key: 'analysis', label: '매출 분석', abbr: '분석', path: '/sales-analysis', icon: BarChart3, menu: 'customs', tenants: ['topsolar'] },
      // 구매 이력: PO/단가/변경계약 read-only 통합 타임라인 (탑솔라 모듈 수입 흐름 전용, executive 포함)
      { key: 'purchase-history', label: '구매 이력', abbr: '이력', path: '/purchase-history', icon: History, menu: 'purchase_history', tenants: ['topsolar'] },
      // BARO Phase 3: 거래처별 미수금/한도 보드 (BARO 전용)
      { key: 'baro-credit', label: '미수금/한도', abbr: '미수', path: '/baro/credit-board', icon: ShieldAlert, menu: 'baro_credit', tenants: ['baro'] },
    ],
  },
  {
    label: '도구',
    items: [
      { key: 'import-hub', label: '엑셀 입력', abbr: '입력', path: '/import', icon: FileSpreadsheet, menu: 'import_hub' },
      { key: 'assistant', label: 'AI', abbr: 'AI', path: '/assistant', icon: Bot, menu: 'assistant' },
      { key: 'approval', label: '결재안', abbr: '결재', path: '/approval', icon: FileSignature, menu: 'approval', tenants: ['topsolar'], isWip: true },
      // admin 전용 — 메타 config 시각 편집 (DB 영구 저장, 모든 사용자 영향)
      { key: 'ui-editor', label: 'UI 편집기', abbr: 'UI', path: '/ui-config-editor', icon: Wand2, menu: 'ui_editor' },
      { key: 'settings', label: '설정', abbr: '설정', path: '/settings', icon: Settings, menu: 'settings' },
    ],
  },
];

const ROUTE_LABELS: Record<string, { title: string; breadcrumb: string }> = {
  '/inventory': { title: '가용재고', breadcrumb: '재고 / 예약 가능 수량' },
  '/procurement': { title: 'P/O 발주', breadcrumb: '구매 / 발주 관리' },
  '/purchase-history': { title: '구매 이력', breadcrumb: '현황 / 계약 체인 통합 타임라인' },
  '/customs': { title: '면장/원가', breadcrumb: '입고 / 원가 계산' },
  '/orders': { title: '수주 관리', breadcrumb: '판매 / 수주 및 수금' },
  '/banking': { title: 'L/C 한도', breadcrumb: '현황 / 은행 한도' },
  '/sales-analysis': { title: '매출 분석', breadcrumb: '현황 / 매출과 이익' },
  '/crm/inbox': { title: '내 미처리 문의', breadcrumb: '판매 / 후속 답변 대기' },
  '/import': { title: '엑셀 입력', breadcrumb: '도구 / 일괄 가져오기' },
  '/approval': { title: '결재안', breadcrumb: '도구 / 결재 문안' },
  '/assistant': { title: 'AI', breadcrumb: '도구 / 채팅 어시스턴트' },
  '/settings': { title: '설정', breadcrumb: '시스템 / 설정' },
  '/settings/admin': { title: '관리자 설정', breadcrumb: '시스템 / 사용자 관리' },
  '/settings/site': { title: '사이트 설정', breadcrumb: '시스템 / 전역 설정' },
  '/settings/personal': { title: '개인 설정', breadcrumb: '시스템 / 내 계정' },
  '/baro/incoming': { title: '입고예정', breadcrumb: '구매 / ETA와 공급예정' },
  '/baro/purchase-history': { title: '구매이력', breadcrumb: '구매 / 자체 매입 원가' },
  '/ui-config-editor': { title: 'UI 편집기', breadcrumb: '도구 / 화면·폼 시각 편집 (admin)' },
};

function routeMeta(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  if (pathname === '/inventory') {
    const tab = params.get('tab');
    if (tab === 'physical') return { title: '실재고', breadcrumb: '재고 / 창고 보유 현재고' };
    if (tab === 'incoming') return { title: '미착품', breadcrumb: '재고 / L/C · B/L 예정분' };
    if (tab === 'forecast') return { title: '수급 전망', breadcrumb: '재고 / 6개월 흐름' };
  }
  if (pathname === '/procurement') {
    const tab = params.get('tab');
    if (tab === 'tt') return { title: '계약금', breadcrumb: '구매 / T/T 송금' };
    if (tab === 'lc') return { title: 'L/C 개설', breadcrumb: '구매 / 신용장' };
    if (tab === 'bl') return { title: 'B/L 입고', breadcrumb: '구매 / 선적과 입고' };
  }
  if (pathname === '/orders') {
    const tab = params.get('tab');
    if (tab === 'outbound') return { title: '출고/판매', breadcrumb: '판매 / 출고와 매출' };
    if (tab === 'sales') return { title: '판매/계산서', breadcrumb: '판매 / 세금계산서' };
    if (tab === 'receipts') return { title: '수금 관리', breadcrumb: '판매 / 입금 확인' };
    if (tab === 'matching') return { title: '수금매칭', breadcrumb: '판매 / 자동 추천' };
  }
  if (pathname === '/data' || pathname.startsWith('/data/')) return { title: '마스터 관리', breadcrumb: '기준정보 / 운영 기준' };
  return ROUTE_LABELS[pathname] ?? { title: 'SolarFlow', breadcrumb: 'Command Center' };
}

function isItemActive(itemPath: string, pathname: string, search: string) {
  const [base, query] = itemPath.split('?');
  if (query) return pathname === base && search === `?${query}`;
  if (base === '/inventory' || base === '/procurement' || base === '/orders') {
    return pathname === base && !search;
  }
  if (base === '/data') return pathname === '/data' || pathname.startsWith('/data/');
  if (base === '/settings') return pathname === '/settings' || pathname.startsWith('/settings/');
  return pathname === base;
}

function sumAlertCounts(alerts: AlertItem[], types: string[]) {
  const set = new Set(types);
  return alerts
    .filter((alert) => set.has(alert.type))
    .reduce((sum, alert) => sum + alert.count, 0);
}

export default function CommandShell() {
  const { pathname, search } = useLocation();
  const { user, role, logout } = useAuth();
  const { roleLabel } = usePermission();
  const { hidden: hiddenMenus } = useMenuVisibility();
  const r = role as Role | null;
  // D-108: 호스트네임으로 BARO 모드 결정 — 메뉴 가시성 분기에만 사용 (보안 경계는 백엔드 RequireTenantScope)
  const currentTenant = detectTenantScope();
  // D-112: admin이 정의한 사이드바 탭 — config 미존재면 탭 비활성 (현재 사이드바 그대로)
  const { config: tabsConfig } = useSidebarTabs(currentTenant);
  const { persona, setPersona } = useUserPersona();
  // 현재 선택 탭: user.persona가 탭 목록에 있으면 그것, 없으면 default_tab, 그래도 없으면 첫 번째
  const activeTabKey = useMemo(() => {
    if (!tabsConfig) return null;
    const fromPersona = persona ? tabsConfig.tabs.find((t) => t.key === persona) : undefined;
    const fromDefault = tabsConfig.tabs.find((t) => t.key === tabsConfig.default_tab);
    return (fromPersona ?? fromDefault ?? tabsConfig.tabs[0])?.key ?? null;
  }, [tabsConfig, persona]);
  const activeTab = useMemo(
    () => (tabsConfig && activeTabKey ? tabsConfig.tabs.find((t) => t.key === activeTabKey) ?? null : null),
    [tabsConfig, activeTabKey],
  );
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const { selectedCompanyId, setCompanyId } = useAppStore();
  const meta = routeMeta(pathname, search);
  const alertState = useAlerts(selectedCompanyId);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readCollapsedFromStorage);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };

  const selectedCompany = companies.find((c) => c.company_id === selectedCompanyId);
  const userInitial = (user?.name || user?.email || 'S').trim().slice(0, 1).toUpperCase();
  const navCounts = useMemo(() => ({
    inventory: sumAlertCounts(alertState.alerts, ['longterm_warning', 'longterm_critical']),
    lc: sumAlertCounts(alertState.alerts, ['lc_maturity', 'lc_shortage']),
    bl: sumAlertCounts(alertState.alerts, ['eta_soon']),
    orders: sumAlertCounts(alertState.alerts, ['delivery_soon', 'no_site']),
    outbound: sumAlertCounts(alertState.alerts, ['no_invoice']),
    receipts: sumAlertCounts(alertState.alerts, ['overdue_warning', 'overdue_critical']),
    banking: sumAlertCounts(alertState.alerts, ['lc_maturity', 'lc_shortage']),
  }), [alertState.alerts]);

  return (
    <div className="sf-shell" data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}>
      <aside className="sf-sidebar" aria-label="주요 메뉴">
        <div className="sf-sidebar-logo">
          <span className="sf-solar-mark" aria-hidden>
            <Sun strokeWidth={2.4} />
          </span>
          <Link to="/inventory" className="sf-sidebar-logo-text min-w-0">
            <div className="text-[13.5px] font-bold leading-none">SolarFlow</div>
          </Link>
          <button
            type="button"
            className="sf-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>
        </div>

        <div className="sf-company-switcher">
          <div className="sf-eyebrow mb-1.5 text-[var(--sf-dark-ink-3)]">법인</div>
          <Select value={selectedCompanyId || 'all'} onValueChange={setCompanyId}>
            <SelectTrigger>
              <span className="truncate text-left">{selectedCompany?.company_name ?? '전체'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.company_id} value={company.company_id}>
                  {company.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {tabsConfig && !sidebarCollapsed ? (
          <div className="sf-sidebar-tabs" role="tablist" aria-label="사이드바 탭">
            {tabsConfig.tabs.map((tab) => {
              const isActive = tab.key === activeTabKey;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="sf-sidebar-tab"
                  data-active={isActive}
                  onClick={() => {
                    if (!isActive) void setPersona(tab.key);
                  }}
                  title={tab.label}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <nav className="sf-sidebar-nav" aria-label="주요 메뉴 목록">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter(
              (item) =>
                canAccessMenu(r, item.menu) &&
                (!item.tenants || item.tenants.includes(currentTenant)) &&
                !hiddenMenus.has(item.key) &&
                // D-112: 활성 탭이 있으면 그 탭의 menus 화이트리스트, "all"이면 통과
                (!activeTab || activeTab.menus === 'all' || activeTab.menus.includes(item.key)),
            );
            if (visibleItems.length === 0) return null;
            return (
              <div className="sf-nav-group" key={group.label ?? 'root'}>
                {group.label ? <div className="sf-nav-section">{group.label}</div> : null}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.path, pathname, search);
                  const count = navCounts[item.key as keyof typeof navCounts] ?? item.count;
                  return (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      className="sf-nav-link"
                      data-active={active}
                      data-tooltip={item.label}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      {sidebarCollapsed ? (
                        <span className="sf-nav-abbr">{item.abbr}</span>
                      ) : (
                        <>
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="sf-nav-label min-w-0 flex-1 truncate">{item.label}</span>
                          {count ? <span className="sf-nav-badge">{count}</span> : null}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sf-sidebar-user">
          <div className="sf-sidebar-avatar">{userInitial}</div>
          <div className="sf-sidebar-user-info min-w-0 flex-1">
            <div className="truncate text-xs font-bold">{user?.name || user?.email || 'SolarFlow'}</div>
            <div className="sf-mono mt-0.5 truncate text-[9.5px] text-[var(--sf-dark-ink-3)]">{roleLabel}</div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-[var(--sf-dark-ink-3)] transition hover:bg-white/5 hover:text-[var(--sf-dark-ink)]"
            onClick={logout}
            aria-label="로그아웃"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      <section className="sf-main-shell">
        <header className="sf-topbar">
          <div className="sf-topbar-title">
            <h1>{meta.title}</h1>
            <div id="sf-command-title-slot" className="sf-topbar-command-title" />
          </div>

          <div id="sf-command-topline-slot" className="sf-topbar-command" />

          <div className="sf-topbar-actions">
            <FloatingMwEaCalculator />
            <AlertBell
              alerts={alertState.alerts}
              totalCount={alertState.totalCount}
              criticalCount={alertState.criticalCount}
            />
            {canAccessMenu(r, 'import_hub') && (
              <Link
                to="/import"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--bg-2)]"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-[var(--ink-3)]" />
                엑셀 입력
              </Link>
            )}
          </div>
        </header>

        <main className="sf-page-scroll">
          <Outlet />
        </main>
      </section>
      <FloatingAssistantButton />
    </div>
  );
}
