import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { DialogHost } from '@/lib/dialogs';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useUiDefaultsStore } from '@/stores/uiDefaultsStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import RoleGuard from '@/components/auth/RoleGuard';
import AppLayout from '@/components/layout/AppLayout';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MobileBlock from '@/components/common/MobileBlock';
import { ROUTES, type NestedRouteSpec, type RouteSpec } from '@/lib/navigation/manifest';
import { detectTenantScope } from '@/lib/tenantScope';

// 인라인 유지: login 은 인증 외곽 라우트라 manifest 가 아닌 외곽 트리에 둔다.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
// PR-7.5 / D-137: 드라이버 PWA — token-based access, 인증 미적용. baro-domain pack 의
// 페이지지만 라우트는 ProtectedRoute 외부에 둔다 (외부 차주 진입).
const DriverPWAPage = lazy(() => import('@/packs/baro-domain/pages/DriverPWAPage'));

function Fallback() {
  return <LoadingSpinner className="h-screen" />;
}

function LegacyRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  const [pathname, baseSearch = ''] = to.split('?');
  const params = new URLSearchParams(baseSearch);
  const legacy = new URLSearchParams(search);

  for (const [key, value] of legacy) {
    if (key === 'new' || key === 'action') continue;
    if (!params.has(key)) params.set(key, value);
  }

  const next = params.toString();
  return <Navigate to={`${pathname}${next ? `?${next}` : ''}`} replace />;
}

function renderElement(spec: RouteSpec | NestedRouteSpec): ReactElement {
  const Comp = spec.element;
  let el: ReactElement = <Comp />;
  if ('wrap' in spec && spec.wrap) el = spec.wrap(el);
  if (spec.roles) el = <RoleGuard allowedRoles={spec.roles}>{el}</RoleGuard>;
  return el;
}

function renderRoute(spec: RouteSpec) {
  const element = renderElement(spec);
  if (!spec.children) {
    return <Route key={spec.path} path={spec.path} element={element} />;
  }
  return (
    <Route key={spec.path} path={spec.path} element={element}>
      {spec.children.map((child) => {
        const childEl = renderElement(child);
        if (child.index) return <Route key="__index" index element={childEl} />;
        return <Route key={child.path} path={child.path} element={childEl} />;
      })}
    </Route>
  );
}

function DefaultRedirect() {
  return <Navigate to={detectTenantScope() === 'study' ? '/study/learning' : '/inventory'} replace />;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const userId = useAuthStore((s) => s.user?.user_id);
  const userPreferences = useAuthStore((s) => s.user?.preferences);
  const syncPreferences = usePreferencesStore((s) => s.syncFromUser);
  const loadUiDefaults = useUiDefaultsStore((s) => s.load);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    syncPreferences(userPreferences);
  }, [userPreferences, syncPreferences]);

  // 로그인 직후 1회 — 호스트 테넌트의 UI 기본값을 가져와 컬럼/KPI hook 들이 참조할 수 있게.
  // 실패해도 hook 들이 빈 default 로 동작하므로 await 불필요.
  useEffect(() => {
    if (!userId) return;
    void loadUiDefaults(detectTenantScope());
  }, [userId, loadUiDefaults]);

  return (
    <MobileBlock>
    <TooltipProvider>
      <Toaster />
      <DialogHost />
      <BrowserRouter>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/d/:token" element={<DriverPWAPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DefaultRedirect />} />
                <Route path="/dashboard" element={<DefaultRedirect />} />
                {ROUTES.map(renderRoute)}
                <Route path="/inbound" element={<LegacyRedirect to="/procurement?tab=bl" />} />
                <Route path="/lc" element={<LegacyRedirect to="/procurement?tab=lc" />} />
                <Route path="/outbound" element={<LegacyRedirect to="/orders?tab=outbound" />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </MobileBlock>
  );
}
