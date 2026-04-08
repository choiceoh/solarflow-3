import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/authStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const InboundPage = lazy(() => import('@/pages/InboundPage'));
const ProcurementPage = lazy(() => import('@/pages/ProcurementPage'));
const LCPage = lazy(() => import('@/pages/LCPage'));
const OutboundPage = lazy(() => import('@/pages/OutboundPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const CustomsPage = lazy(() => import('@/pages/CustomsPage'));
const BankingPage = lazy(() => import('@/pages/BankingPage'));
const ApprovalPage = lazy(() => import('@/pages/ApprovalPage'));
const MemoPage = lazy(() => import('@/pages/MemoPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const PlaceholderPage = lazy(() => import('@/pages/PlaceholderPage'));
const CompanyPage = lazy(() => import('@/pages/masters/CompanyPage'));
const ManufacturerPage = lazy(() => import('@/pages/masters/ManufacturerPage'));
const ProductPage = lazy(() => import('@/pages/masters/ProductPage'));
const PartnerPage = lazy(() => import('@/pages/masters/PartnerPage'));
const WarehousePage = lazy(() => import('@/pages/masters/WarehousePage'));
const BankPage = lazy(() => import('@/pages/masters/BankPage'));

function Fallback() {
  return <LoadingSpinner className="h-screen" />;
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <TooltipProvider>
      <BrowserRouter>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/masters/companies" element={<CompanyPage />} />
                <Route path="/masters/manufacturers" element={<ManufacturerPage />} />
                <Route path="/masters/products" element={<ProductPage />} />
                <Route path="/masters/partners" element={<PartnerPage />} />
                <Route path="/masters/warehouses" element={<WarehousePage />} />
                <Route path="/masters/banks" element={<BankPage />} />
                <Route path="/inbound" element={<InboundPage />} />
                <Route path="/procurement" element={<ProcurementPage />} />
                <Route path="/lc" element={<LCPage />} />
                <Route path="/outbound" element={<OutboundPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/customs" element={<CustomsPage />} />
                <Route path="/banking" element={<BankingPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/memo" element={<MemoPage />} />
                <Route path="/approval" element={<ApprovalPage />} />
                <Route path="/settings" element={<PlaceholderPage title="설정" stepNumber={32} />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  );
}
