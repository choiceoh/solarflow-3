import { Component, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { useAppStore } from '@/stores/appStore';
import { useOrderList } from '@/hooks/useOrders';
import { useReceiptList } from '@/hooks/useReceipts';
import { useOutboundList, useSaleList } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import SkeletonRows from '@/components/common/SkeletonRows';
import OrderListTable, { ORDER_TABLE_ID, ORDER_COLUMN_META } from '@/components/orders/OrderListTable';
import OrderDetailView from '@/components/orders/OrderDetailView';
import OrderForm, { type OrderPrefillData } from '@/components/orders/OrderForm';
import ReceiptListTable, { RECEIPT_TABLE_ID, RECEIPT_COLUMN_META } from '@/components/orders/ReceiptListTable';
import ReceiptForm from '@/components/orders/ReceiptForm';
import ReceiptMatchingPanel from '@/components/orders/ReceiptMatchingPanel';
import AutoMatchSection from '@/components/orders/AutoMatchSection';
import OutboundListTable, { OUTBOUND_TABLE_ID, OUTBOUND_COLUMN_META } from '@/components/outbound/OutboundListTable';
import { ColumnVisibilityMenu } from '@/components/common/ColumnVisibilityMenu';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import OutboundForm from '@/components/outbound/OutboundForm';
import SaleForm from '@/components/outbound/SaleForm';
import SaleListTable, { SALE_TABLE_ID, SALE_COLUMN_META } from '@/components/outbound/SaleListTable';
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
import { CardB, FilterButton, FilterChips, RailBlock, Sparkline, TileB } from '@/components/command/MockupPrimitives';
import { BreakdownRows } from '@/components/command/BreakdownRows';
import { autoSpark } from '@/templates/autoSpark';

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

const SALES_TAB_OPTIONS = [
  { key: 'orders', label: '수주' },
  { key: 'outbound', label: '출고' },
  { key: 'sales', label: '판매/계산서' },
  { key: 'receipts', label: '수금' },
  { key: 'matching', label: '수금매칭' },
];

type SalesMetric = {
  lbl: string;
  v: string;
  u?: string;
  sub?: string;
  tone: 'solar' | 'ink' | 'info' | 'warn' | 'pos';
  delta?: string;
  spark?: number[];
};

function fmtSalesMw(kw: number) {
  if (!Number.isFinite(kw) || kw <= 0) return '0.00';
  return (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2);
}

function fmtEok(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return (value / 100_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2);
}

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
  const outboundColVis = useColumnVisibility(OUTBOUND_TABLE_ID, OUTBOUND_COLUMN_META);
  const outboundColPin = useColumnPinning(OUTBOUND_TABLE_ID);
  const orderColVis = useColumnVisibility(ORDER_TABLE_ID, ORDER_COLUMN_META);
  const orderColPin = useColumnPinning(ORDER_TABLE_ID);
  const saleColVis = useColumnVisibility(SALE_TABLE_ID, SALE_COLUMN_META);
  const saleColPin = useColumnPinning(SALE_TABLE_ID);
  const receiptColVis = useColumnVisibility(RECEIPT_TABLE_ID, RECEIPT_COLUMN_META);
  const receiptColPin = useColumnPinning(RECEIPT_TABLE_ID);
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

  // ⚠️ 모든 useMemo는 early return(아래 selectedCompanyId/selectedOrder 분기) 이전이어야 함 — Hook 순서 규칙
  const salesByOutboundId = useMemo(
    () => new Map(
      outboundSales
        .filter((item) => item.outbound_id)
        .map((item) => [item.outbound_id as string, item.sale])
    ),
    [outboundSales],
  );
  const outboundsWithSales = useMemo(
    () => outbounds.map((ob) => ({ ...ob, sale: ob.sale ?? salesByOutboundId.get(ob.outbound_id) })),
    [outbounds, salesByOutboundId],
  );

  // 월 목록 (최근 12개월) — 마운트 후 1회만 계산
  const months = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, []);

  const ordersKw = useMemo(
    () => orders.reduce((sum, order) => sum + (order.capacity_kw ?? order.quantity * (order.wattage_kw ?? 0)), 0),
    [orders],
  );
  const activeOrders = useMemo(
    () => orders.filter(order => order.status !== 'completed' && order.status !== 'cancelled'),
    [orders],
  );
  const outboundKw = useMemo(
    () => outboundsWithSales.reduce((sum, outbound) => sum + (outbound.capacity_kw ?? 0), 0),
    [outboundsWithSales],
  );
  const saleTotal = useMemo(
    () => sales.reduce((sum, item) => sum + (item.total_amount ?? item.sale?.total_amount ?? 0), 0),
    [sales],
  );
  const receiptTotal = useMemo(
    () => receipts.reduce((sum, receipt) => sum + (receipt.amount ?? 0), 0),
    [receipts],
  );
  const receiptRemaining = useMemo(
    () => receipts.reduce((sum, receipt) => sum + (receipt.remaining ?? 0), 0),
    [receipts],
  );
  const customersCount = useMemo(
    () => new Set(orders.map(order => order.customer_id).filter(Boolean)).size,
    [orders],
  );
  const outboundActive = useMemo(
    () => outboundsWithSales.filter(outbound => outbound.status === 'active').length,
    [outboundsWithSales],
  );
  const invoicePending = useMemo(
    () => sales.filter(item => !item.tax_invoice_date).length,
    [sales],
  );

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
        if (await confirmDialog({
          description: `예약 잔량 ${remainingQty.toLocaleString('ko-KR')}EA를 계속 예약으로 유지할까요?`,
          confirmLabel: '예약 유지',
        })) {
          residualStatus = 'pending';
        } else if (await confirmDialog({
          description: '예약 잔량을 보류로 남길까요? 취소하면 잔량 예약은 삭제됩니다.',
          confirmLabel: '보류',
        })) {
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
    const ok = await confirmDialog({
      description: '수주를 취소하고 같은 수량을 가용재고 예약으로 되돌릴까요?',
      variant: 'destructive',
      confirmLabel: '수주 취소',
    });
    if (!ok) return;

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

  const pageTitle =
    activeTab === 'outbound' ? '출고 / 판매' :
    activeTab === 'sales' ? '판매 · 세금계산서' :
    activeTab === 'receipts' ? '수금 관리' :
    activeTab === 'matching' ? '수금 매칭' :
    '수주 관리';
  const pageSub =
    activeTab === 'outbound' ? `${outboundsWithSales.length}건 · ${fmtSalesMw(outboundKw)} MW` :
    activeTab === 'sales' ? `${sales.length}건 · ${fmtEok(saleTotal)}억` :
    activeTab === 'receipts' ? `${receipts.length}건 · 미정산 ${fmtEok(receiptRemaining)}억` :
    activeTab === 'matching' ? '입금과 매출채권 자동 추천' :
    `${orders.length}건 · ${fmtSalesMw(ordersKw)} MW`;
  const metrics: SalesMetric[] =
    activeTab === 'outbound' ? [
      { lbl: '출고 전체', v: String(outboundsWithSales.length), u: '건', sub: `${fmtSalesMw(outboundKw)} MW`, tone: 'solar' },
      { lbl: '정상 출고', v: String(outboundActive), u: '건', sub: '취소 제외', tone: 'pos' },
      { lbl: '계산서 연결', v: String(outboundsWithSales.filter(outbound => outbound.sale).length), u: '건', sub: '매출 전환됨', tone: 'info' },
      { lbl: '평균 용량', v: outboundsWithSales.length ? fmtSalesMw(outboundKw / outboundsWithSales.length) : '0.00', u: 'MW', sub: '출고 1건당', tone: 'ink' },
    ] :
    activeTab === 'sales' ? [
      { lbl: '매출 합계', v: fmtEok(saleTotal), u: '억', sub: `${sales.length}건`, tone: 'solar' },
      { lbl: '계산서 미발행', v: String(invoicePending), u: '건', sub: '발행 대기', tone: invoicePending > 0 ? 'warn' : 'pos' },
      { lbl: '거래처', v: String(new Set(sales.map(sale => sale.customer_id).filter(Boolean)).size), u: '곳', sub: '매출처 기준', tone: 'info' },
      { lbl: '평균 단가', v: sales.length ? Math.round(sales.reduce((sum, sale) => sum + (sale.unit_price_wp ?? 0), 0) / sales.length).toLocaleString() : '0', u: '₩/Wp', sub: '필터 기준', tone: 'ink' },
    ] :
    activeTab === 'receipts' ? [
      { lbl: '입금 합계', v: fmtEok(receiptTotal), u: '억', sub: `${receipts.length}건`, tone: 'solar' },
      { lbl: '미정산', v: fmtEok(receiptRemaining), u: '억', sub: '매칭 필요', tone: receiptRemaining > 0 ? 'warn' : 'pos' },
      { lbl: '부분 매칭', v: String(receipts.filter(receipt => (receipt.matched_total ?? 0) > 0 && (receipt.remaining ?? 0) > 0).length), u: '건', sub: '추가 확인', tone: 'info' },
      { lbl: '회수율', v: receiptTotal > 0 ? (((receiptTotal - receiptRemaining) / receiptTotal) * 100).toFixed(1) : '0.0', u: '%', sub: '입금 매칭 기준', tone: 'pos', spark: [70, 74, 76, 78, 82, 84, 87, 89] },
    ] :
    activeTab === 'matching' ? [
      { lbl: '입금', v: String(receipts.length), u: '건', sub: '매칭 후보', tone: 'solar' },
      { lbl: '미정산', v: fmtEok(receiptRemaining), u: '억', sub: '대상 금액', tone: 'warn' },
      { lbl: '매출', v: String(sales.length), u: '건', sub: '후보 원장', tone: 'info' },
      { lbl: '거래처', v: String(partners.length), u: '곳', sub: '고객 마스터', tone: 'ink' },
    ] : [
      { lbl: '진행 수주', v: String(activeOrders.length), u: '건', sub: `${fmtSalesMw(ordersKw)} MW · 전체 ${orders.length}건`, tone: 'solar' },
      { lbl: '거래처', v: String(customersCount), u: '곳', sub: '활성 고객', tone: 'info' },
      { lbl: '분할출고', v: String(orders.filter(order => order.status === 'partial').length), u: '건', sub: '잔량 관리', tone: 'warn' },
      { lbl: '평균 단가', v: orders.length ? Math.round(orders.reduce((sum, order) => sum + (order.unit_price_wp ?? 0), 0) / orders.length).toLocaleString() : '0', u: '₩/Wp', sub: '수주 기준', tone: 'pos', spark: [398, 401, 403, 404, 407, 408, 408, 409] },
    ];

  const ordersCardControls = (
    <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
      {activeTab === 'orders' && (
        <>
          <FilterButton items={[
            {
              label: '상태',
              value: orderStatusFilter,
              onChange: setOrderStatusFilter,
              options: (Object.entries(ORDER_STATUS_LABEL) as [OrderStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '거래처',
              value: orderCustomerFilter,
              onChange: setOrderCustomerFilter,
              options: partners.map((p) => ({ value: p.partner_id, label: p.partner_name })),
            },
            {
              label: '구분',
              value: orderCategoryFilter,
              onChange: setOrderCategoryFilter,
              options: (Object.entries(MANAGEMENT_CATEGORY_LABEL) as [ManagementCategory, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
          ]} />
          <ColumnVisibilityMenu tableId={ORDER_TABLE_ID} columns={ORDER_COLUMN_META} hidden={orderColVis.hidden} setHidden={orderColVis.setHidden} pinning={orderColPin.pinning} pinLeft={orderColPin.pinLeft} pinRight={orderColPin.pinRight} unpin={orderColPin.unpin} />
          <ExcelToolbar type="order" onNew={() => setOrderFormOpen(true)} />
        </>
      )}
      {activeTab === 'outbound' && !selectedOutbound && (
        <>
          <FilterButton items={[
            {
              label: '상태',
              value: obStatusFilter,
              onChange: setObStatusFilter,
              options: (Object.entries(OUTBOUND_STATUS_LABEL) as [OutboundStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '용도',
              value: obUsageFilter,
              onChange: setObUsageFilter,
              options: (Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '제조사',
              value: obMfgFilter,
              onChange: setObMfgFilter,
              options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
            },
          ]} />
          <ColumnVisibilityMenu tableId={OUTBOUND_TABLE_ID} columns={OUTBOUND_COLUMN_META} hidden={outboundColVis.hidden} setHidden={outboundColVis.setHidden} pinning={outboundColPin.pinning} pinLeft={outboundColPin.pinLeft} pinRight={outboundColPin.pinRight} unpin={outboundColPin.unpin} />
          <ExcelToolbar type="outbound" onNew={() => { setOutboundOrder(null); setObFormOpen(true); }} />
        </>
      )}
      {activeTab === 'sales' && (
        <>
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
          <FilterButton items={[
            {
              label: '기간',
              value: saleMonthFilter,
              onChange: setSaleMonthFilter,
              options: months.map((m) => ({ value: m, label: m })),
            },
            {
              label: '계산서',
              value: saleInvoiceFilter,
              onChange: setSaleInvoiceFilter,
              options: [
                { value: 'issued', label: '발행' },
                { value: 'pending', label: '미발행' },
              ],
            },
          ]} />
          <ColumnVisibilityMenu tableId={SALE_TABLE_ID} columns={SALE_COLUMN_META} hidden={saleColVis.hidden} setHidden={saleColVis.setHidden} pinning={saleColPin.pinning} pinLeft={saleColPin.pinLeft} pinRight={saleColPin.pinRight} unpin={saleColPin.unpin} />
          <ExcelToolbar type="sale" />
        </>
      )}
      {activeTab === 'receipts' && (
        <>
          <FilterButton items={[
            {
              label: '거래처',
              value: receiptCustomerFilter,
              onChange: setReceiptCustomerFilter,
              options: partners.map((p) => ({ value: p.partner_id, label: p.partner_name })),
            },
            {
              label: '기간',
              value: receiptMonthFilter,
              onChange: setReceiptMonthFilter,
              options: months.map((m) => ({ value: m, label: m })),
            },
          ]} />
          <ColumnVisibilityMenu tableId={RECEIPT_TABLE_ID} columns={RECEIPT_COLUMN_META} hidden={receiptColVis.hidden} setHidden={receiptColVis.setHidden} pinning={receiptColPin.pinning} pinLeft={receiptColPin.pinLeft} pinRight={receiptColPin.pinRight} unpin={receiptColPin.unpin} />
          <ExcelToolbar type="receipt" onNew={() => setReceiptFormOpen(true)} />
        </>
      )}
      <div style={{ flex: 1 }} />
      <FilterChips options={SALES_TAB_OPTIONS} value={activeTab} onChange={handleTabChange} />
    </div>
  );

  return (
    <div className="sf-page sf-sales-page">
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
          <div className="sf-command-kpis">
            {metrics.map((metric) => (
              <TileB
                key={metric.lbl}
                lbl={metric.lbl}
                v={metric.v}
                u={metric.u}
                sub={metric.sub}
                tone={metric.tone}
                delta={metric.delta}
                spark={metric.spark ?? autoSpark(metric.lbl)}
              />
            ))}
          </div>

          <CardB
            title={pageTitle}
            sub={pageSub}
            right={ordersCardControls}
          >
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={handleTabChange}>

        {/* 탭 1: 수주 관리 */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          {ordersLoading ? <SkeletonRows rows={8} /> : (
            <OrderListTable
              items={orders}
              hidden={orderColVis.hidden}
              pinning={orderColPin.pinning}
              onPinningChange={orderColPin.setPinning}
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
              {obLoading ? <SkeletonRows rows={8} /> : (
                <OutboundListTable
                  items={outboundsWithSales}
                  hidden={outboundColVis.hidden}
                  pinning={outboundColPin.pinning}
                  onPinningChange={outboundColPin.setPinning}
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
          {saleLoading ? <SkeletonRows rows={8} /> : (
            <>
              <SaleSummaryCards items={sales} />
              <SaleListTable items={sales} hidden={saleColVis.hidden} pinning={saleColPin.pinning} onPinningChange={saleColPin.setPinning} onInvoice={handleOpenSaleInvoice} />
            </>
          )}
        </TabsContent>

        {/* 탭 4: 수금 관리 */}
        <TabsContent value="receipts" className="space-y-4 mt-4">
          {receiptsLoading ? <SkeletonRows rows={8} /> : (
            <ReceiptListTable
              items={receipts}
              hidden={receiptColVis.hidden}
              pinning={receiptColPin.pinning}
              onPinningChange={receiptColPin.setPinning}
              onNew={() => setReceiptFormOpen(true)}
              onEdit={(r) => { setEditingReceipt(r); setReceiptFormOpen(true); }}
              onDelete={(r) => { setDeleteError(''); setDeletingReceipt(r); }}
            />
          )}
          {deleteError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{deleteError}</div>}
        </TabsContent>

        {/* 탭 3: 수금 매칭 */}
        <TabsContent value="matching" className="mt-4 space-y-4">
          <AutoMatchSection />
          <ReceiptMatchingPanel />
        </TabsContent>
              </Tabs>
            </div>
          </CardB>
        </section>

        <aside className="sf-procurement-rail card">
          {activeTab === 'orders' && (
            <>
              <RailBlock title="수주 상태" count={`${activeOrders.length} active`}>
                <BreakdownRows
                  items={(['received', 'partial', 'completed', 'cancelled'] as OrderStatus[]).map((status) => ({
                    key: status,
                    label: ORDER_STATUS_LABEL[status],
                    count: orders.filter(order => order.status === status).length,
                  }))}
                />
              </RailBlock>
              <RailBlock title="거래처 TOP" count="kW">
                {Object.entries(orders.reduce<Record<string, number>>((acc, order) => {
                  const key = order.customer_name || order.customer_id || '미지정';
                  acc[key] = (acc[key] ?? 0) + (order.capacity_kw ?? 0);
                  return acc;
                }, {}))
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([customer, kw], index) => (
                    <div key={customer} className={`py-2 ${index ? 'border-t border-[var(--line)]' : ''}`}>
                      <div className="flex justify-between text-[11.5px]">
                        <span className="truncate text-[var(--ink-2)]">{customer}</span>
                        <span className="mono font-semibold text-[var(--ink)]">{Math.round(kw).toLocaleString()}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                        <div className="h-full bg-[var(--solar-2)]" style={{ width: `${ordersKw ? Math.min(100, (kw / ordersKw) * 100) : 0}%` }} />
                      </div>
                    </div>
                  ))}
              </RailBlock>
              <RailBlock title="단가 흐름" last>
                <Sparkline data={[395, 398, 400, 402, 403, 405, 406, 407, 408, 409]} w={220} h={42} color="var(--solar-2)" area />
                <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                  <span>평균 <span className="font-bold text-[var(--ink)]">{orders.length ? Math.round(orders.reduce((sum, order) => sum + (order.unit_price_wp ?? 0), 0) / orders.length).toLocaleString() : '0'}</span> ₩/Wp</span>
                  <span className="font-bold text-[var(--pos)]">+1.2%</span>
                </div>
              </RailBlock>
            </>
          )}

          {activeTab === 'outbound' && (
            <>
              <RailBlock title="출고 상태" count={`${outboundsWithSales.length} rows`}>
                <BreakdownRows
                  items={(['active', 'cancel_pending', 'cancelled'] as OutboundStatus[]).map((status) => ({
                    key: status,
                    label: OUTBOUND_STATUS_LABEL[status],
                    count: outboundsWithSales.filter(outbound => outbound.status === status).length,
                  }))}
                />
              </RailBlock>
              <RailBlock title="출고 용도" count="건">
                <BreakdownRows
                  items={Object.entries(outboundsWithSales.reduce<Record<string, number>>((acc, outbound) => {
                    const key = USAGE_CATEGORY_LABEL[outbound.usage_category] ?? outbound.usage_category;
                    acc[key] = (acc[key] ?? 0) + 1;
                    return acc;
                  }, {})).slice(0, 5).map(([label, count]) => ({
                    key: label,
                    label,
                    count,
                  }))}
                />
              </RailBlock>
              <RailBlock title="주간 출고" last>
                <div className="sf-mini-bars">
                  {[3.2, 4.8, 6.1, 4.2].map((value, index) => <span key={index} style={{ height: `${(value / 6.5) * 100}%` }} />)}
                </div>
                <div className="mono mt-2 text-center text-[10.5px] text-[var(--ink-3)]">합계 18.3 MW · 다음 4주</div>
              </RailBlock>
            </>
          )}

          {(activeTab === 'sales' || activeTab === 'receipts' || activeTab === 'matching') && (
            <>
              <RailBlock title="채권 요약" count={`${receipts.length} receipts`}>
                <div className="bignum text-[26px] text-[var(--solar-3)]">{fmtEok(receiptRemaining)} <span className="mono text-xs text-[var(--ink-3)]">억</span></div>
                <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">미정산 · 입금 합계 {fmtEok(receiptTotal)}억</div>
              </RailBlock>
              <RailBlock title="계산서 상태">
                <div className="space-y-2 text-[11.5px] text-[var(--ink-2)]">
                  <div className="flex justify-between"><span>발행 완료</span><span className="mono">{sales.length - invoicePending}</span></div>
                  <div className="flex justify-between"><span>미발행</span><span className="mono text-[var(--warn)]">{invoicePending}</span></div>
                  <div className="flex justify-between"><span>매출 합계</span><span className="mono">{fmtEok(saleTotal)}억</span></div>
                </div>
              </RailBlock>
              <RailBlock title="회수율" last>
                <Sparkline data={[78, 80, 81, 82, 84, 86, 88, receiptTotal > 0 ? ((receiptTotal - receiptRemaining) / receiptTotal) * 100 : 0]} w={220} h={42} color="var(--solar-2)" area />
                <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                  <span>현재 <span className="font-bold text-[var(--ink)]">{receiptTotal > 0 ? (((receiptTotal - receiptRemaining) / receiptTotal) * 100).toFixed(1) : '0.0'}</span>%</span>
                  <span className="font-bold text-[var(--pos)]">matching</span>
                </div>
              </RailBlock>
            </>
          )}
        </aside>
      </div>

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
        description={deletingOrder ? `${deletingOrder.order_number ?? deletingOrder.order_id?.slice(0, 8) ?? '—'} 수주를 삭제합니다. 연결된 출고가 있으면 삭제가 제한될 수 있습니다.` : ''}
        onConfirm={handleDeleteOrder}
        loading={orderActionLoading}
        variant="destructive"
      />
    </div>
  );
}
