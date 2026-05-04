import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface TabDef {
  to: string;
  label: string;
  adminOnly: boolean;
}

const TABS: TabDef[] = [
  { to: '/settings/site',        label: '사이트 설정',  adminOnly: true },
  { to: '/settings/admin',       label: '관리자 설정',  adminOnly: true },
  { to: '/settings/audit-logs',  label: '관리자 로그',  adminOnly: true },
  { to: '/settings/personal',    label: '개인 설정',    adminOnly: false },
];

export default function SettingsLayout() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const visible = TABS.filter((t) => isAdmin || !t.adminOnly);

  return (
    <div className="flex flex-col">
      <nav className="flex items-center gap-1 border-b bg-card px-6 pt-3">
        {visible.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                'relative px-7 py-4 text-xl font-medium transition-colors',
                isActive
                  ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )
            }
            end
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

export function SettingsIndexRedirect() {
  const { role } = useAuth();
  return <Navigate to={role === 'admin' ? '/settings/admin' : '/settings/personal'} replace />;
}
