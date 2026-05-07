import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  FileSpreadsheet,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from 'lucide-react';
import { NAV_GROUPS, isItemVisible } from '@/lib/navigation/manifest';
export { listAllMenusForTenant, listWipMenus } from '@/lib/navigation/manifest';
import { detectTenantScope } from '@/lib/tenantScope';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import AlertBell from '@/components/layout/AlertBell';
import FloatingMwEaCalculator from '@/components/common/FloatingMwEaCalculator';
import { FloatingAssistantButton } from '@/components/assistant/FloatingAssistantButton';
import { canAccessMenu, type Role } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import { useMenuVisibility } from '@/hooks/useMenuVisibility';
import { usePermission } from '@/hooks/usePermission';
import { useSidebarTabs } from '@/hooks/useSidebarTabs';
import { useUserPersona } from '@/hooks/useUserPersona';
import { useAppStore } from '@/stores/appStore';
import type { AlertItem } from '@/types/alerts';
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

const ROUTE_LABELS: Record<string, { title: string; breadcrumb: string }> = {
  '/inventory': { title: '가용재고', breadcrumb: '재고 / 예약 가능 수량' },
  '/procurement': { title: 'P/O 발주', breadcrumb: '구매 / 발주 관리' },
  '/purchase-history': { title: '구매 이력', breadcrumb: '현황 / 계약 체인 통합 타임라인' },
  '/customs': { title: '면장/원가', breadcrumb: '입고 / 원가 계산' },
  '/orders': { title: '수주 관리', breadcrumb: '판매 / 수주 및 수금' },
  '/banking': { title: 'L/C 한도', breadcrumb: '현황 / 은행 한도' },
  '/sales-analysis': { title: '매출 분석', breadcrumb: '현황 / 매출과 이익' },
  '/price-forecast': { title: '가격예측', breadcrumb: '현황 / 외부 가격 벤치마크' },
  '/crm/inbox': { title: '내 미처리 문의', breadcrumb: '판매 / 후속 답변 대기' },
  '/import': { title: '엑셀 입력', breadcrumb: '도구 / 일괄 가져오기' },
  '/library': { title: '자료실', breadcrumb: '도구 / 업무 자료' },
  '/approval': { title: '결재안', breadcrumb: '도구 / 결재 문안' },
  '/assistant': { title: 'AI', breadcrumb: '도구 / 채팅 어시스턴트' },
  '/settings': { title: '설정', breadcrumb: '시스템 / 설정' },
  '/settings/admin': { title: '관리자 설정', breadcrumb: '시스템 / 사용자 관리' },
  '/admin/db-integrity': { title: 'DB 정합성', breadcrumb: '운영 / 데이터 정합성 검증' },
  '/settings/audit-logs': { title: '관리자 로그', breadcrumb: '시스템 / 운영 데이터 변경 기록' },
  '/settings/site': { title: '사이트 설정', breadcrumb: '시스템 / 전역 설정' },
  '/settings/personal': { title: '개인 설정', breadcrumb: '시스템 / 내 계정' },
  '/baro/incoming': { title: '입고예정', breadcrumb: '구매 / ETA와 공급예정' },
  '/baro/purchase-history': { title: '구매이력', breadcrumb: '구매 / 자체 매입 원가' },
  '/baro/cockpit': { title: '거래처 360', breadcrumb: '판매 / 인바운드 응대 cockpit' },
  '/baro/quote/new': { title: '견적 빌더', breadcrumb: '판매 / 통합 견적 작성' },
  '/baro/home': { title: '영업 홈', breadcrumb: 'BARO / 일일 영업 보드' },
  '/baro/rfm': { title: '거래처 RFM', breadcrumb: '현황 / 12개월 매출 분류' },
  '/baro/sales-summary': { title: 'BARO 매출 요약', breadcrumb: '현황 / 영업담당자·유형·월별 매출' },
  '/baro/inverter-guide': { title: '인버터 가이드', breadcrumb: '판매 / 인버터 호환 카탈로그' },
  '/baro/shipment-notice': { title: '출하 알림', breadcrumb: '판매 / 카톡 메시지 빌더' },
  '/baro/callback-recommend': { title: '콜백 추천', breadcrumb: '판매 / owner 별 활성 거래처' },
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
  // D-108/D-119: 호스트네임으로 tenant 모드 결정 — feature 미정의 항목 fallback / UI 분기 (회사 스위처 등) 에 사용.
  // 보안 경계는 백엔드 RequireTenantScope, sidebar 가시성 정본은 user.enabled_features (PR-3b).
  const currentTenant = detectTenantScope();
  // PR-3b: 서버가 내려준 활성 feature 집합을 매번 set 으로 만들어 검사. user 가 없거나 옛 응답이면
  // undefined — isItemVisible 이 tenants 배열 fallback 으로 동작.
  const enabledFeatures = useMemo<ReadonlySet<string> | undefined>(
    () => (user?.enabled_features ? new Set(user.enabled_features) : undefined),
    [user?.enabled_features],
  );
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

        {currentTenant === 'topsolar' ? (
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
        ) : null}

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
                isItemVisible(item, currentTenant, enabledFeatures) &&
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
                      viewTransition
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
            <h1 className="sf-vt-page-title">{meta.title}</h1>
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
                viewTransition
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
