import { Component, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
import ReceiptListTable, { RECEIPT_TABLE_ID, RECEIPT_COLUMN_META } from '@/components/orders/ReceiptListTable';
import ReceiptMatchingPanel from '@/components/orders/ReceiptMatchingPanel';
import AutoMatchSection from '@/components/orders/AutoMatchSection';
import OutboundListTable, { OUTBOUND_TABLE_ID, OUTBOUND_COLUMN_META } from '@/components/outbound/OutboundListTable';
import { ColumnVisibilityMenu } from '@/components/common/ColumnVisibilityMenu';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import SaleListTable, { SALE_TABLE_ID, SALE_COLUMN_META } from '@/components/outbound/SaleListTable';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import type { InventoryAllocation } from '@/components/inventory/AllocationForm';
import {
  ORDER_STATUS_LABEL, MANAGEMENT_CATEGORY_LABEL,
  type FulfillmentSource, type Order, type OrderStatus, type ManagementCategory,
} from '@/types/orders';
import { OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL, type OutboundStatus, type UsageCategory } from '@/types/outbound';
import type { Partner, Manufacturer } from '@/types/masters';
import type { InventoryResponse } from '@/types/inventory';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { CardB, CommandTopLine, FilterButton, FilterChips, RailBlock, Sparkline, TileB } from '@/components/command/MockupPrimitives';
import { BreakdownRows } from '@/components/command/BreakdownRows';
import { flatSparkFromValue, monthlyTrend, monthlyCount } from '@/templates/sparkUtils';

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

const SALES_TAB_OPTIONS = [
  { key: 'orders', label: '수주' },
  { key: 'outbound', label: '출고' },
  { key: 'sales', label: '판매/계산서' },
  { key: 'receipts', label: '수금' },
  { key: 'matching', label: '수금매칭' },
];
const SALES_TABS = new Set(SALES_TAB_OPTIONS.map((tab) => tab.key));
type OrderWorkQueue = '' | 'delivery_soon' | 'no_site';

function getOrderWorkQueue(value: string | null): OrderWorkQueue {
  return value === 'delivery_soon' || value === 'no_site' ? value : '';
}

function isDeliveryDueSoon(order: Order, today: Date) {
  if (order.status !== 'received' && order.status !== 'partial') return false;
  if (!order.delivery_due || (order.remaining_qty ?? 0) <= 0) return false;
  const due = new Date(order.delivery_due);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
  return diff >= 0 && diff <= 7;
}

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

export default function OrdersPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1: 수주
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [orderCustomerFilter, setOrderCustomerFilter] = useState('');
  const [orderCategoryFilter, setOrderCategoryFilter] = useState('');
  const _loc = useLocation();
  const navigate = useNavigate();
  const [orderWorkQueue, setOrderWorkQueue] = useState<OrderWorkQueue>(() => getOrderWorkQueue(new URLSearchParams(_loc.search).get('alert')));
  const [selectedOrderState, setSelectedOrderState] = useState<{ id: string | null; locationKey: string }>({
    id: null,
    locationKey: _loc.key,
  });
  const selectedOrder = selectedOrderState.locationKey === _loc.key ? selectedOrderState.id : null;
  const setSelectedOrder = (id: string | null) => setSelectedOrderState({ id, locationKey: _loc.key });
  // URL 탭 파라미터 읽기 (사이드바 수주/수금 링크 구분)
  const urlTab = new URLSearchParams(_loc.search).get('tab') ?? 'orders';
  const activeTab = SALES_TABS.has(urlTab) ? urlTab : 'orders';
  const handleTabChange = (tab: string) => {
    setSelectedOrder(null);
    const nextTab = SALES_TABS.has(tab) ? tab : 'orders';
    navigate(nextTab === 'orders' ? '/orders' : `/orders?tab=${nextTab}`, { replace: true });
  };

  const handleOrderWorkQueueChange = (value: string) => {
    const nextQueue = getOrderWorkQueue(value);
    setOrderWorkQueue(nextQueue);
    const params = new URLSearchParams(_loc.search);
    if (nextQueue) params.set('alert', nextQueue);
    else params.delete('alert');
    const next = params.toString();
    navigate(`/orders${next ? `?${next}` : ''}`, { replace: true });
  };

  // 탭 2: 출고
  const [obStatusFilter, setObStatusFilter] = useState('');
  const [obUsageFilter, setObUsageFilter] = useState('');
  const [obMfgFilter, setObMfgFilter] = useState('');
  const [selectedOutbound, setSelectedOutbound] = useState<string | null>(null);
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

  // 탭 4: 수금
  const [receiptCustomerFilter, setReceiptCustomerFilter] = useState('');
  const [receiptMonthFilter, setReceiptMonthFilter] = useState('');
  const [orderActionError, setOrderActionError] = useState('');
  const [orderSourceHints, setOrderSourceHints] = useState<Record<string, FulfillmentSource>>({});

  // 마스터 데이터
  const [partners, setPartners] = useState<Partner[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);

  // 알림 딥링크 intent 처리
  useEffect(() => {
    const params = new URLSearchParams(_loc.search);
    setOrderWorkQueue(getOrderWorkQueue(params.get('alert')));
    const invoiceStatus = params.get('invoice_status');
    if (invoiceStatus === 'issued' || invoiceStatus === 'pending') {
      setSaleInvoiceFilter(invoiceStatus);
    }
  }, [_loc.search]);

  const orderFilters: { status?: string; customer_id?: string; management_category?: string } = {};
  if (orderStatusFilter) orderFilters.status = orderStatusFilter;
  if (orderCustomerFilter) orderFilters.customer_id = orderCustomerFilter;
  if (orderCategoryFilter) orderFilters.management_category = orderCategoryFilter;

  const receiptFilters: { customer_id?: string; month?: string } = {};
  if (receiptCustomerFilter) receiptFilters.customer_id = receiptCustomerFilter;
  if (receiptMonthFilter) receiptFilters.month = receiptMonthFilter;

  const { data: orders, loading: ordersLoading, reload: reloadOrders } = useOrderList(orderFilters);
  const { data: receipts, loading: receiptsLoading } = useReceiptList(receiptFilters);

  const visibleOrders = useMemo(() => {
    if (!orderWorkQueue) return orders;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (orderWorkQueue === 'delivery_soon') {
      return orders.filter((order) => isDeliveryDueSoon(order, today));
    }
    return orders.filter((order) =>
      (order.status === 'received' || order.status === 'partial') && !order.site_id
    );
  }, [orderWorkQueue, orders]);

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
  const outboundsWithSales = outbounds;

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
    () => visibleOrders.reduce((sum, order) => sum + (order.capacity_kw ?? order.quantity * (order.wattage_kw ?? 0)), 0),
    [visibleOrders],
  );
  const activeOrders = useMemo(
    () => visibleOrders.filter(order => order.status !== 'completed' && order.status !== 'cancelled'),
    [visibleOrders],
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
    () => new Set(visibleOrders.map(order => order.customer_id).filter(Boolean)).size,
    [visibleOrders],
  );
  const monthlyOutboundKw = useMemo(() => {
    const today = new Date();
    const currYear = today.getFullYear();
    const currMonth = today.getMonth();
    const currDay = today.getDate();
    const prevMonthDate = new Date(currYear, currMonth - 1, 1);
    const prevMonthYear = prevMonthDate.getFullYear();
    const prevMonthIdx = prevMonthDate.getMonth();
    const lastYear = currYear - 1;
    let year = 0;
    let prev = 0;
    let lastYearSame = 0;
    let lastYearHasAny = false;
    for (const outbound of outboundsWithSales) {
      if (!outbound.outbound_date) continue;
      const d = new Date(outbound.outbound_date);
      if (Number.isNaN(d.getTime())) continue;
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      const kw = outbound.capacity_kw ?? 0;
      if (y === currYear) year += kw;
      if (y === prevMonthYear && m === prevMonthIdx) prev += kw;
      if (y === lastYear) {
        lastYearHasAny = true;
        if (m < currMonth || (m === currMonth && day <= currDay)) lastYearSame += kw;
      }
    }
    const yoyPct = lastYearHasAny && lastYearSame > 0
      ? ((year - lastYearSame) / lastYearSame) * 100
      : null;
    return { year, prev, currYear, prevMonth: prevMonthIdx + 1, yoyPct };
  }, [outboundsWithSales]);
  // 최근 12주(이번 주 포함, 월요일 시작) 출고 capacity. 좌→우 = 과거→현재.
  const weeklyOutbound = useMemo(() => {
    const WEEKS = 12;
    const buckets = Array<number>(WEEKS).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDow = today.getDay();
    const todayOffset = todayDow === 0 ? 6 : todayDow - 1;
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - todayOffset);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekStarts: Date[] = Array.from({ length: WEEKS }, (_, i) => {
      const d = new Date(thisWeekStart);
      d.setDate(thisWeekStart.getDate() - (WEEKS - 1 - i) * 7);
      return d;
    });
    for (const outbound of outboundsWithSales) {
      if (!outbound.outbound_date) continue;
      const d = new Date(outbound.outbound_date);
      if (Number.isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const dow = d.getDay();
      const offset = dow === 0 ? 6 : dow - 1;
      const itemWeekStart = new Date(d);
      itemWeekStart.setDate(d.getDate() - offset);
      const diff = Math.round((thisWeekStart.getTime() - itemWeekStart.getTime()) / weekMs);
      if (diff >= 0 && diff < WEEKS) buckets[WEEKS - 1 - diff] += outbound.capacity_kw ?? 0;
    }
    return { buckets, weekStarts, total: buckets.reduce((s, v) => s + v, 0), max: Math.max(...buckets) };
  }, [outboundsWithSales]);
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
    `${visibleOrders.length}건 · ${fmtSalesMw(ordersKw)} MW${orderWorkQueue ? ` · 전체 ${orders.length}건` : ''}`;
  // KPI sparkline 시계열 — 데이터 범위 기반 (최근 6개월 캡, sparkUtils 참고). 스냅샷은 JSX 폴백에서 평행선.
  const outboundCountSpark = monthlyCount(outboundsWithSales, (o) => o.outbound_date);
  const outboundKwSpark = monthlyTrend(outboundsWithSales, (o) => o.outbound_date, (o) => o.capacity_kw ?? 0);
  const saleTotalSpark = monthlyTrend(sales, (s) => s.tax_invoice_date ?? s.outbound_date ?? null, (s) => s.total_amount ?? s.sale?.total_amount ?? 0);
  const receiptTotalSpark = monthlyTrend(receipts, (r) => r.receipt_date, (r) => r.amount ?? 0);
  const receiptRemainingSpark = monthlyTrend(receipts, (r) => r.receipt_date, (r) => r.remaining ?? 0);
  const activeOrderSpark = monthlyCount(activeOrders, (o) => o.order_date);

  const metrics: SalesMetric[] =
    activeTab === 'outbound' ? [
      { lbl: '출고 전체', v: String(outboundsWithSales.length), u: '건', sub: `${fmtSalesMw(outboundKw)} MW`, tone: 'solar', spark: outboundCountSpark },
      { lbl: '계산서 연결', v: String(outboundsWithSales.filter(outbound => outbound.sale).length), u: '건', sub: '매출 전환됨', tone: 'info', spark: monthlyCount(outboundsWithSales.filter(o => o.sale), (o) => o.outbound_date) },
      { lbl: '전월 출고 용량', v: fmtSalesMw(monthlyOutboundKw.prev), u: 'MW', sub: `${monthlyOutboundKw.prevMonth}월 · 최근 6개월`, tone: 'ink', spark: outboundKwSpark },
      { lbl: '금년 출고 용량', v: fmtSalesMw(monthlyOutboundKw.year), u: 'MW', sub: monthlyOutboundKw.yoyPct != null ? `${monthlyOutboundKw.currYear}년 누계 · 전년比 ${monthlyOutboundKw.yoyPct >= 0 ? '+' : ''}${monthlyOutboundKw.yoyPct.toFixed(1)}%` : `${monthlyOutboundKw.currYear}년 누계`, tone: 'pos' },
    ] :
    activeTab === 'sales' ? [
      { lbl: '매출 합계', v: fmtEok(saleTotal), u: '억', sub: `${sales.length}건`, tone: 'solar', spark: saleTotalSpark },
      { lbl: '계산서 미발행', v: String(invoicePending), u: '건', sub: '발행 대기', tone: invoicePending > 0 ? 'warn' : 'pos', spark: monthlyCount(sales.filter(s => !s.tax_invoice_date), (s) => s.outbound_date ?? null) },
      { lbl: '거래처', v: String(new Set(sales.map(sale => sale.customer_id).filter(Boolean)).size), u: '곳', sub: '매출처 기준', tone: 'info' },
      { lbl: '평균 단가', v: sales.length ? Math.round(sales.reduce((sum, sale) => sum + (sale.unit_price_wp ?? 0), 0) / sales.length).toLocaleString() : '0', u: '₩/Wp', sub: '필터 기준', tone: 'ink' },
    ] :
    activeTab === 'receipts' ? [
      { lbl: '입금 합계', v: fmtEok(receiptTotal), u: '억', sub: `${receipts.length}건`, tone: 'solar', spark: receiptTotalSpark },
      { lbl: '미정산', v: fmtEok(receiptRemaining), u: '억', sub: '매칭 필요', tone: receiptRemaining > 0 ? 'warn' : 'pos', spark: receiptRemainingSpark },
      { lbl: '부분 매칭', v: String(receipts.filter(receipt => (receipt.matched_total ?? 0) > 0 && (receipt.remaining ?? 0) > 0).length), u: '건', sub: '추가 확인', tone: 'info', spark: monthlyCount(receipts.filter(r => (r.matched_total ?? 0) > 0 && (r.remaining ?? 0) > 0), (r) => r.receipt_date) },
      { lbl: '회수율', v: receiptTotal > 0 ? (((receiptTotal - receiptRemaining) / receiptTotal) * 100).toFixed(1) : '0.0', u: '%', sub: '입금 매칭 기준', tone: 'pos', spark: receiptTotalSpark.map((t, i) => (t > 0 ? Math.round(((t - receiptRemainingSpark[i]!) / t) * 100) : 0)) },
    ] :
    activeTab === 'matching' ? [
      { lbl: '입금', v: String(receipts.length), u: '건', sub: '매칭 후보', tone: 'solar', spark: monthlyCount(receipts, (r) => r.receipt_date) },
      { lbl: '미정산', v: fmtEok(receiptRemaining), u: '억', sub: '대상 금액', tone: 'warn', spark: receiptRemainingSpark },
      { lbl: '매출', v: String(sales.length), u: '건', sub: '후보 원장', tone: 'info', spark: monthlyCount(sales, (s) => s.outbound_date ?? null) },
      { lbl: '거래처', v: String(partners.length), u: '곳', sub: '고객 마스터', tone: 'ink' },
    ] : [
      { lbl: '진행 수주', v: String(activeOrders.length), u: '건', sub: `${fmtSalesMw(ordersKw)} MW · 전체 ${orders.length}건`, tone: 'solar', spark: activeOrderSpark },
      { lbl: '거래처', v: String(customersCount), u: '곳', sub: '활성 고객', tone: 'info' },
      { lbl: '분할출고', v: String(visibleOrders.filter(order => order.status === 'partial').length), u: '건', sub: '잔량 관리', tone: 'warn', spark: monthlyCount(visibleOrders.filter(o => o.status === 'partial'), (o) => o.order_date) },
      { lbl: '평균 단가', v: visibleOrders.length ? Math.round(visibleOrders.reduce((sum, order) => sum + (order.unit_price_wp ?? 0), 0) / visibleOrders.length).toLocaleString() : '0', u: '₩/Wp', sub: '수주 기준', tone: 'pos' },
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
            {
              label: '업무',
              value: orderWorkQueue,
              onChange: handleOrderWorkQueueChange,
              options: [
                { value: 'delivery_soon', label: '납기 7일' },
                { value: 'no_site', label: '현장 미등록' },
              ],
            },
          ]} />
          <ColumnVisibilityMenu tableId={ORDER_TABLE_ID} columns={ORDER_COLUMN_META} hidden={orderColVis.hidden} setHidden={orderColVis.setHidden} pinning={orderColPin.pinning} pinLeft={orderColPin.pinLeft} pinRight={orderColPin.pinRight} unpin={orderColPin.unpin} />
          <ExcelToolbar type="order" />
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
          <ExcelToolbar type="outbound" />
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
          <ExcelToolbar type="receipt" />
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
                spark={metric.spark ?? flatSparkFromValue(metric.v)}
              />
            ))}
          </div>

          <CommandTopLine title={pageTitle} sub={pageSub} right={ordersCardControls} />

          <CardB
            title={pageTitle}
            sub={pageSub}
            right={ordersCardControls}
            headerless
          >
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={handleTabChange}>

        {/* 탭 1: 수주 관리 */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          {ordersLoading ? <SkeletonRows rows={8} /> : (
            <OrderListTable
              items={visibleOrders}
              hidden={orderColVis.hidden}
              pinning={orderColPin.pinning}
              onPinningChange={orderColPin.setPinning}
              onSelect={(o) => setSelectedOrder(o.order_id)}
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
              <SaleListTable items={sales} hidden={saleColVis.hidden} pinning={saleColPin.pinning} onPinningChange={saleColPin.setPinning} />
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
            />
          )}
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
                    count: visibleOrders.filter(order => order.status === status).length,
                  }))}
                />
              </RailBlock>
              <RailBlock title="거래처 TOP" count="kW">
                {Object.entries(visibleOrders.reduce<Record<string, number>>((acc, order) => {
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
                  <span>평균 <span className="font-bold text-[var(--ink)]">{visibleOrders.length ? Math.round(visibleOrders.reduce((sum, order) => sum + (order.unit_price_wp ?? 0), 0) / visibleOrders.length).toLocaleString() : '0'}</span> ₩/Wp</span>
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
                  {weeklyOutbound.buckets.map((value, index) => {
                    const start = weeklyOutbound.weekStarts[index];
                    const end = new Date(start);
                    end.setDate(start.getDate() + 6);
                    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
                    return (
                      <span
                        key={index}
                        title={`${fmt(start)} ~ ${fmt(end)} · ${fmtSalesMw(value)} MW`}
                        style={{ height: `${weeklyOutbound.max > 0 ? (value / weeklyOutbound.max) * 100 : 0}%` }}
                      />
                    );
                  })}
                </div>
                <div className="mono mt-2 text-center text-[10.5px] text-[var(--ink-3)]">
                  합계 {fmtSalesMw(weeklyOutbound.total)} MW · 최근 12주
                </div>
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

    </div>
  );
}
