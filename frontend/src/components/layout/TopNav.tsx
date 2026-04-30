import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown, LayoutDashboard, Landmark, BarChart3,
  StickyNote, FileSignature, Settings, LogOut, User, FileText, Ship,
  Building2, Factory, Tag, Handshake, Warehouse, Banknote, HardHat,
  Package, ClipboardList, Store, Shield, Truck, TrendingUp,
  ScrollText, Receipt, Wallet, GitMerge, KeyRound, ScanText,
} from 'lucide-react';
import QuickRegister from '@/components/layout/QuickRegister';
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { canAccessMenu, type MenuKey } from '@/config/permissions';
import type { Role } from '@/config/permissions';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const analysisSections: { label: string; path: string; icon: React.ElementType; menu: MenuKey }[] = [
  { label: '대시보드',       path: '/dashboard', icon: LayoutDashboard, menu: 'dashboard' },
  { label: 'LC 한도/만기',   path: '/banking', icon: Landmark,        menu: 'banking' },
  { label: '매출/이익 분석', path: '/sales-analysis', icon: BarChart3, menu: 'customs' },
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
  { label: '문서 OCR', path: '/ocr',      icon: ScanText,      menu: 'ocr' },
  { label: '메모',   path: '/memo',     icon: StickyNote,    menu: 'memo' },
  { label: '결재안', path: '/approval', icon: FileSignature, menu: 'approval' },
  { label: '설정',   path: '/settings', icon: Settings,      menu: 'settings' },
];

const purchaseSections: { label: string; path: string; icon: React.ElementType; menu: MenuKey }[] = [
  { label: 'PO 발주',  path: '/procurement',           icon: FileText,      menu: 'procurement' },
  { label: '계약금',   path: '/procurement?tab=tt',    icon: Banknote,      menu: 'procurement' },
  { label: 'LC 개설',  path: '/procurement?tab=lc',    icon: Landmark,      menu: 'lc' },
  { label: 'B/L 입고', path: '/procurement?tab=bl',    icon: Ship,          menu: 'inbound' },
  { label: '면장/원가', path: '/customs',              icon: Receipt,       menu: 'inbound' },
];

const inventorySections: { label: string; path: string; icon: React.ElementType; menu: MenuKey }[] = [
  { label: '가용재고',  path: '/inventory',               icon: Shield,        menu: 'inventory' },
  { label: '실재고',    path: '/inventory?tab=physical',  icon: Package,       menu: 'inventory' },
  { label: '미착품',    path: '/inventory?tab=incoming',  icon: Truck,         menu: 'inventory' },
  { label: '수급 전망', path: '/inventory?tab=forecast',  icon: TrendingUp,    menu: 'inventory' },
];

const salesSections: { label: string; path: string; icon: React.ElementType; menu: MenuKey }[] = [
  { label: '수주',        path: '/orders',               icon: ScrollText, menu: 'orders' },
  { label: '출고',        path: '/orders?tab=outbound',  icon: Truck,      menu: 'outbound' },
  { label: '판매/계산서', path: '/orders?tab=sales',     icon: Receipt,    menu: 'outbound' },
  { label: '수금',        path: '/orders?tab=receipts',  icon: Wallet,     menu: 'receipts' },
  { label: '수금매칭',    path: '/orders?tab=matching',  icon: GitMerge,   menu: 'receipts' },
];


