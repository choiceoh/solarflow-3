import { lazy, Suspense, useEffect, type ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { DialogHost } from '@/lib/dialogs';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import RoleGuard from '@/components/auth/RoleGuard';
import AppLayout from '@/components/layout/AppLayout';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MobileBlock from '@/components/common/MobileBlock';
import { ROUTES, type NestedRouteSpec, type RouteSpec } from '@/lib/navigation/manifest';

// 인라인 유지: login 은 인증 외곽 라우트라 manifest 가 아닌 외곽 트리에 둔다.
// 그 외 도메인 페이지는 manifest.ROUTES 가 자동 렌더하지만, 일부 라우트가 아직
// 인라인으로 남아 있어 그 사용처에 한해 lazy import 유지.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
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
const AuditLogsPage = lazy(() => import('@/pages/settings/AuditLogsPage'));
const PersonalSettingsPage = lazy(() => import('@/pages/settings/PersonalSettingsPage'));
const SitePlaceholderPage = lazy(() => import('@/pages/settings/SitePlaceholderPage'));
const AssistantPage = lazy(() => import('@/pages/AssistantPage'));
const PartnerPriceBookPage = lazy(() => import('@/pages/baro/PartnerPriceBookPage'));
const PartnerCockpitPage = lazy(() => import('@/pages/baro/PartnerCockpitPage'));
const QuoteBuilderPage = lazy(() => import('@/pages/baro/QuoteBuilderPage'));
const SalesHomePage = lazy(() => import('@/pages/baro/SalesHomePage'));
const RFMBoardPage = lazy(() => import('@/pages/baro/RFMBoardPage'));
const SalesSummaryPage = lazy(() => import('@/pages/baro/SalesSummaryPage'));
const InverterGuidePage = lazy(() => import('@/pages/baro/InverterGuidePage'));
const ShipmentNoticePage = lazy(() => import('@/pages/baro/ShipmentNoticePage'));
const DriverPWAPage = lazy(() => import('@/pages/baro/DriverPWAPage'));
const IncomingBoardPage = lazy(() => import('@/pages/baro/IncomingBoardPage'));
const BaroPurchaseHistoryPage = lazy(() => import('@/pages/baro/BaroPurchaseHistoryPage'));
const GroupPurchaseRequestPage = lazy(() => import('@/pages/baro/GroupPurchaseRequestPage'));
const BaroRequestInboxPage = lazy(() => import('@/pages/group-trade/BaroRequestInboxPage'));
const CreditBoardPage = lazy(() => import('@/pages/baro/CreditBoardPage'));
const DispatchBoardPage = lazy(() => import('@/pages/baro/DispatchBoardPage'));
const CRMInboxPage = lazy(() => import('@/pages/CRMInboxPage'));
const CallbackRecommendPage = lazy(() => import('@/pages/baro/CallbackRecommendPage'));
const InsightsPage = lazy(() => import('@/pages/InsightsPage'));

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

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);
  const userPreferences = useAuthStore((s) => s.user?.preferences);
  const syncPreferences = usePreferencesStore((s) => s.syncFromUser);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    syncPreferences(userPreferences);
  }, [userPreferences, syncPreferences]);

  return (
    <MobileBlock>
    <TooltipProvider>
      <Toaster />
      <DialogHost />
      <BrowserRouter>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* D-137 PR7.5: 드라이버 PWA — token-based access, 인증 미적용 */}
            <Route path="/d/:token" element={<DriverPWAPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/inventory" replace />} />
                <Route path="/dashboard" element={<Navigate to="/inventory" replace />} />
                {ROUTES.map(renderRoute)}
                <Route path="/inbound" element={<LegacyRedirect to="/procurement?tab=bl" />} />
                <Route path="/lc" element={<LegacyRedirect to="/procurement?tab=lc" />} />
                <Route path="/outbound" element={<LegacyRedirect to="/orders?tab=outbound" />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/customs" element={<CustomsPage />} />
                <Route path="/sales-analysis" element={<SalesAnalysisPage />} />
                <Route path="/banking" element={<BankingPage />} />
                <Route path="/insights/:metric" element={<InsightsPage />} />
                <Route path="/baro/price-book" element={<RoleGuard allowedRoles={['admin', 'operator']}><PartnerPriceBookPage /></RoleGuard>} />
                <Route path="/baro/cockpit" element={<PartnerCockpitPage />} />
                <Route path="/baro/quote/new" element={<RoleGuard allowedRoles={['admin', 'operator']}><QuoteBuilderPage /></RoleGuard>} />
                <Route path="/baro/home" element={<SalesHomePage />} />
                <Route path="/baro/rfm" element={<RFMBoardPage />} />
                <Route path="/baro/sales-summary" element={<RoleGuard allowedRoles={['admin', 'operator', 'executive']}><SalesSummaryPage /></RoleGuard>} />
                <Route path="/baro/inverter-guide" element={<InverterGuidePage />} />
                <Route path="/baro/shipment-notice" element={<ShipmentNoticePage />} />
                <Route path="/baro/callback-recommend" element={<CallbackRecommendPage />} />
                <Route path="/baro/incoming" element={<IncomingBoardPage />} />
                <Route path="/baro/purchase-history" element={<RoleGuard allowedRoles={['admin', 'operator', 'executive']}><BaroPurchaseHistoryPage /></RoleGuard>} />
                <Route path="/baro/group-purchase" element={<RoleGuard allowedRoles={['admin', 'operator']}><GroupPurchaseRequestPage /></RoleGuard>} />
                <Route path="/group-trade/baro-inbox" element={<RoleGuard allowedRoles={['admin', 'operator']}><BaroRequestInboxPage /></RoleGuard>} />
                <Route path="/baro/credit-board" element={<CreditBoardPage />} />
                <Route path="/baro/dispatch" element={<RoleGuard allowedRoles={['admin', 'operator']}><DispatchBoardPage /></RoleGuard>} />
                <Route path="/crm/inbox" element={<CRMInboxPage />} />
                <Route path="/approval" element={<ApprovalPage />} />
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsIndexRedirect />} />
                  <Route path="admin" element={<RoleGuard allowedRoles={['admin']}><AdminSettingsPage /></RoleGuard>} />
                  <Route path="audit-logs" element={<RoleGuard allowedRoles={['admin']}><AuditLogsPage /></RoleGuard>} />
                  <Route path="site" element={<RoleGuard allowedRoles={['admin']}><SitePlaceholderPage /></RoleGuard>} />
                  <Route path="personal" element={<PersonalSettingsPage />} />
                </Route>
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
