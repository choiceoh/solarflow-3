import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Package, LayoutDashboard, PackageCheck, ClipboardList, Truck,
  HandCoins, Calculator, Landmark, Database, Search, StickyNote,
  FileSignature, Settings, ChevronDown, ChevronRight, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/stores/appStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface MenuItem {
  icon: LucideIcon;
  label: string;
  path?: string;
  roles?: string[];
  children?: { label: string; path: string }[];
}

// 업무 흐름 (D-084) — 발주→입고→면장→수주→출고 순
const workflowItems: MenuItem[] = [
  { icon: ClipboardList, label: '발주/결제', path: '/procurement', roles: ['admin', 'manager', 'staff'] },
  { icon: Landmark, label: 'LC 관리', path: '/lc', roles: ['admin', 'manager', 'staff'] },
  { icon: PackageCheck, label: '입고 관리', path: '/inbound', roles: ['admin', 'manager', 'staff'] },
  { icon: Calculator, label: '면장/원가', path: '/customs', roles: ['admin', 'manager', 'staff'] },
  { icon: HandCoins, label: '수주/수금', path: '/orders', roles: ['admin', 'manager', 'staff'] },
  { icon: Truck, label: '출고/판매', path: '/outbound', roles: ['admin', 'manager', 'staff'] },
];

// 현황/분석
const analysisItems: MenuItem[] = [
  { icon: Package, label: '재고 현황', path: '/inventory' },
  { icon: Landmark, label: '은행/LC', path: '/banking', roles: ['admin', 'manager', 'staff'] },
  { icon: LayoutDashboard, label: '대시보드', path: '/' },
];

const masterItem: MenuItem = {
  icon: Database,
  label: '마스터 관리',
  roles: ['admin', 'manager', 'staff'],
  children: [
    { label: '법인', path: '/masters/companies' },
    { label: '제조사', path: '/masters/manufacturers' },
    { label: '품번', path: '/masters/products' },
    { label: '거래처', path: '/masters/partners' },
    { label: '창고', path: '/masters/warehouses' },
    { label: '은행', path: '/masters/banks' },
  ],
};

const toolItems: MenuItem[] = [
  { icon: Search, label: '검색', path: '/search' },
  { icon: StickyNote, label: '메모', path: '/memo', roles: ['admin', 'manager', 'staff'] },
  { icon: FileSignature, label: '결재안', path: '/approval', roles: ['admin', 'manager', 'staff'] },
];

const settingsItem: MenuItem = {
  icon: Settings, label: '설정', path: '/settings', roles: ['admin'],
};

function canSee(item: MenuItem, role: string | null): boolean {
  if (!item.roles) return true;
  return !!role && item.roles.includes(role);
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const { user, logout, role } = useAuth();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const [masterOpen, setMasterOpen] = useState(pathname.startsWith('/masters'));

  const NavLink = ({ icon: Icon, label, path, children: subs }: MenuItem & { children?: MenuItem['children'] }) => {
    const isActive = path ? pathname === path : pathname.startsWith('/masters');
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
            onClick={() => setMasterOpen(!masterOpen)}
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
  };

  return (
    <aside className={cn(
      'flex h-full flex-col border-r bg-card transition-all duration-200',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* 로고 */}
      <div className={cn('flex h-14 items-center border-b px-4', collapsed && 'justify-center px-0')}>
        {collapsed ? (
          <span className="text-lg font-bold">SF</span>
        ) : (
          <div>
            <h1 className="text-sm font-bold">SolarFlow 3.0</h1>
            <p className="text-[10px] text-muted-foreground">태양광 모듈 유통 관리</p>
          </div>
        )}
      </div>

      {/* 메뉴 — D-084: 업무흐름/현황분석/도구 3그룹 */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {!collapsed && <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">업무 흐름</p>}
        {workflowItems.filter((m) => canSee(m, role)).map((m) => <NavLink key={m.label} {...m} />)}
        <Separator className="my-2" />
        {!collapsed && <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">현황/분석</p>}
        {analysisItems.filter((m) => canSee(m, role)).map((m) => <NavLink key={m.label} {...m} />)}
        <Separator className="my-2" />
        {!collapsed && <p className="px-3 pt-1 pb-1 text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">도구</p>}
        {canSee(masterItem, role) && <NavLink {...masterItem} />}
        {toolItems.filter((m) => canSee(m, role)).map((m) => <NavLink key={m.label} {...m} />)}
        {canSee(settingsItem, role) && <NavLink {...settingsItem} />}
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
              <Badge variant="secondary" className="mt-0.5 text-[10px]">{user?.role || '—'}</Badge>
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