export default function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout, role } = useAuth();
  const { roleLabel } = usePermission();
  const r = role as Role | null;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const { selectedCompanyId, setCompanyId } = useAppStore();

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const selectedCompany = companies.find((c) => c.company_id === selectedCompanyId);
  const selectedCompanyLabel = !selectedCompanyId || selectedCompanyId === 'all'
    ? '전체'
    : (selectedCompany?.company_name ?? '법인 선택');

  const isPurchase  = ['/procurement', '/lc', '/inbound', '/customs'].some(p => pathname === p || pathname.startsWith(p + '/'));
  const isInventory = pathname === '/inventory' || pathname.startsWith('/inventory/');
  const isSales     = ['/orders', '/outbound'].some(p => pathname === p || pathname.startsWith(p + '/'));
  const isAnalysis  = pathname.startsWith('/dashboard') || pathname.startsWith('/banking') || pathname.startsWith('/sales-analysis');

  const showPurchase  = canAccessMenu(r, 'procurement') || canAccessMenu(r, 'lc') || canAccessMenu(r, 'inbound');
  const showInventory = canAccessMenu(r, 'inventory');
  const showSales     = canAccessMenu(r, 'orders') || canAccessMenu(r, 'outbound') || canAccessMenu(r, 'receipts');
  const analysisVisible = analysisSections.filter(s => canAccessMenu(r, s.menu));
  const inventoryVisible = inventorySections.filter(s => canAccessMenu(r, s.menu));
  const purchaseVisible = purchaseSections.filter(s => canAccessMenu(r, s.menu));
  const salesVisible = salesSections.filter(s => canAccessMenu(r, s.menu));
  const showMasters     = canAccessMenu(r, 'masters');
  const toolsVisible    = toolSections.filter(s => canAccessMenu(r, s.menu));

  const isMasters = pathname.startsWith('/masters');
  const isTools   = ['/ocr', '/memo', '/approval', '/settings'].some(p => pathname.startsWith(p));
  const supportNavLabel = showMasters && toolsVisible.length > 0
    ? '기준정보/도구'
    : showMasters
      ? '기준정보'
      : '도구';
  const navTriggerClass = (active: boolean) => cn(
    'flex h-8 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-sm font-medium transition-all outline-none select-none whitespace-nowrap',
    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45',
    active
      ? 'border-border bg-muted text-foreground shadow-sm'
      : 'text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground',
  );

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setIsChangingPassword(false);
  };

  const handlePasswordOpenChange = (open: boolean) => {
    setPasswordOpen(open);
    if (!open) resetPasswordForm();
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const email = user?.email?.trim();
    if (!email) {
      setPasswordError('로그인 사용자 이메일을 확인할 수 없습니다.');
      return;
    }
    if (!currentPassword) {
      setPasswordError('현재 비밀번호를 입력해 주세요.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('새 비밀번호는 8자 이상으로 입력해 주세요.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('새 비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('새 비밀번호는 현재 비밀번호와 다르게 입력해 주세요.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) {
        throw new Error('현재 비밀번호가 맞지 않습니다.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        throw new Error(updateError.message || '비밀번호 변경에 실패했습니다.');
      }

      setPasswordSuccess('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(async () => {
        handlePasswordOpenChange(false);
        await logout();
        navigate('/login');
      }, 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : '비밀번호 변경에 실패했습니다.';
      setPasswordError(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <>
    <header className="h-14 shrink-0 border-b bg-background/95 flex items-center gap-2 px-4 z-40 shadow-[0_1px_8px_rgba(15,23,42,0.04)] backdrop-blur supports-[backdrop-filter]:bg-background/90">

      {/* ① 로고 — 가용재고 홈으로 이동 */}
      <Link to="/inventory" className="flex h-9 shrink-0 items-center gap-2 rounded-md pr-1.5 mr-1 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45">
        <div className="relative flex size-8 items-center justify-center rounded-md border border-foreground/10 bg-foreground text-background shadow-sm">
          <span className="text-[11px] font-semibold leading-none tracking-tight">SF</span>
          <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />
        </div>
        <span className="hidden text-sm font-semibold tracking-tight sm:block">
          Solar<span className="text-emerald-600">Flow</span>
        </span>
      </Link>

      {/* ② 법인 선택 */}
      <Select value={selectedCompanyId || 'all'} onValueChange={setCompanyId}>
        <SelectTrigger className="h-7 w-28 text-xs border-dashed shrink-0">
          <span className="truncate">{selectedCompanyLabel}</span>
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

      {/* ③ 메인 네비게이션 — 가용재고가 첫 번째 */}
      <nav className="flex items-center gap-0.5">
        {showInventory && inventoryVisible.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className={navTriggerClass(isInventory)}>
              <Package className="h-3.5 w-3.5" />재고
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {inventoryVisible.map((s) => (
                <DropdownMenuItem key={s.path} onClick={() => navigate(s.path)} className="gap-2">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {showPurchase && purchaseVisible.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className={navTriggerClass(isPurchase)}>
              <ClipboardList className="h-3.5 w-3.5" />구매/입고
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {purchaseVisible.map((s) => (
                <DropdownMenuItem key={s.path} onClick={() => navigate(s.path)} className="gap-2">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {showSales && salesVisible.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className={navTriggerClass(isSales)}>
              <Store className="h-3.5 w-3.5" />판매/수금
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {salesVisible.map((s) => (
                <DropdownMenuItem key={s.path} onClick={() => navigate(s.path)} className="gap-2">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* 현황/분석 드롭다운 */}
        {analysisVisible.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className={navTriggerClass(isAnalysis)}>
              <BarChart3 className="h-3.5 w-3.5" />현황/분석
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
            <DropdownMenuTrigger className={navTriggerClass(isMasters || isTools)}>
              {supportNavLabel}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {showMasters && <DropdownMenuLabel className="text-[11px] text-muted-foreground">기준정보</DropdownMenuLabel>}
              {showMasters && masterSubItems.map((s) => (
                <DropdownMenuItem key={s.path} onClick={() => navigate(s.path)} className="gap-2">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </DropdownMenuItem>
              ))}
              {showMasters && toolsVisible.length > 0 && <DropdownMenuSeparator />}
              {toolsVisible.length > 0 && <DropdownMenuLabel className="text-[11px] text-muted-foreground">도구</DropdownMenuLabel>}
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

      {/* ④ 우측: 빠른 등록 + 검색 + 알림 + 사용자 */}
      <div className="flex-1" />

      <QuickRegister userId={user?.user_id} role={r} />
      <GlobalSearchBar />
      <AlertBell />

      {/* 사용자 드롭다운 */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-all hover:border-border hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45">
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
          <DropdownMenuItem
            onClick={() => setPasswordOpen(true)}
            className="gap-2"
          >
            <KeyRound className="h-3.5 w-3.5" />
            비밀번호 변경
          </DropdownMenuItem>
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
    <Dialog open={passwordOpen} onOpenChange={handlePasswordOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>비밀번호 변경</DialogTitle>
          <DialogDescription>
            임시 비밀번호로 로그인한 뒤 새 비밀번호로 바꿉니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topnav-current-password">현재 비밀번호</Label>
            <Input
              id="topnav-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topnav-new-password">새 비밀번호</Label>
            <Input
              id="topnav-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topnav-confirm-password">새 비밀번호 확인</Label>
            <Input
              id="topnav-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {passwordError && (
            <p className="text-sm text-destructive">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-sm text-emerald-700">{passwordSuccess}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePasswordOpenChange(false)}
              disabled={isChangingPassword}
            >
              취소
            </Button>
            <Button type="submit" disabled={isChangingPassword}>
              {isChangingPassword ? '변경 중...' : '변경'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
