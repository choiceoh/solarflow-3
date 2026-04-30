import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, PackageCheck, ClipboardList, Truck,
  Calculator, Landmark, Database, Search, StickyNote,
  FileSignature, Settings, ChevronDown, ChevronRight, LogOut,
  ScrollText, Wallet, Building2, Home, ScanText,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePermission } from '@/hooks/usePermission';
import { useAppStore } from '@/stores/appStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

interface MenuItem {
  icon: LucideIcon;
  label: string;
  path?: string;
  roles?: string[];
  children?: { label: string; path: string }[];
}

// 홈 — 가용재고 (전체 공개, 최상단 단독 배치)
const inventoryItem: MenuItem = { icon: Home, label: '재고 현황', path: '/inventory' };

// 구매/입고: PO → T/T → L/C → B/L → 면장/원가  (입력 가능: admin, operator)
const purchaseItems: MenuItem[] = [
  { icon: ClipboardList, label: 'PO 발주',  path: '/procurement',        roles: ['admin', 'operator'] },
  { icon: Wallet,        label: '계약금',   path: '/procurement?tab=tt', roles: ['admin', 'operator'] },
  { icon: Landmark,      label: 'LC 개설',  path: '/procurement?tab=lc', roles: ['admin', 'operator'] },
  { icon: PackageCheck,  label: 'B/L 입고', path: '/procurement?tab=bl', roles: ['admin', 'operator'] },
  { icon: Calculator,    label: '면장/원가', path: '/customs',           roles: ['admin', 'operator'] },
];
// 판매/수금: 수주 → 출고 → 판매/계산서 → 수금 → 수금매칭
const salesItems: MenuItem[] = [
  { icon: ScrollText, label: '수주',     path: '/orders',              roles: ['admin', 'operator', 'executive'] },
  { icon: Truck,      label: '출고',     path: '/orders?tab=outbound', roles: ['admin', 'operator', 'executive'] },
  { icon: Calculator, label: '판매/계산서', path: '/orders?tab=sales', roles: ['admin', 'operator', 'executive'] },
  { icon: Wallet,     label: '수금 관리', path: '/orders?tab=receipts', roles: ['admin', 'operator', 'executive'] },
  { icon: Database,   label: '수금매칭', path: '/orders?tab=matching', roles: ['admin', 'operator', 'executive'] },
];

// 현황/분석
const analysisItems: MenuItem[] = [
  { icon: LayoutDashboard, label: '대시보드',       path: '/dashboard' },                                 // 전체 공개 (내용은 권한별 분기)
  { icon: Landmark,        label: 'LC 한도/만기',   path: '/banking', roles: ['admin', 'operator', 'executive'] },
  { icon: Calculator,      label: '매출/이익 분석', path: '/sales-analysis', roles: ['admin', 'operator', 'executive'] },
];

const masterItem: MenuItem = {
  icon: Database,
  label: '마스터 관리',
  roles: ['admin', 'operator'],
  children: [
    { label: '법인',   path: '/masters/companies' },
    { label: '제조사', path: '/masters/manufacturers' },
    { label: '품번',   path: '/masters/products' },
    { label: '거래처', path: '/masters/partners' },
    { label: '창고',   path: '/masters/warehouses' },
    { label: '은행',   path: '/masters/banks' },
    { label: '공사현장', path: '/masters/construction-sites' },
  ],
};

const toolItems: MenuItem[] = [
  { icon: Search,        label: '검색',  path: '/search' },
  { icon: ScanText,      label: '문서 OCR', path: '/ocr', roles: ['admin', 'operator'] },
  { icon: StickyNote,    label: '메모',  path: '/memo',     roles: ['admin', 'operator'] },
  { icon: FileSignature, label: '결재안', path: '/approval', roles: ['admin', 'operator'] },
];

const settingsItem: MenuItem = {
  icon: Settings, label: '설정', path: '/settings', roles: ['admin'],
};

function canSee(item: MenuItem, role: string | null): boolean {
  if (!item.roles) return true;
  return !!role && item.roles.includes(role);
}

interface NavLinkProps extends MenuItem {
  collapsed: boolean;
  pathname: string;
  search: string;
  masterOpen: boolean;
  onMasterToggle: () => void;
}

