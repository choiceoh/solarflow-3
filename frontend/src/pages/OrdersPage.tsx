import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useOrderList } from '@/hooks/useOrders';
import { useReceiptList } from '@/hooks/useReceipts';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import OrderListTable from '@/components/orders/OrderListTable';
import OrderDetailView from '@/components/orders/OrderDetailView';
import OrderForm from '@/components/orders/OrderForm';
import ReceiptListTable from '@/components/orders/ReceiptListTable';
import ReceiptForm from '@/components/orders/ReceiptForm';
import ReceiptMatchingPanel from '@/components/orders/ReceiptMatchingPanel';
import {
  ORDER_STATUS_LABEL, MANAGEMENT_CATEGORY_LABEL,
  type OrderStatus, type ManagementCategory,
} from '@/types/orders';
import type { Partner } from '@/types/masters';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

export default function OrdersPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 수주
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [orderCustomerFilter, setOrderCustomerFilter] = useState('');
  const [orderCategoryFilter, setOrderCategoryFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [orderFormOpen, setOrderFormOpen] = useState(false);

  // 탭 2: 수금
  const [receiptCustomerFilter, setReceiptCustomerFilter] = useState('');
  const [receiptMonthFilter, setReceiptMonthFilter] = useState('');
  const [receiptFormOpen, setReceiptFormOpen] = useState(false);

  // 마스터 데이터
  const [partners, setPartners] = useState<Partner[]>([]);

  const orderFilters: { status?: string; customer_id?: string; management_category?: string } = {};
  if (orderStatusFilter) orderFilters.status = orderStatusFilter;
  if (orderCustomerFilter) orderFilters.customer_id = orderCustomerFilter;
  if (orderCategoryFilter) orderFilters.management_category = orderCategoryFilter;

  const receiptFilters: { customer_id?: string; month?: string } = {};
  if (receiptCustomerFilter) receiptFilters.customer_id = receiptCustomerFilter;
  if (receiptMonthFilter) receiptFilters.month = receiptMonthFilter;

  const { data: orders, loading: ordersLoading, reload: reloadOrders } = useOrderList(orderFilters);
  const { data: receipts, loading: receiptsLoading, reload: reloadReceipts } = useReceiptList(receiptFilters);

  useEffect(() => {
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
  }, []);

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  // 수주 상세
  if (selectedOrder) {
    return (
      <div className="p-6">
        <OrderDetailView orderId={selectedOrder} onBack={() => { setSelectedOrder(null); reloadOrders(); }} />
      </div>
    );
  }

  const handleCreateOrder = async (formData: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/orders', { method: 'POST', body: JSON.stringify(formData) });
    reloadOrders();
  };

  const handleCreateReceipt = async (formData: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/receipts', { method: 'POST', body: JSON.stringify(formData) });
    reloadReceipts();
  };

  // 월 목록 (최근 12개월)
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">수주/수금</h1>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">수주 관리</TabsTrigger>
          <TabsTrigger value="receipts">수금 관리</TabsTrigger>
          <TabsTrigger value="matching">수금 매칭</TabsTrigger>
        </TabsList>

        {/* 탭 1: 수주 관리 */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={orderStatusFilter || 'all'} onValueChange={(v) => setOrderStatusFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="상태" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {(Object.entries(ORDER_STATUS_LABEL) as [OrderStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={orderCustomerFilter || 'all'} onValueChange={(v) => setOrderCustomerFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="거래처" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={orderCategoryFilter || 'all'} onValueChange={(v) => setOrderCategoryFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="관리구분" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 구분</SelectItem>
                  {(Object.entries(MANAGEMENT_CATEGORY_LABEL) as [ManagementCategory, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <ExcelToolbar type="order" />
              <Button size="sm" onClick={() => setOrderFormOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />새로 등록
              </Button>
            </div>
          </div>

          {ordersLoading ? <LoadingSpinner /> : (
            <OrderListTable
              items={orders}
              onSelect={(o) => setSelectedOrder(o.order_id)}
              onNew={() => setOrderFormOpen(true)}
            />
          )}
        </TabsContent>

        {/* 탭 2: 수금 관리 */}
        <TabsContent value="receipts" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={receiptCustomerFilter || 'all'} onValueChange={(v) => setReceiptCustomerFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="거래처" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={receiptMonthFilter || 'all'} onValueChange={(v) => setReceiptMonthFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="월" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 기간</SelectItem>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <ExcelToolbar type="receipt" />
              <Button size="sm" onClick={() => setReceiptFormOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />새로 등록
              </Button>
            </div>
          </div>

          {receiptsLoading ? <LoadingSpinner /> : (
            <ReceiptListTable items={receipts} onNew={() => setReceiptFormOpen(true)} />
          )}
        </TabsContent>

        {/* 탭 3: 수금 매칭 */}
        <TabsContent value="matching" className="mt-4">
          <ReceiptMatchingPanel />
        </TabsContent>
      </Tabs>

      <OrderForm open={orderFormOpen} onOpenChange={setOrderFormOpen} onSubmit={handleCreateOrder} />
      <ReceiptForm open={receiptFormOpen} onOpenChange={setReceiptFormOpen} onSubmit={handleCreateReceipt} />
    </div>
  );
}
