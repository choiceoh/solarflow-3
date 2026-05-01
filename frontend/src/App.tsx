import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/authStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import RoleGuard from '@/components/auth/RoleGuard';
import AppLayout from '@/components/layout/AppLayout';
import LoadingSpinner from '@/components/common/LoadingSpinner';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const InboundPage = lazy(() => import('@/pages/InboundPage'));
const ProcurementPage = lazy(() => import('@/pages/ProcurementPage'));
const LCPage = lazy(() => import('@/pages/LCPage'));
const OutboundPage = lazy(() => import('@/pages/OutboundPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const CustomsPage = lazy(() => import('@/pages/CustomsPage'));
const SalesAnalysisPage = lazy(() => import('@/pages/SalesAnalysisPage'));
const BankingPage = lazy(() => import('@/pages/BankingPage'));
const ApprovalPage = lazy(() => import('@/pages/ApprovalPage'));
const MemoPage = lazy(() => import('@/pages/MemoPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const OCRPage = lazy(() => import('@/pages/OCRPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const CompanyPage = lazy(() => import('@/pages/masters/CompanyPage'));
const ManufacturerPage = lazy(() => import('@/pages/masters/ManufacturerPage'));
const ProductPage = lazy(() => import('@/pages/masters/ProductPage'));
const PartnerPage = lazy(() => import('@/pages/masters/PartnerPage'));
const WarehousePage = lazy(() => import('@/pages/masters/WarehousePage'));
const BankPage = lazy(() => import('@/pages/masters/BankPage'));
const ConstructionSitesPage = lazy(() => import('@/pages/masters/ConstructionSitesPage'));
const DataHubPage = lazy(() => import('@/pages/masters/DataHubPage'));
const DataPage = lazy(() => import('@/pages/DataPage'));
const CompanyNewPage = lazy(() => import('@/pages/data/CompanyNewPage'));
const CompanyEditPage = lazy(() => import('@/pages/data/CompanyEditPage'));
const ManufacturerNewPage = lazy(() => import('@/pages/data/ManufacturerNewPage'));
const ManufacturerEditPage = lazy(() => import('@/pages/data/ManufacturerEditPage'));
const ProductNewPage = lazy(() => import('@/pages/data/ProductNewPage'));
const ProductEditPage = lazy(() => import('@/pages/data/ProductEditPage'));
const PartnerNewPage = lazy(() => import('@/pages/data/PartnerNewPage'));
const PartnerEditPage = lazy(() => import('@/pages/data/PartnerEditPage'));
const WarehouseNewPage = lazy(() => import('@/pages/data/WarehouseNewPage'));
const WarehouseEditPage = lazy(() => import('@/pages/data/WarehouseEditPage'));
const BankNewPage = lazy(() => import('@/pages/data/BankNewPage'));
const BankEditPage = lazy(() => import('@/pages/data/BankEditPage'));
const PartnerPriceBookPage = lazy(() => import('@/pages/baro/PartnerPriceBookPage'));
const GroupPurchaseRequestPage = lazy(() => import('@/pages/baro/GroupPurchaseRequestPage'));
const BaroRequestInboxPage = lazy(() => import('@/pages/group-trade/BaroRequestInboxPage'));

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
                <Route index element={<Navigate to="/inventory" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/data" element={<RoleGuard allowedRoles={['admin', 'operator']}><DataPage /></RoleGuard>} />
                <Route path="/data/companies/new" element={<RoleGuard allowedRoles={['admin', 'operator']}><CompanyNewPage /></RoleGuard>} />
                <Route path="/data/companies/:id/edit" element={<RoleGuard allowedRoles={['admin', 'operator']}><CompanyEditPage /></RoleGuard>} />
                <Route path="/data/manufacturers/new" element={<RoleGuard allowedRoles={['admin', 'operator']}><ManufacturerNewPage /></RoleGuard>} />
                <Route path="/data/manufacturers/:id/edit" element={<RoleGuard allowedRoles={['admin', 'operator']}><ManufacturerEditPage /></RoleGuard>} />
                <Route path="/data/products/new" element={<RoleGuard allowedRoles={['admin', 'operator']}><ProductNewPage /></RoleGuard>} />
                <Route path="/data/products/:id/edit" element={<RoleGuard allowedRoles={['admin', 'operator']}><ProductEditPage /></RoleGuard>} />
                <Route path="/data/partners/new" element={<RoleGuard allowedRoles={['admin', 'operator']}><PartnerNewPage /></RoleGuard>} />
                <Route path="/data/partners/:id/edit" element={<RoleGuard allowedRoles={['admin', 'operator']}><PartnerEditPage /></RoleGuard>} />
                <Route path="/data/warehouses/new" element={<RoleGuard allowedRoles={['admin', 'operator']}><WarehouseNewPage /></RoleGuard>} />
                <Route path="/data/warehouses/:id/edit" element={<RoleGuard allowedRoles={['admin', 'operator']}><WarehouseEditPage /></RoleGuard>} />
                <Route path="/data/banks/new" element={<RoleGuard allowedRoles={['admin', 'operator']}><BankNewPage /></RoleGuard>} />
                <Route path="/data/banks/:id/edit" element={<RoleGuard allowedRoles={['admin', 'operator']}><BankEditPage /></RoleGuard>} />
                <Route path="/data/hub" element={<RoleGuard allowedRoles={['admin', 'operator']}><DataHubPage /></RoleGuard>} />
                <Route path="/masters/companies" element={<CompanyPage />} />
                <Route path="/masters/manufacturers" element={<ManufacturerPage />} />
                <Route path="/masters/products" element={<ProductPage />} />
                <Route path="/masters/partners" element={<PartnerPage />} />
                <Route path="/masters/warehouses" element={<WarehousePage />} />
                <Route path="/masters/banks" element={<BankPage />} />
                <Route path="/masters/construction-sites" element={<ConstructionSitesPage />} />
                <Route path="/inbound" element={<InboundPage />} />
                <Route path="/procurement" element={<ProcurementPage />} />
                <Route path="/lc" element={<LCPage />} />
                <Route path="/outbound" element={<OutboundPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/customs" element={<CustomsPage />} />
                <Route path="/sales-analysis" element={<SalesAnalysisPage />} />
                <Route path="/banking" element={<BankingPage />} />
                <Route path="/baro/price-book" element={<RoleGuard allowedRoles={['admin', 'operator']}><PartnerPriceBookPage /></RoleGuard>} />
                <Route path="/baro/group-purchase" element={<RoleGuard allowedRoles={['admin', 'operator']}><GroupPurchaseRequestPage /></RoleGuard>} />
                <Route path="/group-trade/baro-inbox" element={<RoleGuard allowedRoles={['admin', 'operator']}><BaroRequestInboxPage /></RoleGuard>} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/ocr" element={<RoleGuard allowedRoles={['admin', 'operator']}><OCRPage /></RoleGuard>} />
                <Route path="/memo" element={<MemoPage />} />
                <Route path="/approval" element={<ApprovalPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  );
}