function NavLink({
  icon: Icon, label, path, children: subs,
  collapsed, pathname, search, masterOpen, onMasterToggle,
}: NavLinkProps) {
  const isActive = (() => {
    if (!path) return pathname.startsWith('/masters');
    const [basePath, queryStr] = path.split('?');
    if (queryStr) {
      // 쿼리 파라미터 포함 경로 (예: /orders?tab=receipts)
      return pathname === basePath && search === `?${queryStr}`;
    }
    // 탭 컨테이너의 기본 링크는 query가 없을 때만 활성화
    if (path === '/orders' || path === '/procurement' || path === '/inventory') return pathname === path && !search;
    return pathname === path;
  })();
  const isSub = !!subs;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Link
            to={path ?? '/masters/companies'}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md mx-auto transition-colors',
              isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
            )}
          >
            <Icon className="h-4 w-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  if (isSub) {
    return (
      <div>
        <button
          onClick={onMasterToggle}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
            isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{label}</span>
          {masterOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {masterOpen && (
          <div className="ml-6 mt-0.5 space-y-0.5">
            {subs!.map((sub) => (
              <Link
                key={sub.path}
                to={sub.path}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-sm transition-colors',
                  pathname === sub.path ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'
                )}
              >
                {sub.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      to={path!}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
        isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-accent/50'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const { pathname, search } = useLocation();
  const { user, logout, role } = useAuth();
  const { roleLabel } = usePermission();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const { selectedCompanyId, setCompanyId } = useAppStore();
  const [masterOpen, setMasterOpen] = useState(pathname.startsWith('/masters'));

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const selectedCompany = companies.find((c) => c.company_id === selectedCompanyId);
  // 접힌 상태용 이니셜: "탑솔라(주)" → "TS", "전체" → "전"
  const companyInitial = selectedCompany
    ? (selectedCompany.company_code || selectedCompany.company_name.slice(0, 2))
    : '전';

  const navLinkBase = {
    collapsed,
    pathname,
    search,
    masterOpen,
    onMasterToggle: () => setMasterOpen(!masterOpen),
  };

  return (
    <aside className={cn(
      'flex h-full flex-col border-r bg-card transition-all duration-200',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* 로고 */}
      <div className={cn('flex h-14 items-center border-b px-4', collapsed && 'justify-center px-0')}>
        {collapsed ? (
          <Link to="/inventory" className="text-lg font-bold hover:text-primary transition-colors">SF</Link>
        ) : (
          <Link to="/inventory" className="hover:opacity-80 transition-opacity">
            <h1 className="text-sm font-bold">SolarFlow 3.0</h1>
            <p className="text-[10px] text-muted-foreground">태양광 모듈 유통 관리</p>
          </Link>
        )}
      </div>

      {/* 법인 선택 */}
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger>
            <button
              className={cn(
                'mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
                selectedCompanyId && selectedCompanyId !== 'all'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted border-border text-muted-foreground',
              )}
            >
              {companyInitial}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {selectedCompany?.company_name ?? '전체 법인'}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="px-3 py-2 border-b">
          <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
            <Building2 className="h-2.5 w-2.5" />법인
          </p>
          <Select value={selectedCompanyId || 'all'} onValueChange={(v) => setCompanyId(v)}>
            <SelectTrigger className="h-8 w-full text-xs">
              <span className="flex-1 text-left truncate">
                {selectedCompany?.company_name ?? '전체'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.company_id} value={c.company_id}>
                  {c.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 메뉴 — 가용재고 홈 → 구매 → 판매 섹션 */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        <NavLink {...navLinkBase} {...inventoryItem} />
        <Separator className="my-2" />
        {!collapsed && <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">구매/입고</p>}
        {purchaseItems.filter((m) => canSee(m, role)).map((m) => <NavLink key={m.label} {...navLinkBase} {...m} />)}
        <Separator className="my-2" />
        {!collapsed && <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">판매/수금</p>}
        {salesItems.filter((m) => canSee(m, role)).map((m) => <NavLink key={m.label} {...navLinkBase} {...m} />)}
        <Separator className="my-2" />
        {!collapsed && <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">현황/분석</p>}
        {analysisItems.filter((m) => canSee(m, role)).map((m) => <NavLink key={m.label} {...navLinkBase} {...m} />)}
        <Separator className="my-2" />
        {!collapsed && <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">기준정보/도구</p>}
        {canSee(masterItem, role) && <NavLink {...navLinkBase} {...masterItem} />}
        {toolItems.filter((m) => canSee(m, role)).map((m) => <NavLink key={m.label} {...navLinkBase} {...m} />)}
        {canSee(settingsItem, role) && <NavLink {...navLinkBase} {...settingsItem} />}
      </nav>

      {/* 하단 사용자 */}
      <div className="border-t p-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger>
              <Button variant="ghost" size="icon" className="mx-auto flex" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">로그아웃</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-medium">{user?.name || user?.email || '—'}</p>
              <Badge variant="secondary" className="mt-0.5 text-[10px]">{roleLabel}</Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
