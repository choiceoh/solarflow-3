import { Component, useState, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, ScrollText, Truck, Receipt as ReceiptIcon, Wallet, GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
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
import SaleForm from '@/components/outbound/SaleForm';
import SaleListTable from '@/components/outbound/SaleListTable';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import type { InventoryAllocation } from '@/components/inventory/AllocationForm';
import {
  ORDER_STATUS_LABEL, MANAGEMENT_CATEGORY_LABEL,
  type FulfillmentSource, type Order, type OrderStatus, type ManagementCategory, type Receipt,
} from '@/types/orders';
import { OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL, type Outbound, type OutboundStatus, type UsageCategory, type Sale, type SaleListItem } from '@/types/outbound';
import type { Partner, Manufacturer } from '@/types/masters';
import type { InventoryResponse } from '@/types/inventory';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

function FT({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

class OrderDetailErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[Order detail render failed]', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="font-medium">수주 상세 화면을 불러오지 못했습니다.</div>
        <p className="mt-1 text-xs">목록은 유지되도록 막아두었습니다. 잠시 후 다시 열어주세요.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={this.props.onBack}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }
}

const isFreeSpareAlloc = (a: InventoryAllocation) => a.notes?.startsWith('[무상스페어]') ?? false;

function isLinkedFreeSpare(main: InventoryAllocation, candidate: InventoryAllocation): boolean {
  if (candidate.alloc_id === main.alloc_id || !isFreeSpareAlloc(candidate)) return false;
  if (candidate.company_id !== main.company_id || candidate.product_id !== main.product_id) return false;
  if (candidate.purpose !== main.purpose) return false;
  if (main.group_id && candidate.group_id) return main.group_id === candidate.group_id;
  return (
    (candidate.customer_name ?? '') === (main.customer_name ?? '') &&
    (candidate.site_name ?? '') === (main.site_name ?? '') &&
    (candidate.bl_id ?? '') === (main.bl_id ?? '')
  );
}

export default function OrdersPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 수주
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [orderCustomerFilter, setOrderCustomerFilter] = useState('');
  const [orderCategoryFilter, setOrderCategoryFilter] = useState('');
  const _loc = useLocation();
  const navigate = useNavigate();
  const [selectedOrderState, setSelectedOrderState] = useState<{ id: string | null; locationKey: string }>({
    id: null,
    locationKey: _loc.key,
  });
  const selectedOrder = selectedOrderState.locationKey === _loc.key ? selectedOrderState.id : null;
  const setSelectedOrder = (id: string | null) => setSelectedOrderState({ id, locationKey: _loc.key });
  // URL 탭 파라미터 읽기 (사이드바 수주/수금 링크 구분)
  const urlTab = new URLSearchParams(_loc.search).get('tab') ?? 'orders';
  const activeTab = urlTab;
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  // 가용재고 배정 → 수주 자동 연동
  const [pendingAllocId, setPendingAllocId] = useState<string | null>(null);
  const [pendingLinkedAllocId, setPendingLinkedAllocId] = useState<string | null>(null); // 연관 미착품 alloc_id
  const [orderFormPrefill, setOrderFormPrefill] = useState<OrderPrefillData | null>(null);

  // 가용재고 배정 → 수주 자동 연동: 마운트 시 URL 파라미터 읽어 폼 자동 오픈
  // window.location.href로 이동하므로 컴포넌트가 새로 마운트됨 → 빈 deps 배열 사용
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') !== '1') return;
    const allocId  = params.get('alloc_id');
    const companyId = params.get('company_id') ?? undefined;
    const productId = params.get('product_id');
    const qty = params.get('qty');
    if (!allocId || !productId || !qty) return;

    const purpose       = params.get('purpose') ?? 'sale';
    const sourceType    = params.get('source_type') ?? 'stock';
    const customer      = params.get('customer') ?? undefined;
    const site          = params.get('site') ?? undefined;
    const orderNo       = params.get('order_no') ?? undefined;
    const linkedAllocId = params.get('linked_alloc_id') ?? undefined;
    const blId          = params.get('bl_id') ?? undefined;
    const expectedPrice = params.get('expected_price_per_wp');
    const spareQty      = params.get('spare_qty');

    let cancelled = false;
    const openPrefilledOrder = async () => {
      let effectiveCompanyId = companyId;
      if (!effectiveCompanyId || effectiveCompanyId === 'all') {
        try {
          const alloc = await fetchWithAuth<InventoryAllocation>(`/api/v1/inventory/allocations/${allocId}`);
          effectiveCompanyId = alloc.company_id;
        } catch {
          effectiveCompanyId = undefined;
        }
      }
      if (cancelled) return;

      setPendingAllocId(allocId);
      if (linkedAllocId) setPendingLinkedAllocId(linkedAllocId);
      setOrderFormPrefill({
        alloc_id: allocId,
        company_id: effectiveCompanyId,
        product_id: productId,
        quantity: parseInt(qty, 10),
        management_category: purpose === 'construction' ? 'construction' : 'sale',
        fulfillment_source: sourceType === 'incoming' ? 'incoming' : 'stock',
        customer_hint: customer,
        site_name: site,
        order_number: orderNo,
        bl_id: blId,
        expected_price_per_wp: expectedPrice ? Number(expectedPrice) : undefined,
        spare_qty: spareQty ? Number(spareQty) : undefined,
      });
      setOrderFormOpen(true);
      // URL 정리 (파라미터 제거)
      navigate('/orders', { replace: true });
    };

    void openPrefilledOrder();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleTabChange = (tab: string) => {
    setSelectedOrder(null);
    navigate(tab === 'orders' ? '/orders' : `/orders?tab=${tab}`, { replace: true });
  };

  // 탭 2: 출고
  const [obStatusFilter, setObStatusFilter] = useState('');
  const [obUsageFilter, setObUsageFilter] = useState('');
  const [obMfgFilter, setObMfgFilter] = useState('');
  const [selectedOutbound, setSelectedOutbound] = useState<string | null>(null);
  const [obFormOpen, setObFormOpen] = useState(false);
  const [outboundOrder, setOutboundOrder] = useState<Order | null>(null);
  const [invoiceOutbound, setInvoiceOutbound] = useState<Outbound | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<(Order & { sale?: Sale }) | null>(null);
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
  const { data: outboundSales, reload: reloadOutboundSales } = useSaleList({});

  // 탭 4: 수금
  const [receiptCustomerFilter, setReceiptCustomerFilter] = useState('');
  const [receiptMonthFilter, setReceiptMonthFilter] = useState('');
  const [receiptFormOpen, setReceiptFormOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
  const [deletingReceipt, setDeletingReceipt] = useState<Receipt | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null);
  const [orderActionLoading, setOrderActionLoading] = useState(false);
  const [orderActionError, setOrderActionError] = useState('');
  const [orderSourceHints, setOrderSourceHints] = useState<Record<string, FulfillmentSource>>({});

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
    const incomingOrders = orders.filter((order) =>
      order.fulfillment_source === 'incoming' &&
      order.status !== 'cancelled' &&
      order.company_id &&
      order.product_id
    );
    if (incomingOrders.length === 0) {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setOrderSourceHints({});
      });
      return () => { cancelled = true; };
    }

    let cancelled = false;
    const loadHints = async () => {
      const companyIds = [...new Set(incomingOrders.map((order) => order.company_id))];
      const inventoryEntries = await Promise.all(
        companyIds.map((companyId) =>
          fetchWithAuth<InventoryResponse>('/api/v1/calc/inventory', {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId }),
          })
            .then((result): [string, InventoryResponse] | null => [companyId, result])
            .catch(() => null),
        ),
      );
      if (cancelled) return;

      const inventoryByCompany = new Map(
        inventoryEntries.filter(Boolean) as [string, InventoryResponse][]
      );
      const groupedOrders = new Map<string, Order[]>();
      for (const order of incomingOrders) {
        const key = `${order.company_id}:${order.product_id}`;
        groupedOrders.set(key, [...(groupedOrders.get(key) ?? []), order]);
      }

      const next: Record<string, FulfillmentSource> = {};
      for (const group of groupedOrders.values()) {
        const first = group[0];
        const inventory = inventoryByCompany.get(first.company_id);
        const item = inventory?.items.find((it) => it.product_id === first.product_id);
        let remainingStockKw = item?.available_kw ?? 0;
        for (const order of [...group].sort((a, b) => a.order_date.localeCompare(b.order_date))) {
          const needKw = order.capacity_kw ?? (order.quantity * (order.wattage_kw ?? 0));
          if (needKw > 0 && remainingStockKw + 0.001 >= needKw) {
            next[order.order_id] = 'stock';
            remainingStockKw -= needKw;
          }
        }
      }
      setOrderSourceHints(next);
    };

    void loadHints();
    return () => { cancelled = true; };
  }, [orders]);

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
    const backToOrders = () => {
      setSelectedOrder(null);
      reloadOrders();
    };
    return (
      <div className="p-6">
        <OrderDetailErrorBoundary key={selectedOrder} onBack={backToOrders}>
          <OrderDetailView orderId={selectedOrder} onBack={backToOrders} />
        </OrderDetailErrorBoundary>
      </div>
    );
  }

  const handleCreateOrder = async (formData: Record<string, unknown>) => {
    const requestedQty = Number(formData.quantity) || 0;
    if (pendingAllocId && orderFormPrefill?.quantity && requestedQty > orderFormPrefill.quantity) {
      throw new Error('예약 수량보다 많은 수주는 먼저 가용재고에서 추가 예약한 뒤 등록해주세요.');
    }

    const created = await fetchWithAuth<{ order_id: string }>(
      '/api/v1/orders', { method: 'POST', body: JSON.stringify(formData) }
    );

    // 함수 호출 시점 값 캡처 (setState는 비동기 → 함수 내내 원본값 유지됨)
    const origAllocId        = pendingAllocId;
    const origLinkedAllocId  = pendingLinkedAllocId;

    const createdOrderId = created?.order_id;
    const resolvedSource = formData.fulfillment_source === 'incoming' ? 'incoming' : 'stock';

    // ① 메인 배정 confirmed + order_id 설정. 일부 수주이면 잔량 처리 선택
    if (origAllocId && created?.order_id) {
      const originalAlloc = await fetchWithAuth<InventoryAllocation>(`/api/v1/inventory/allocations/${origAllocId}`);
      const orderQty = Number(formData.quantity) || 0;
      const orderKw = Number(formData.capacity_kw) || 0;
      const unitKw = orderQty > 0 ? orderKw / orderQty : ((originalAlloc.capacity_kw ?? 0) / originalAlloc.quantity);
      const remainingQty = Math.max(originalAlloc.quantity - orderQty, 0);

      await fetchWithAuth(`/api/v1/inventory/allocations/${origAllocId}`, {
        method: 'PUT',
        body: JSON.stringify({
          order_id: created.order_id,
          status: 'confirmed',
          quantity: orderQty,
          capacity_kw: orderQty * unitKw,
          source_type: resolvedSource,
        }),
      });

      if (remainingQty > 0) {
        let residualStatus: 'pending' | 'hold' | 'cancelled' = 'cancelled';
        if (window.confirm(`예약 잔량 ${remainingQty.toLocaleString('ko-KR')}EA를 계속 예약으로 유지할까요?`)) {
          residualStatus = 'pending';
        } else if (window.confirm('예약 잔량을 보류로 남길까요? 취소하면 잔량 예약은 삭제됩니다.')) {
          residualStatus = 'hold';
        }

        if (residualStatus !== 'cancelled') {
          await fetchWithAuth('/api/v1/inventory/allocations', {
            method: 'POST',
            body: JSON.stringify({
              company_id: originalAlloc.company_id,
              product_id: originalAlloc.product_id,
              quantity: remainingQty,
              capacity_kw: remainingQty * unitKw,
              purpose: originalAlloc.purpose,
              source_type: resolvedSource,
              customer_name: originalAlloc.customer_name,
              site_name: originalAlloc.site_name,
              site_id: originalAlloc.site_id,
              notes: originalAlloc.notes,
              expected_price_per_wp: originalAlloc.expected_price_per_wp,
              free_spare_qty: originalAlloc.free_spare_qty,
              group_id: originalAlloc.group_id,
              bl_id: originalAlloc.bl_id,
              status: residualStatus,
            }),
          });
        }
      }
      setPendingAllocId(null);
      setOrderFormPrefill(null);
    }

    // ② 연관 미착품 배정 confirmed (group_id로 묶인 쌍)
    if (origLinkedAllocId && created?.order_id) {
      await fetchWithAuth(`/api/v1/inventory/allocations/${origLinkedAllocId}`, {
        method: 'PUT',
        body: JSON.stringify({ order_id: created.order_id, status: 'confirmed' }),
      });
      setPendingLinkedAllocId(null);
    }

    // ③ 스페어 처리 — 예정등록 → 수주 흐름에서만
    //   - 예정 시 스페어 있었음 → pending 상태의 [무상스페어] alloc을 confirmed로 전환
    //   - 예정 시 스페어 없었음 + 수주 시 새로 입력됨 → 신규 스페어 alloc 생성 후 confirmed
    if (createdOrderId && origAllocId && formData.product_id) {
      const spareQty = Number(formData.spare_qty) || 0;
      const originalAlloc = await fetchWithAuth<InventoryAllocation>(`/api/v1/inventory/allocations/${origAllocId}`);
      // 같은 예약에 딸린 pending 무상스페어만 탐색 (다른 거래처의 무상스페어 오연결 방지)
      const pendingList = await fetchWithAuth<InventoryAllocation[]>(
        `/api/v1/inventory/allocations?company_id=${originalAlloc.company_id}&product_id=${formData.product_id as string}&status=pending`
      );

      const reservationSpare = pendingList.find((a) => isLinkedFreeSpare(originalAlloc, a));

      if (reservationSpare) {
        // 예정 시 스페어 있었음 → confirm 처리 (order_id 연결)
        await fetchWithAuth(`/api/v1/inventory/allocations/${reservationSpare.alloc_id}`, {
          method: 'PUT',
          body: JSON.stringify({ order_id: created.order_id, status: 'confirmed' }),
        });
      } else if (spareQty > 0) {
        // 예정 시 스페어 없었음 + 수주 시 신규 입력 → 가용재고 차감 allocation 생성
        const orderQty = Number(formData.quantity) || 1;
        const capKw    = Number(formData.capacity_kw) || 0;
        const spareCapKw = orderQty > 0 ? (capKw / orderQty) * spareQty : 0;
        await fetchWithAuth('/api/v1/inventory/allocations', {
          method: 'POST',
          body: JSON.stringify({
            company_id:    originalAlloc.company_id,
            product_id:    formData.product_id,
            quantity:      spareQty,
            capacity_kw:   spareCapKw,
            purpose:       'sale',
            source_type:   resolvedSource,
            status:        'confirmed',
            order_id:      created.order_id,
            bl_id:         formData.bl_id,
            free_spare_qty: 0,
            notes:         '[무상스페어]',
          }),
        });
      }
    }

    reloadOrders();
  };

  const handleUpdateOrder = async (formData: Record<string, unknown>) => {
    if (!editingOrder) return;
    await fetchWithAuth(`/api/v1/orders/${editingOrder.order_id}`, {
      method: 'PUT',
      body: JSON.stringify(formData),
    });
    setEditingOrder(null);
    reloadOrders();
  };

  const handleDeleteOrder = async () => {
    if (!deletingOrder) return;
    setOrderActionLoading(true);
    setOrderActionError('');
    try {
      await fetchWithAuth(`/api/v1/orders/${deletingOrder.order_id}`, { method: 'DELETE' });
      setDeletingOrder(null);
      reloadOrders();
    } catch (err) {
      setOrderActionError(err instanceof Error ? err.message : '수주 삭제에 실패했습니다');
    }
    setOrderActionLoading(false);
  };

  const purposeFromOrder = (order: Order): InventoryAllocation['purpose'] => {
    if (order.management_category === 'construction' || order.management_category === 'repowering') return 'construction_own';
    if (order.management_category === 'other') return 'other';
    return 'sale';
  };

  const handleCancelOrderToReservation = async (order: Order) => {
    if ((order.shipped_qty ?? 0) > 0) {
      setOrderActionError('이미 출고된 수주는 예약으로 복귀할 수 없습니다. 출고 취소 흐름을 먼저 진행해주세요.');
      return;
    }
    if (!window.confirm('수주를 취소하고 같은 수량을 가용재고 예약으로 되돌릴까요?')) return;

    setOrderActionLoading(true);
    setOrderActionError('');
    try {
      const restoredSource = orderSourceHints[order.order_id] ?? order.fulfillment_source;
      const linkedAllocs = await fetchWithAuth<InventoryAllocation[]>(
        `/api/v1/inventory/allocations?company_id=${order.company_id}&product_id=${order.product_id}`
      ).then((list) => list.filter((alloc) => alloc.order_id === order.order_id));

      await fetchWithAuth(`/api/v1/orders/${order.order_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (linkedAllocs.length > 0) {
        await Promise.all(linkedAllocs.map((alloc) =>
          fetchWithAuth(`/api/v1/inventory/allocations/${alloc.alloc_id}`, {
            method: 'PUT',
            body: JSON.stringify({
              status: 'pending',
              source_type: restoredSource === 'incoming' ? 'incoming' : 'stock',
            }),
          })
        ));
      } else {
        await fetchWithAuth('/api/v1/inventory/allocations', {
          method: 'POST',
          body: JSON.stringify({
            company_id: order.company_id,
            product_id: order.product_id,
            quantity: order.remaining_qty ?? order.quantity,
            capacity_kw: order.capacity_kw,
            purpose: purposeFromOrder(order),
            source_type: restoredSource === 'incoming' ? 'incoming' : 'stock',
            customer_name: order.customer_name,
            site_name: order.site_name,
            site_id: order.site_id,
            expected_price_per_wp: order.unit_price_wp,
            free_spare_qty: order.spare_qty ?? 0,
            bl_id: order.bl_id,
            status: 'pending',
          }),
        });
      }
      reloadOrders();
    } catch (err) {
      setOrderActionError(err instanceof Error ? err.message : '예약 복귀 처리에 실패했습니다');
    }
    setOrderActionLoading(false);
  };

  const handlePrefillCancel = () => {
    setPendingAllocId(null);
    setPendingLinkedAllocId(null);
    setOrderFormPrefill(null);
    navigate('/inventory', { replace: true });
  };

  const handleCreateOutbound = async (formData: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/outbounds', { method: 'POST', body: JSON.stringify(formData) });
    reloadOutbounds();
    reloadOrders();
  };

  const salesByOutboundId = new Map(
    outboundSales
      .filter((item) => item.outbound_id)
      .map((item) => [item.outbound_id as string, item.sale])
  );
  const outboundsWithSales = outbounds.map((ob) => ({
    ...ob,
    sale: ob.sale ?? salesByOutboundId.get(ob.outbound_id),
  }));

  const handleSubmitOutboundSale = async (formData: Record<string, unknown>) => {
    if (!invoiceOutbound && !invoiceOrder) return;
    const existing = invoiceOutbound
      ? invoiceOutbound.sale ?? salesByOutboundId.get(invoiceOutbound.outbound_id)
      : invoiceOrder?.sale;
    if (existing) {
      await fetchWithAuth(`/api/v1/sales/${existing.sale_id}`, { method: 'PUT', body: JSON.stringify(formData) });
    } else {
      await fetchWithAuth('/api/v1/sales', { method: 'POST', body: JSON.stringify(formData) });
    }
    setInvoiceOutbound(null);
    setInvoiceOrder(null);
    reloadOutbounds();
    reloadSales();
    reloadOutboundSales();
  };

  const handleOpenSaleInvoice = (item: SaleListItem) => {
    const sale = item.sale;
    if (item.outbound_id) {
      setInvoiceOrder(null);
      setInvoiceOutbound({
        outbound_id: item.outbound_id,
        outbound_date: item.outbound_date ?? item.order_date ?? new Date().toISOString().slice(0, 10),
        company_id: item.company_id ?? selectedCompanyId,
        product_id: item.product_id ?? '',
        product_name: item.product_name,
        product_code: item.product_code,
        spec_wp: item.spec_wp,
        wattage_kw: item.spec_wp ? item.spec_wp / 1000 : undefined,
        quantity: item.quantity,
        capacity_kw: item.capacity_kw ?? (item.spec_wp ? item.quantity * item.spec_wp / 1000 : 0),
        warehouse_id: '',
        usage_category: 'sale',
        customer_id: sale.customer_id ?? item.customer_id,
        customer_name: sale.customer_name ?? item.customer_name,
        unit_price_wp: sale.unit_price_wp ?? item.unit_price_wp,
        status: 'active',
        sale,
      });
      return;
    }

    if (item.order_id) {
      setInvoiceOutbound(null);
      setInvoiceOrder({
        order_id: item.order_id,
        order_number: item.order_number,
        company_id: item.company_id ?? selectedCompanyId,
        customer_id: sale.customer_id ?? item.customer_id,
        customer_name: sale.customer_name ?? item.customer_name,
        order_date: item.order_date ?? item.outbound_date ?? new Date().toISOString().slice(0, 10),
        receipt_method: 'other',
        management_category: 'sale',
        fulfillment_source: 'stock',
        product_id: item.product_id ?? '',
        product_name: item.product_name,
        product_code: item.product_code,
        spec_wp: item.spec_wp,
        wattage_kw: item.spec_wp ? item.spec_wp / 1000 : undefined,
        quantity: item.quantity,
        capacity_kw: item.capacity_kw,
        unit_price_wp: sale.unit_price_wp ?? item.unit_price_wp,
        status: 'received',
        sale,
      });
    }
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
      <h1 className="text-lg font-semibold">판매/수금</h1>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="orders"><ScrollText className="h-3.5 w-3.5" />수주</TabsTrigger>
          <TabsTrigger value="outbound"><Truck className="h-3.5 w-3.5" />출고</TabsTrigger>
          <TabsTrigger value="sales"><ReceiptIcon className="h-3.5 w-3.5" />판매/계산서</TabsTrigger>
          <TabsTrigger value="receipts"><Wallet className="h-3.5 w-3.5" />수금</TabsTrigger>
          <TabsTrigger value="matching"><GitMerge className="h-3.5 w-3.5" />수금매칭</TabsTrigger>
        </TabsList>

        {/* 탭 1: 수주 관리 */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
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
            <div className="flex flex-wrap items-start justify-end gap-2">
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
              onEdit={(o) => {
                setOrderActionError('');
                setEditingOrder({ ...o, fulfillment_source: orderSourceHints[o.order_id] ?? o.fulfillment_source });
              }}
              onDelete={(o) => { setOrderActionError(''); setDeletingOrder(o); }}
              onCreateOutbound={(o) => {
                setOrderActionError('');
                setOutboundOrder({ ...o, fulfillment_source: orderSourceHints[o.order_id] ?? o.fulfillment_source });
                setObFormOpen(true);
              }}
              onCancelToReservation={handleCancelOrderToReservation}
              sourceOverrides={orderSourceHints}
            />
          )}
          {orderActionError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {orderActionError}
            </div>
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
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
                <div className="flex flex-wrap items-start justify-end gap-2">
                  <ExcelToolbar type="outbound" />
                  <Button size="sm" onClick={() => { setOutboundOrder(null); setObFormOpen(true); }}><Plus className="mr-1.5 h-4 w-4" />새로 등록</Button>
                </div>
              </div>
              {obLoading ? <LoadingSpinner /> : (
                <OutboundListTable
                  items={outboundsWithSales}
                  onSelect={(ob) => setSelectedOutbound(ob.outbound_id)}
                  onNew={() => setObFormOpen(true)}
                  onInvoice={(ob) => setInvoiceOutbound({ ...ob, sale: ob.sale ?? salesByOutboundId.get(ob.outbound_id) })}
                />
              )}
            </>
          )}
        </TabsContent>

        {/* 탭 3: 판매 관리 */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <div className="w-36">
                <PartnerCombobox
                  partners={partners}
                  value={saleCustomerFilter}
                  onChange={setSaleCustomerFilter}
                  placeholder="전체 거래처"
                  includeAllOption
                  allLabel="전체 거래처"
                />
              </div>
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
              <SaleListTable items={sales} onInvoice={handleOpenSaleInvoice} />
            </>
          )}
        </TabsContent>

        {/* 탭 4: 수금 관리 */}
        <TabsContent value="receipts" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
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
            <div className="flex flex-wrap items-start justify-end gap-2">
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
          if (!o) { setPendingAllocId(null); setPendingLinkedAllocId(null); setOrderFormPrefill(null); }
        }}
        onSubmit={handleCreateOrder}
        onPrefillCancel={handlePrefillCancel}
        prefillData={orderFormPrefill}
      />
      <OrderForm
        open={!!editingOrder}
        onOpenChange={(o) => { if (!o) setEditingOrder(null); }}
        onSubmit={handleUpdateOrder}
        editData={editingOrder}
      />
      <OutboundForm
        open={obFormOpen}
        onOpenChange={(open) => {
          setObFormOpen(open);
          if (!open) setOutboundOrder(null);
        }}
        onSubmit={handleCreateOutbound}
        order={outboundOrder}
      />
      <SaleForm
        open={!!invoiceOutbound || !!invoiceOrder}
        onOpenChange={(open) => { if (!open) { setInvoiceOutbound(null); setInvoiceOrder(null); } }}
        onSubmit={handleSubmitOutboundSale}
        outbound={invoiceOutbound ?? undefined}
        order={invoiceOrder ?? undefined}
        editData={invoiceOutbound?.sale ?? invoiceOrder?.sale ?? null}
      />
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
      <ConfirmDialog
        open={!!deletingOrder}
        onOpenChange={(o) => { if (!o) setDeletingOrder(null); }}
        title="수주 삭제"
        description={deletingOrder ? `${deletingOrder.order_number ?? deletingOrder.order_id.slice(0, 8)} 수주를 삭제합니다. 연결된 출고가 있으면 삭제가 제한될 수 있습니다.` : ''}
        onConfirm={handleDeleteOrder}
        loading={orderActionLoading}
        variant="destructive"
      />
    </div>
  );
}
