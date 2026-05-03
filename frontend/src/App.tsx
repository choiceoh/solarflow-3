import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const InboundPage = lazy(() => import('@/pages/InboundPage'));
const ProcurementPage = lazy(() => import('@/pages/ProcurementPage'));
const PurchaseHistoryPage = lazy(() => import('@/pages/PurchaseHistoryPage'));
import { PurchaseHistoryErrorBoundary } from '@/pages/PurchaseHistoryErrorBoundary';
const LCPage = lazy(() => import('@/pages/LCPage'));
const OutboundPage = lazy(() => import('@/pages/OutboundPage'));
const OutboundV2Page = lazy(() => import('@/pages/OutboundV2Page'));
const OutboundFormMetaDemoPage = lazy(() => import('@/pages/OutboundFormMetaDemoPage'));
const OutboundDetailMetaDemoPage = lazy(() => import('@/pages/OutboundDetailMetaDemoPage'));
const DeclarationDetailMetaDemoPage = lazy(() => import('@/pages/DeclarationDetailMetaDemoPage'));
const MetaFormDepsDemoPage = lazy(() => import('@/pages/MetaFormDepsDemoPage'));
const MetaFeaturesDemoPage = lazy(() => import('@/pages/MetaFeaturesDemoPage'));
const BLMetaDemoPage = lazy(() => import('@/pages/BLMetaDemoPage'));
const POLineMetaDemoPage = lazy(() => import('@/pages/POLineMetaDemoPage'));
const CostMetaDemoPage = lazy(() => import('@/pages/CostMetaDemoPage'));
const ChildFormsMetaDemoPage = lazy(() => import('@/pages/ChildFormsMetaDemoPage'));
const WizardDemoPage = lazy(() => import('@/pages/WizardDemoPage'));
const PartnerV2Page = lazy(() => import('@/pages/PartnerV2Page'));
const CompaniesV2Page = lazy(() => import('@/pages/CompaniesV2Page'));
const BanksV2Page = lazy(() => import('@/pages/BanksV2Page'));
const WarehousesV2Page = lazy(() => import('@/pages/WarehousesV2Page'));
const ManufacturersV2Page = lazy(() => import('@/pages/ManufacturersV2Page'));
const ProductsV2Page = lazy(() => import('@/pages/ProductsV2Page'));
const ConstructionSitesV2Page = lazy(() => import('@/pages/ConstructionSitesV2Page'));
const UIConfigEditorPage = lazy(() => import('@/pages/UIConfigEditorPage'));
const OrdersPage = lazy(() => import('@/pages/OrdersPage'));
const CustomsPage = lazy(() => import('@/pages/CustomsPage'));
const SalesAnalysisPage = lazy(() => import('@/pages/SalesAnalysisPage'));
const BankingPage = lazy(() => import('@/pages/BankingPage'));
const ApprovalPage = lazy(() => import('@/pages/ApprovalPage'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const SettingsLayout = lazy(() => import('@/pages/settings/SettingsLayout'));
const SettingsIndexRedirect = lazy(() =>
  import('@/pages/settings/SettingsLayout').then((m) => ({ default: m.SettingsIndexRedirect })),
);
const AdminSettingsPage = lazy(() => import('@/pages/settings/AdminSettingsPage'));
const PersonalSettingsPage = lazy(() => import('@/pages/settings/PersonalSettingsPage'));
const SitePlaceholderPage = lazy(() => import('@/pages/settings/SitePlaceholderPage'));
const AssistantPage = lazy(() => import('@/pages/AssistantPage'));
const ConstructionSitesPage = lazy(() => import('@/pages/masters/ConstructionSitesPage'));
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
const CreditBoardPage = lazy(() => import('@/pages/baro/CreditBoardPage'));
const DispatchBoardPage = lazy(() => import('@/pages/baro/DispatchBoardPage'));
const CRMInboxPage = lazy(() => import('@/pages/CRMInboxPage'));
const TutorialMenuPage = lazy(() => import('@/onboarding/ui/TutorialMenuPage'));

function Fallback() {
  return <LoadingSpinner className="h-screen" />;
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
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/inventory" replace />} />
                <Route path="/dashboard" element={<Navigate to="/inventory" replace />} />
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
                <Route path="/masters/partners-v2" element={<PartnerV2Page />} />
                <Route path="/masters/companies-v2" element={<RoleGuard allowedRoles={['admin', 'operator']}><CompaniesV2Page /></RoleGuard>} />
                <Route path="/masters/banks-v2" element={<RoleGuard allowedRoles={['admin', 'operator']}><BanksV2Page /></RoleGuard>} />
                <Route path="/masters/warehouses-v2" element={<RoleGuard allowedRoles={['admin', 'operator']}><WarehousesV2Page /></RoleGuard>} />
                <Route path="/masters/manufacturers-v2" element={<RoleGuard allowedRoles={['admin', 'operator']}><ManufacturersV2Page /></RoleGuard>} />
                <Route path="/masters/products-v2" element={<RoleGuard allowedRoles={['admin', 'operator']}><ProductsV2Page /></RoleGuard>} />
                <Route path="/masters/construction-sites-v2" element={<RoleGuard allowedRoles={['admin', 'operator']}><ConstructionSitesV2Page /></RoleGuard>} />
                <Route path="/masters/construction-sites" element={<ConstructionSitesPage />} />
                <Route path="/inbound" element={<InboundPage />} />
                <Route path="/procurement" element={<ProcurementPage />} />
                <Route path="/purchase-history" element={<PurchaseHistoryErrorBoundary><PurchaseHistoryPage /></PurchaseHistoryErrorBoundary>} />
                <Route path="/lc" element={<LCPage />} />
                <Route path="/outbound" element={<OutboundPage />} />
                <Route path="/outbound-v2" element={<OutboundV2Page />} />
                <Route path="/outbound-form-meta-demo" element={<OutboundFormMetaDemoPage />} />
                <Route path="/outbound-detail-meta-demo" element={<OutboundDetailMetaDemoPage />} />
                <Route path="/declaration-detail-meta-demo" element={<DeclarationDetailMetaDemoPage />} />
                <Route path="/meta-form-deps-demo" element={<MetaFormDepsDemoPage />} />
                <Route path="/meta-features-demo" element={<MetaFeaturesDemoPage />} />
                <Route path="/bl-meta-demo" element={<BLMetaDemoPage />} />
                <Route path="/po-line-meta-demo" element={<POLineMetaDemoPage />} />
                <Route path="/cost-meta-demo" element={<CostMetaDemoPage />} />
                <Route path="/child-forms-meta-demo" element={<ChildFormsMetaDemoPage />} />
                <Route path="/wizard-demo" element={<WizardDemoPage />} />
                <Route path="/ui-config-editor" element={<RoleGuard allowedRoles={['admin']}><UIConfigEditorPage /></RoleGuard>} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/customs" element={<CustomsPage />} />
                <Route path="/sales-analysis" element={<SalesAnalysisPage />} />
                <Route path="/banking" element={<BankingPage />} />
                <Route path="/baro/price-book" element={<RoleGuard allowedRoles={['admin', 'operator']}><PartnerPriceBookPage /></RoleGuard>} />
                <Route path="/baro/group-purchase" element={<RoleGuard allowedRoles={['admin', 'operator']}><GroupPurchaseRequestPage /></RoleGuard>} />
                <Route path="/group-trade/baro-inbox" element={<RoleGuard allowedRoles={['admin', 'operator']}><BaroRequestInboxPage /></RoleGuard>} />
                <Route path="/baro/credit-board" element={<CreditBoardPage />} />
                <Route path="/baro/dispatch" element={<RoleGuard allowedRoles={['admin', 'operator']}><DispatchBoardPage /></RoleGuard>} />
                <Route path="/crm/inbox" element={<CRMInboxPage />} />
                <Route path="/tutorial" element={<TutorialMenuPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/approval" element={<ApprovalPage />} />
                <Route path="/assistant" element={<AssistantPage />} />
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsIndexRedirect />} />
                  <Route path="admin" element={<RoleGuard allowedRoles={['admin']}><AdminSettingsPage /></RoleGuard>} />
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
