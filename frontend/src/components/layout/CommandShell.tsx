import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Box,
  Calculator,
  ClipboardList,
  Database,
  FileSignature,
  Landmark,
  LogOut,
  ScanText,
  ScrollText,
  Search,
  Settings,
  Ship,
  StickyNote,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import GlobalSearchBar from '@/components/search/GlobalSearchBar';
import AlertBell from '@/components/layout/AlertBell';
import QuickRegister from '@/components/layout/QuickRegister';
import FloatingMwEaCalculator from '@/components/common/FloatingMwEaCalculator';
import { canAccessMenu, type MenuKey, type Role } from '@/config/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import { usePermission } from '@/hooks/usePermission';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { useEffect, useMemo } from 'react';
import type { AlertItem } from '@/types/dashboard';

interface CommandNavItem {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  menu: MenuKey;
  count?: number;
}

interface CommandNavGroup {
  label?: string;
  items: CommandNavItem[];
}

const NAV_GROUPS: CommandNavGroup[] = [
  {
    items: [
      { key: 'inventory', label: '가용재고', path: '/inventory', icon: Box, menu: 'inventory' },
      { key: 'dashboard', label: '대시보드', path: '/dashboard', icon: BarChart3, menu: 'dashboard' },
    ],
  },
  {
    label: '구매',
    items: [
      { key: 'po', label: 'P/O 발주', path: '/procurement', icon: ClipboardList, menu: 'procurement' },
      { key: 'lc', label: 'L/C 개설', path: '/procurement?tab=lc', icon: Landmark, menu: 'lc' },
      { key: 'bl', label: 'B/L 입고', path: '/procurement?tab=bl', icon: Ship, menu: 'inbound' },
      { key: 'customs', label: '면장/원가', path: '/customs', icon: Calculator, menu: 'inbound' },
    ],
  },
  {
    label: '판매',
    items: [
      { key: 'orders', label: '수주 관리', path: '/orders', icon: ScrollText, menu: 'orders' },
      { key: 'outbound', label: '출고/판매', path: '/orders?tab=outbound', icon: Truck, menu: 'outbound' },
      { key: 'receipts', label: '수금 관리', path: '/orders?tab=receipts', icon: Wallet, menu: 'receipts' },
    ],
  },
  {
    label: '현황',
    items: [
      { key: 'banking', label: 'L/C 한도', path: '/banking', icon: Landmark, menu: 'banking' },
      { key: 'analysis', label: '매출 분석', path: '/sales-analysis', icon: BarChart3, menu: 'customs' },
    ],
  },
  {
    label: '도구',
    items: [
      { key: 'masters', label: '마스터', path: '/masters/products', icon: Database, menu: 'masters' },
      { key: 'search', label: '검색', path: '/search', icon: Search, menu: 'search' },
      { key: 'ocr', label: '문서 OCR', path: '/ocr', icon: ScanText, menu: 'ocr' },
      { key: 'memo', label: '메모', path: '/memo', icon: StickyNote, menu: 'memo' },
      { key: 'approval', label: '결재안', path: '/approval', icon: FileSignature, menu: 'approval' },
      { key: 'settings', label: '설정', path: '/settings', icon: Settings, menu: 'settings' },
    ],
  },
];

const ROUTE_LABELS: Record<string, { title: string; breadcrumb: string }> = {
  '/dashboard': { title: '대시보드', breadcrumb: '현황 / Command Center' },
  '/inventory': { title: '가용재고', breadcrumb: '재고 / 예약 가능 수량' },
  '/procurement': { title: 'P/O 발주', breadcrumb: '구매 / 발주 관리' },
  '/customs': { title: '면장/원가', breadcrumb: '입고 / 원가 계산' },
  '/orders': { title: '수주 관리', breadcrumb: '판매 / 수주 및 수금' },
  '/banking': { title: 'L/C 한도', breadcrumb: '현황 / 은행 한도' },
  '/sales-analysis': { title: '매출 분석', breadcrumb: '현황 / 매출과 이익' },
  '/search': { title: '통합 검색', breadcrumb: '도구 / 검색' },
  '/ocr': { title: '문서 OCR', breadcrumb: '도구 / 문서 인식' },
  '/memo': { title: '메모', breadcrumb: '도구 / 업무 메모' },
  '/approval': { title: '결재안', breadcrumb: '도구 / 결재 문안' },
  '/settings': { title: '설정', breadcrumb: '시스템 / 관리자' },
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
  if (pathname.startsWith('/masters')) return { title: '마스터 관리', breadcrumb: '기준정보 / 운영 기준' };
  return ROUTE_LABELS[pathname] ?? { title: 'SolarFlow', breadcrumb: 'Command Center' };
}

