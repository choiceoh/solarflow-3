import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown, LayoutDashboard, Landmark, BarChart3,
  StickyNote, FileSignature, Settings, LogOut, User,
  Building2, Factory, Tag, Handshake, Warehouse, Banknote, HardHat,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { usePermission } from '@/hooks/usePermission';
import { useAppStore } from '@/stores/appStore';
import GlobalSearchBar from '@/components/search/GlobalSearchBar';
import AlertBell from './AlertBell';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { canAccessMenu, type MenuKey } from '@/config/permissions';
import type { Role } from '@/config/permissions';
import { useEffect } from 'react';

const analysisSections: { label: string; path: string; icon: React.ElementType; menu: MenuKey }[] = [
  { label: '대시보드',       path: '/',        icon: LayoutDashboard, menu: 'dashboard' },
  { label: 'LC 한도/만기',   path: '/banking', icon: Landmark,        menu: 'banking' },
  { label: '매출/이익 분석', path: '/customs', icon: BarChart3,        menu: 'customs' },
];

// 마스터 관리 서브 메뉴 (admin/operator만 접근)
const masterSubItems: { label: string; path: string; icon: React.ElementType }[] = [
  { label: '법인',     path: '/masters/companies',          icon: Building2 },
  { label: '제조사',   path: '/masters/manufacturers',      icon: Factory },
  { label: '품번',     path: '/masters/products',           icon: Tag },
  { label: '거래처',   path: '/masters/partners',           icon: Handshake },
  { label: '창고',     path: '/masters/warehouses',         icon: Warehouse },
  { label: '은행',     path: '/masters/banks',              icon: Banknote },
  { label: '공사현장', path: '/masters/construction-sites', icon: HardHat },
];

// 도구 메뉴 (개별 권한 체크)
const toolSections: { label: string; path: string; icon: React.ElementType; menu: MenuKey }[] = [
  { label: '메모',   path: '/memo',     icon: StickyNote,    menu: 'memo' },
  { label: '결재안', path: '/approval', icon: FileSignature, menu: 'approval' },
  { label: '설정',   path: '/settings', icon: Settings,      menu: 'settings' },
];


export default function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout, role } = useAuth();
  const { roleLabel } = usePermission();
  const r = role as Role | null;
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const { selectedCompanyId, setCompanyId } = useAppStore();

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const selectedCompany = companies.find((c) => c.company_id === selectedCompanyId);

  const isPurchase  = ['/procurement', '/lc', '/inbound'].some(p => pathname === p || pathname.startsWith(p + '/'));
  const isInventory = pathname === '/inventory' || pathname.startsWith('/inventory/');
  const isSales     = ['/orders', '/outbound'].some(p => pathname === p || pathname.startsWith(p + '/'));
  const isAnalysis  = pathname === '/' || pathname.startsWith('/banking') || pathname.startsWith('/customs');

  const showPurchase  = canAccessMenu(r, 'procurement') || canAccessMenu(r, 'inbound');
  const showInventory = canAccessMenu(r, 'inventory');
  const showSales     = canAccessMenu(r, 'orders') || canAccessMenu(r, 'outbound');
  const analysisVisible = analysisSections.filter(s => canAccessMenu(r, s.menu));
  const showMasters     = canAccessMenu(r, 'masters');
  const toolsVisible    = toolSections.filter(s => canAccessMenu(r, s.menu));

  const isMasters = pathname.startsWith('/masters');
  const isTools   = ['/memo', '/approval', '/settings'].some(p => pathname.startsWith(p));

  const navLinkClass = (active: boolean) => cn(
    'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
    active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
  );

  return (
    <header className="h-14 border-b bg-card flex items-center gap-2 px-4 shrink-0 z-40">

      {/* ① 로고 */}
      <Link to="/" className="flex items-center gap-1.5 shrink-0 mr-1">
        <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary-foreground leading-none">SF</span>
        </div>
        <span className="text-sm font-bold hidden sm:block">SolarFlow</span>
      </Link>

      {/* ② 법인 선택 */}
      <Select value={selectedCompanyId || 'all'} onValueChange={setCompanyId}>
        <SelectTrigger className="h-7 w-28 text-xs border-dashed shrink-0">
          <span className="truncate">{selectedCompany?.company_name ?? '전체'}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 구분선 */}
      <div className="h-5 w-px bg-border mx-1 shrink-0" />

      {/* ③ 메인 네비게이션 */}
      <nav className="flex items-center gap-0.5">
        {showPurchase && (
          <Link to="/procurement" className={navLinkClass(isPurchase)}>구매</Link>
        )}
        {showInventory && (
          <Link to="/inventory" className={navLinkClass(isInventory)}>재고</Link>
        )}
        {showSales && (
          <Link to="/orders" className={navLinkClass(isSales)}>판매</Link>
        )}

        {/* 현황/분석 드롭다운 */}
        {analysisVisible.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors select-none whitespace-nowrap',
              isAnalysis ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            )}>
              현황/분석
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {analysisVisible.map((s) => (
                <DropdownMenuItem key={s.path} onClick={() => navigate(s.path)} className="gap-2">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* 도구 드롭다운: 마스터 관리 서브페이지 + 메모/결재안/설정 */}
        {(showMasters || toolsVisible.length > 0) && (
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
              'flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors select-none whitespace-nowrap',
              (isMasters || isTools) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            )}>
              도구
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {showMasters && masterSubItems.map((s) => (
                <DropdownMenuItem key={s.path} onClick={() => navigate(s.path)} className="gap-2">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </DropdownMenuItem>
              ))}
              {showMasters && toolsVisible.length > 0 && <DropdownMenuSeparator />}
              {toolsVisible.map((s) => (
                <DropdownMenuItem key={s.path} onClick={() => navigate(s.path)} className="gap-2">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>

      {/* ④ 우측: 검색 + 알림 + 사용자 */}
      <div className="flex-1" />

      <GlobalSearchBar />
      <AlertBell />

      {/* 사용자 드롭다운 */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:block max-w-[80px] truncate">
            {user?.name || user?.email || '—'}
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 hidden sm:inline-flex">
            {roleLabel}
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground py-1">
            {user?.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => { await logout(); navigate('/login'); }}
            className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
