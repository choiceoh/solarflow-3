import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAppStore } from '@/stores/appStore';
import { useOrderList } from '@/hooks/useOrders';
import { useReceiptList } from '@/hooks/useReceipts';
import { useOutboundList, useSaleList } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import OrderListTable from '@/components/orders/OrderListTable';
import OrderDetailView from '@/components/orders/OrderDetailView';
import OrderForm, { type OrderPrefillData } from '@/components/orders/OrderForm';
import ReceiptListTable from '@/components/orders/ReceiptListTable';
import ReceiptForm from '@/components/orders/ReceiptForm';
import ReceiptMatchingPanel from '@/components/orders/ReceiptMatchingPanel';
import OutboundListTable from '@/components/outbound/OutboundListTable';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import OutboundForm from '@/components/outbound/OutboundForm';
import SaleListTable from '@/components/outbound/SaleListTable';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import {
  ORDER_STATUS_LABEL, MANAGEMENT_CATEGORY_LABEL,
  type OrderStatus, type ManagementCategory, type Receipt,
} from '@/types/orders';
import { OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL, type OutboundStatus, type UsageCategory } from '@/types/outbound';
import type { Partner, Manufacturer } from '@/types/masters';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

function FT({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

export default function OrdersPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 수주
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [orderCustomerFilter, setOrderCustomerFilter] = useState('');
  const [orderCategoryFilter, setOrderCategoryFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const _loc = useLocation();
  const navigate = useNavigate();
  // URL 탭 파라미터 읽기 (사이드바 수주/수금 링크 구분)
  const urlTab = new URLSearchParams(_loc.search).get('tab') ?? 'orders';
  const [activeTab, setActiveTab] = useState(urlTab);
  useEffect(() => {
    const t = new URLSearchParams(_loc.search).get('tab') ?? 'orders';
    setActiveTab(t);
    setSelectedOrder(null);
  }, [_loc.key, _loc.search]);

  // 가용재고 배정 → 수주 자동 연동: 마운트 시 URL 파라미터 읽어 폼 자동 오픈
  // window.location.href로 이동하므로 컴포넌트가 새로 마운트됨 → 빈 deps 배열 사용
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') !== '1') return;
    const allocId  = params.get('alloc_id');
    const productId = params.get('product_id');
    const qty = params.get('qty');
    if (!allocId || !productId || !qty) return;

    const purpose       = params.get('purpose') ?? 'sale';
    const sourceType    = params.get('source_type') ?? 'stock';
    const customer      = params.get('customer') ?? undefined;
    const site          = params.get('site') ?? undefined;
    const orderNo       = params.get('order_no') ?? undefined;
    const linkedAllocId = params.get('linked_alloc_id') ?? undefined;

    setPendingAllocId(allocId);
    if (linkedAllocId) setPendingLinkedAllocId(linkedAllocId);
    setOrderFormPrefill({
      product_id: productId,
      quantity: parseInt(qty, 10),
      management_category: purpose === 'construction' ? 'construction' : 'sale',
      fulfillment_source: sourceType === 'incoming' ? 'incoming' : 'stock',
      customer_hint: customer,
      site_name: site,
      order_number: orderNo,
    });
    setOrderFormOpen(true);
    // URL 정리 (파라미터 제거)
    navigate('/orders', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(tab === 'orders' ? '/orders' : `/orders?tab=${tab}`, { replace: true });
  };
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  // 가용재고 배정 → 수주 자동 연동
  const [pendingAllocId, setPendingAllocId] = useState<string | null>(null);
  const [pendingLinkedAllocId, setPendingLinkedAllocId] = useState<string | null>(null); // 연관 미착품 alloc_id
  const [orderFormPrefill, setOrderFormPrefill] = useState<OrderPrefillData | null>(null);

  // 탭 2: 출고
  const [obStatusFilter, setObStatusFilter] = useState('');
  const [obUsageFilter, setObUsageFilter] = useState('');
  const [obMfgFilter, setObMfgFilter] = useState('');
  const [selectedOutbound, setSelectedOutbound] = useState<string | null>(null);
  const [obFormOpen, setObFormOpen] = useState(false);
  const obFilters: { status?: string; usage_category?: string; manufacturer_id?: string } = {};
  if (obStatusFilter) obFilters.status = obStatusFilter;
  if (obUsageFilter) obFilters.usage_category = obUsageFilter;
  if (obMfgFilter) obFilters.manufacturer_id = obMfgFilter;
  const { data: outbounds, loading: obLoading, reload: reloadOutbounds } = useOutboundList(obFilters);

  // 탭 3: 판매
  const [saleCustomerFilter, setSaleCustomerFilter] = useState('');
  const [saleMonthFilter, setSaleMonthFilter] = useState('');
  const [saleInvoiceFilter, setSaleInvoiceFilter] = useState('');
  const saleFilters: { customer_id?: string; month?: string; invoice_status?: string } = {};
  if (saleCustomerFilter) saleFilters.customer_id = saleCustomerFilter;
  if (saleMonthFilter) saleFilters.month = saleMonthFilter;
  if (saleInvoiceFilter) saleFilters.invoice_status = saleInvoiceFilter;
  const { data: sales, loading: saleLoading, reload: reloadSales } = useSaleList(saleFilters);

  // 탭 4: 수금
  const [receiptCustomerFilter, setReceiptCustomerFilter] = useState('');
  const [receiptMonthFilter, setReceiptMonthFilter] = useState('');
  const [receiptFormOpen, setReceiptFormOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<Receipt | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // 마스터 데이터
  const [partners, setPartners] = useState<Partner[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);

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
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
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
    const created = await fetchWithAuth<{ order_id: string }>(
      '/api/v1/orders', { method: 'POST', body: JSON.stringify(formData) }
    );

    // 함수 호출 시점 값 캡처 (setState는 비동기 → 함수 내내 원본값 유지됨)
    const origAllocId        = pendingAllocId;
    const origLinkedAllocId  = pendingLinkedAllocId;

    // ① 메인 배정 confirmed + order_id 설정
    if (origAllocId && created?.order_id) {
      await fetchWithAuth(`/api/v1/inventory/allocations/${origAllocId}`, {
        method: 'PUT',
        body: JSON.stringify({ order_id: created.order_id, status: 'confirmed' }),
      }).catch(() => {});
      setPendingAllocId(null);
      setOrderFormPrefill(null);
    }

    // ② 연관 미착품 배정 confirmed (group_id로 묶인 쌍)
    if (origLinkedAllocId && created?.order_id) {
      await fetchWithAuth(`/api/v1/inventory/allocations/${origLinkedAllocId}`, {
        method: 'PUT',
        body: JSON.stringify({ order_id: created.order_id, status: 'confirmed' }),
      }).catch(() => {});
      setPendingLinkedAllocId(null);
    }

    // ③ 스페어 처리 — 예정등록 → 수주 흐름에서만
    //   - 예정 시 스페어 있었음 → pending 상태의 [무상스페어] alloc을 confirmed로 전환
    //   - 예정 시 스페어 없었음 + 수주 시 새로 입력됨 → 신규 스페어 alloc 생성 후 confirmed
    if (created?.order_id && origAllocId && formData.product_id) {
      try {
        const spareQty = Number(formData.spare_qty) || 0;
        // 같은 품목·법인의 pending 무상스페어 배정 탐색 (예정등록 시 자동 생성된 것)
        const pendingList = await fetchWithAuth<Array<{ alloc_id: string; notes?: string }>>(
          `/api/v1/inventory/allocations?company_id=${selectedCompanyId}&product_id=${formData.product_id as string}&status=pending`
        ).catch(() => [] as Array<{ alloc_id: string; notes?: string }>);

        const reservationSpare = pendingList.find(a => a.notes?.startsWith('[무상스페어]'));

        if (reservationSpare) {
          // 예정 시 스페어 있었음 → confirm 처리 (order_id 연결)
          await fetchWithAuth(`/api/v1/inventory/allocations/${reservationSpare.alloc_id}`, {
            method: 'PUT',
            body: JSON.stringify({ order_id: created.order_id, status: 'confirmed' }),
          }).catch(() => {});
        } else if (spareQty > 0) {
          // 예정 시 스페어 없었음 + 수주 시 신규 입력 → 가용재고 차감 allocation 생성
          const orderQty = Number(formData.quantity) || 1;
          const capKw    = Number(formData.capacity_kw) || 0;
          const spareCapKw = orderQty > 0 ? (capKw / orderQty) * spareQty : 0;
          await fetchWithAuth('/api/v1/inventory/allocations', {
            method: 'POST',
            body: JSON.stringify({
              company_id:    selectedCompanyId,
              product_id:    formData.product_id,
              quantity:      spareQty,
              capacity_kw:   spareCapKw,
              purpose:       'sale',
              source_type:   'stock',
              status:        'confirmed',
              order_id:      created.order_id,
              free_spare_qty: 0,
              notes:         '[무상스페어]',
            }),
          }).catch(() => {});
        }
      } catch {
        // 스페어 처리 실패는 수주 저장 자체에 영향 없음
      }
    }

    // ④ 수주 수량 ≠ 배정 수량 → 가용재고 차감/복원 조정
    //   delta > 0: 수주가 배정보다 많음 → 초과분 confirmed allocation 신규 생성
    //   delta < 0: 수주가 배정보다 적음 → 배정 수량 축소 (초과 배정 가용재고로 복원)
    if (created?.order_id && origAllocId && orderFormPrefill?.quantity && formData.product_id) {
      const orderQty = Number(formData.quantity) || 0;
      const allocQty = orderFormPrefill.quantity;
      const delta    = orderQty - allocQty;
      const capKw    = Number(formData.capacity_kw) || 0;

      if (delta > 0) {
        const deltaKw = orderQty > 0 ? (capKw / orderQty) * delta : 0;
        await fetchWithAuth('/api/v1/inventory/allocations', {
          method: 'POST',
          body: JSON.stringify({
            company_id:  selectedCompanyId,
            product_id:  formData.product_id,
            quantity:    delta,
            capacity_kw: deltaKw,
            purpose:     'sale',
            source_type: 'stock',
            status:      'confirmed',
            order_id:    created.order_id,
            notes:       '[수주증가분]',
          }),
        }).catch(() => {});
      } else if (delta < 0) {
        // 배정 alloc 수량 축소 (이미 confirmed 상태이므로 PUT 가능)
        await fetchWithAuth(`/api/v1/inventory/allocations/${origAllocId}`, {
          method: 'PUT',
          body: JSON.stringify({ quantity: orderQty, capacity_kw: capKw }),
        }).catch(() => {});
      }
    }

    reloadOrders();
  };

  const handleCreateOutbound = async (formData: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/outbounds', { method: 'POST', body: JSON.stringify(formData) });
    reloadOutbounds();
  };

  const handleSubmitReceipt = async (formData: Record<string, unknown>) => {
    if (editingReceipt) {
      await fetchWithAuth(`/api/v1/receipts/${editingReceipt.receipt_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/receipts', { method: 'POST', body: JSON.stringify(formData) });
    }
    reloadReceipts();
  };

  const handleDeleteReceipt = async () => {
    if (!deletingReceipt) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await fetchWithAuth(`/api/v1/receipts/${deletingReceipt.receipt_id}`, { method: 'DELETE' });
      setDeletingReceipt(null);
      reloadReceipts();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    }
    setDeleteLoading(false);
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

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="orders">수주</TabsTrigger>
          <TabsTrigger value="outbound">출고</TabsTrigger>
          <TabsTrigger value="sales">판매</TabsTrigger>
          <TabsTrigger value="receipts">수금</TabsTrigger>
          <TabsTrigger value="matching">수금매칭</TabsTrigger>
        </TabsList>

        {/* 탭 1: 수주 관리 */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={orderStatusFilter || 'all'} onValueChange={(v) => setOrderStatusFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><FT text={orderStatusFilter ? (ORDER_STATUS_LABEL[orderStatusFilter as OrderStatus] ?? '') : '전체 상태'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {(Object.entries(ORDER_STATUS_LABEL) as [OrderStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={orderCustomerFilter || 'all'} onValueChange={(v) => setOrderCustomerFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs"><FT text={orderCustomerFilter ? (partners.find(p => p.partner_id === orderCustomerFilter)?.partner_name ?? '') : '전체 거래처'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={orderCategoryFilter || 'all'} onValueChange={(v) => setOrderCategoryFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-32 text-xs"><FT text={orderCategoryFilter ? (MANAGEMENT_CATEGORY_LABEL[orderCategoryFilter as ManagementCategory] ?? '') : '전체 구분'} /></SelectTrigger>
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

        {/* 탭 2: 출고 관리 */}
        <TabsContent value="outbound" className="space-y-4 mt-4">
          {selectedOutbound ? (
            <OutboundDetailView
              outboundId={selectedOutbound}
              onBack={() => { setSelectedOutbound(null); reloadOutbounds(); reloadSales(); }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Select value={obStatusFilter || 'all'} onValueChange={(v) => setObStatusFilter(v === 'all' ? '' : (v ?? ''))}>
                    <SelectTrigger className="h-8 w-28 text-xs"><FT text={obStatusFilter ? (OUTBOUND_STATUS_LABEL[obStatusFilter as OutboundStatus] ?? obStatusFilter) : '전체 상태'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 상태</SelectItem>
                      {(Object.entries(OUTBOUND_STATUS_LABEL) as [OutboundStatus, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={obUsageFilter || 'all'} onValueChange={(v) => setObUsageFilter(v === 'all' ? '' : (v ?? ''))}>
                    <SelectTrigger className="h-8 w-36 text-xs"><FT text={obUsageFilter ? ((USAGE_CATEGORY_LABEL as Record<string, string>)[obUsageFilter] ?? obUsageFilter) : '전체 용도'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 용도</SelectItem>
                      {(Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={obMfgFilter || 'all'} onValueChange={(v) => setObMfgFilter(v === 'all' ? '' : (v ?? ''))}>
                    <SelectTrigger className="h-8 w-32 text-xs"><FT text={obMfgFilter ? (manufacturers.find(m => m.manufacturer_id === obMfgFilter)?.name_kr ?? obMfgFilter) : '전체 제조사'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 제조사</SelectItem>
                      {manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <ExcelToolbar type="outbound" />
                  <Button size="sm" onClick={() => setObFormOpen(true)}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
                </div>
              </div>
              {obLoading ? <LoadingSpinner /> : (
                <OutboundListTable items={outbounds} onSelect={(ob) => setSelectedOutbound(ob.outbound_id)} onNew={() => setObFormOpen(true)} />
              )}
            </>
          )}
        </TabsContent>

        {/* 탭 3: 판매 관리 */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={saleCustomerFilter || 'all'} onValueChange={(v) => setSaleCustomerFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs"><FT text={saleCustomerFilter ? (partners.find(p => p.partner_id === saleCustomerFilter)?.partner_name ?? saleCustomerFilter) : '전체 거래처'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {partners.map((p) => <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={saleMonthFilter || 'all'} onValueChange={(v) => setSaleMonthFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><FT text={saleMonthFilter || '전체 기간'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 기간</SelectItem>
                  {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={saleInvoiceFilter || 'all'} onValueChange={(v) => setSaleInvoiceFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-32 text-xs"><FT text={saleInvoiceFilter === 'issued' ? '계산서 발행' : saleInvoiceFilter === 'pending' ? '미발행' : '전체'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="issued">계산서 발행</SelectItem>
                  <SelectItem value="pending">계산서 미발행</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ExcelToolbar type="sale" />
          </div>
          {saleLoading ? <LoadingSpinner /> : (
            <>
              <SaleSummaryCards items={sales} />
              <SaleListTable items={sales} />
            </>
          )}
        </TabsContent>

        {/* 탭 4: 수금 관리 */}
        <TabsContent value="receipts" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={receiptCustomerFilter || 'all'} onValueChange={(v) => setReceiptCustomerFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs"><FT text={receiptCustomerFilter ? (partners.find(p => p.partner_id === receiptCustomerFilter)?.partner_name ?? '') : '전체 거래처'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={receiptMonthFilter || 'all'} onValueChange={(v) => setReceiptMonthFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><FT text={receiptMonthFilter || '전체 기간'} /></SelectTrigger>
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
            <ReceiptListTable
              items={receipts}
              onNew={() => setReceiptFormOpen(true)}
              onEdit={(r) => { setEditingReceipt(r); setReceiptFormOpen(true); }}
              onDelete={(r) => { setDeleteError(''); setDeletingReceipt(r); }}
            />
          )}
          {deleteError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{deleteError}</div>}
        </TabsContent>

        {/* 탭 3: 수금 매칭 */}
        <TabsContent value="matching" className="mt-4">
          <ReceiptMatchingPanel />
        </TabsContent>
      </Tabs>

      <OrderForm
        open={orderFormOpen}
        onOpenChange={(o) => {
          setOrderFormOpen(o);
          // 폼 닫힐 때(저장 취소) 배정 연동 상태 초기화
          if (!o) { setPendingAllocId(null); setOrderFormPrefill(null); }
        }}
        onSubmit={handleCreateOrder}
        prefillData={orderFormPrefill}
      />
      <OutboundForm open={obFormOpen} onOpenChange={setObFormOpen} onSubmit={handleCreateOutbound} />
      <ReceiptForm
        open={receiptFormOpen}
        onOpenChange={(o) => { setReceiptFormOpen(o); if (!o) setEditingReceipt(null); }}
        onSubmit={handleSubmitReceipt}
        editData={editingReceipt}
      />
      <ConfirmDialog
        open={!!deletingReceipt}
        onOpenChange={(o) => { if (!o) setDeletingReceipt(null); }}
        title="수금 삭제"
        description={deletingReceipt ? `${deletingReceipt.customer_name ?? ''} ${deletingReceipt.amount.toLocaleString()}원 수금을 삭제합니다. 연결된 매칭도 함께 제거됩니다.` : ''}
        onConfirm={handleDeleteReceipt}
        loading={deleteLoading}
      />
    </div>
  );
}