function isItemActive(itemPath: string, pathname: string, search: string) {
  const [base, query] = itemPath.split('?');
  if (query) return pathname === base && search === `?${query}`;
  if (base === '/inventory' || base === '/procurement' || base === '/orders') {
    return pathname === base && !search;
  }
  if (base.startsWith('/masters')) return pathname.startsWith('/masters');
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
  const navigate = useNavigate();
  const { user, role, logout } = useAuth();
  const { roleLabel } = usePermission();
  const r = role as Role | null;
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const { selectedCompanyId, setCompanyId } = useAppStore();
  const meta = routeMeta(pathname, search);
  const alertState = useAlerts(selectedCompanyId);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const selectedCompany = companies.find((c) => c.company_id === selectedCompanyId);
  const userInitial = (user?.name || user?.email || 'S').trim().slice(0, 1).toUpperCase();
  const navCounts = useMemo(() => ({
    inventory: sumAlertCounts(alertState.alerts, ['longterm_warning', 'longterm_critical']),
    dashboard: alertState.totalCount,
    lc: sumAlertCounts(alertState.alerts, ['lc_maturity', 'lc_shortage']),
    bl: sumAlertCounts(alertState.alerts, ['eta_soon']),
    orders: sumAlertCounts(alertState.alerts, ['delivery_soon', 'no_site']),
    outbound: sumAlertCounts(alertState.alerts, ['no_invoice']),
    receipts: sumAlertCounts(alertState.alerts, ['overdue_warning', 'overdue_critical']),
    banking: sumAlertCounts(alertState.alerts, ['lc_maturity', 'lc_shortage']),
  }), [alertState.alerts, alertState.totalCount]);

  return (
    <div className="sf-shell">
      <aside className="sf-sidebar" aria-label="주요 메뉴">
        <div className="sf-sidebar-logo">
          <span className="sf-solar-mark" aria-hidden />
          <Link to="/dashboard" className="min-w-0">
            <div className="text-[13.5px] font-bold leading-none">SolarFlow</div>
            <div className="sf-mono mt-1 text-[9.5px] font-semibold text-[var(--sf-solar)]">v3.0 · TOPSOLAR</div>
          </Link>
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

        <nav className="sf-sidebar-nav" aria-label="주요 메뉴 목록">
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => canAccessMenu(r, item.menu));
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
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="sf-nav-label min-w-0 flex-1 truncate">{item.label}</span>
                      {count ? <span className="sf-nav-badge">{count}</span> : null}
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
          <div className="min-w-0 shrink-0">
            <h1>{meta.title}</h1>
            <div className="sf-topbar-subtitle">{meta.breadcrumb} · 계산기준 {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>

          <div className="flex min-w-0 flex-1 justify-center">
            <GlobalSearchBar />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn('btn xs ghost icon', pathname === '/search' && 'bg-muted')}
              onClick={() => navigate('/search')}
              aria-label="검색 화면"
            >
              <Search className="h-4 w-4" />
            </Button>
            <FloatingMwEaCalculator />
            <AlertBell
              alerts={alertState.alerts}
              totalCount={alertState.totalCount}
              criticalCount={alertState.criticalCount}
            />
            <QuickRegister userId={user?.user_id} role={r} />
          </div>
        </header>

        <main className="sf-page-scroll">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
