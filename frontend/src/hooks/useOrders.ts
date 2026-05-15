import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchWithAuth, fetchWithAuthMeta } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams, fetchCalc } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { Order, OrderFulfillmentRiskItem, OrderFulfillmentRiskResponse } from '@/types/orders';
import type { Outbound } from '@/types/outbound';

export interface OrderListParams {
  status?: string;
  customer_id?: string;
  management_category?: string;
  q?: string;
  work_queue?: 'delivery_soon' | 'no_site';
  start?: string;
  end?: string;
  min_kw?: number;
  max_kw?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  pageIndex: number;
  pageSize: number;
}

export interface OrderListResult {
  items: Order[];
  totalCount: number;
  loading: boolean;
  isFetching: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

// useOrderList — 서버사이드 페이지·검색·정렬.
export function useOrderList(params: OrderListParams): OrderListResult {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryKey = [
    'orders',
    selectedCompanyId,
    params.status ?? '',
    params.customer_id ?? '',
    params.management_category ?? '',
    params.q ?? '',
    params.work_queue ?? '',
    params.start ?? '',
    params.end ?? '',
    params.min_kw ?? '',
    params.max_kw ?? '',
    params.sort ?? '',
    params.order ?? '',
    params.pageIndex,
    params.pageSize,
  ];
  const q = useQuery<{ items: Order[]; totalCount: number }, Error>({
    queryKey,
    queryFn: async () => {
      const search = companyParams(selectedCompanyId!);
      if (params.status) search.set('status', params.status);
      if (params.customer_id) search.set('customer_id', params.customer_id);
      if (params.management_category) search.set('management_category', params.management_category);
      if (params.q) search.set('q', params.q);
      if (params.work_queue) search.set('work_queue', params.work_queue);
      if (params.start) search.set('start', params.start);
      if (params.end) search.set('end', params.end);
      if (params.min_kw !== undefined) search.set('min_kw', String(params.min_kw));
      if (params.max_kw !== undefined) search.set('max_kw', String(params.max_kw));
      if (params.sort) search.set('sort', params.sort);
      if (params.order) search.set('order', params.order);
      search.set('limit', String(params.pageSize));
      search.set('offset', String(params.pageIndex * params.pageSize));
      const res = await fetchWithAuthMeta<Order[]>(`/api/v1/orders?${search}`);
      return { items: res.data, totalCount: res.totalCount ?? res.data.length };
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  });
  return {
    items: q.data?.items ?? [],
    totalCount: q.data?.totalCount ?? 0,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch(); },
  };
}

// useOrderListAll — 호환 훅 (옛 시그니처). useAlerts 등 server mode 미적용 호출자가 사용.
const ORDER_CHUNK_SIZE = 1000;
const ORDER_MAX_PAGES = 500;

async function fetchAllOrders(baseQuery: string): Promise<Order[]> {
  const first = await fetchWithAuthMeta<Order[]>(
    `/api/v1/orders?${baseQuery}&limit=${ORDER_CHUNK_SIZE}&offset=0`,
  );
  const accumulated: Order[] = [...first.data];
  const total = first.totalCount;
  if (total === null || accumulated.length >= total) return accumulated;
  for (let page = 1; page < ORDER_MAX_PAGES; page++) {
    const offset = page * ORDER_CHUNK_SIZE;
    if (offset >= total) break;
    const next = await fetchWithAuth<Order[]>(
      `/api/v1/orders?${baseQuery}&limit=${ORDER_CHUNK_SIZE}&offset=${offset}`,
    );
    if (next.length === 0) break;
    accumulated.push(...next);
    if (accumulated.length >= total) break;
  }
  return accumulated;
}

// 수주 대시보드 — KPI + 24개월 trend + breakdown(by status/customer/manufacturer/category) +
// unit_price 15일 MA 180일 sparkline 을 서버에서 한 번에 받는다.
// OrdersPage 수주 탭 + 4 Orders Insight 가 사용. 응답 ~수십 KB (UnitPriceMa15 180 floats 포함).
//
// status_scope: lifetime(기본) | active | partial — breakdowns 만 좁힘.
// totals/trend24/unit_price_ma15_180 은 항상 전체.
export type OrderDashboardScope = 'lifetime' | 'active' | 'partial'

export interface OrderDashboard {
  totals: {
    count: number
    active_count: number
    received_count: number
    partial_count: number
    completed_count: number
    cancelled_count: number
    kw_sum: number
    backlog_kw: number
    customers_count: number
    active_customers_count: number
    avg_unit_price_wp: number
    recent_30_avg_unit_price_wp: number
    recent_30_count: number
    delivery_soon_count: number
    no_site_count: number
  }
  trend24: OrderDashboardTrendPoint[]
  unit_price_ma15_180: number[]
  status_scope: OrderDashboardScope
  by_status: OrderDashboardBreakdownRow[]
  by_customer_top10: OrderDashboardBreakdownRow[]
  by_manufacturer_top10: OrderDashboardBreakdownRow[]
  by_category: OrderDashboardBreakdownRow[]
}

export interface OrderDashboardTrendPoint {
  month: string
  count: number
  active_count: number
  partial_count: number
  distinct_customers: number
  avg_unit_price_wp: number
}

export interface OrderDashboardBreakdownRow {
  key: string
  label: string
  count: number
  kw_sum: number
  avg_unit_price_wp: number  // 0 if priced count < 3
  share: number
}

export interface OrderDashboardFilters {
  status?: string
  customer_id?: string
  management_category?: string
  q?: string
  work_queue?: 'delivery_soon' | 'no_site'
  start?: string
  end?: string
  min_kw?: number
  max_kw?: number
  status_scope?: OrderDashboardScope
}

export function useOrderDashboard(filters: OrderDashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const queryKey = [
    'orders-dashboard',
    selectedCompanyId,
    filters.status ?? '',
    filters.customer_id ?? '',
    filters.management_category ?? '',
    filters.q ?? '',
    filters.work_queue ?? '',
    filters.start ?? '',
    filters.end ?? '',
    filters.min_kw ?? '',
    filters.max_kw ?? '',
    filters.status_scope ?? 'lifetime',
  ]
  const q = useQuery<OrderDashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set('status', filters.status)
      if (filters.customer_id) params.set('customer_id', filters.customer_id)
      if (filters.management_category) params.set('management_category', filters.management_category)
      if (filters.q) params.set('q', filters.q)
      if (filters.work_queue) params.set('work_queue', filters.work_queue)
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      if (filters.min_kw !== undefined) params.set('min_kw', String(filters.min_kw))
      if (filters.max_kw !== undefined) params.set('max_kw', String(filters.max_kw))
      if (filters.status_scope) params.set('status_scope', filters.status_scope)
      return fetchWithAuth<OrderDashboard>(`/api/v1/orders/dashboard?${params}`)
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    dashboard: q.data ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch() },
  }
}

export function useOrderFulfillmentRisk(orderIds: string[]) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const ids = orderIds.filter(Boolean)
  const queryKey = ['order-fulfillment-risk', selectedCompanyId, ids.join(',')]
  const q = useQuery<OrderFulfillmentRiskResponse, Error>({
    queryKey,
    queryFn: async () => fetchCalc<OrderFulfillmentRiskResponse>(
      selectedCompanyId!,
      '/api/v1/calc/order-fulfillment-risk',
      { order_ids: ids },
    ),
    enabled: !!selectedCompanyId && ids.length > 0,
    placeholderData: keepPreviousData,
  })
  const items = q.data?.items ?? []
  const riskByOrder = Object.fromEntries(items.map((item) => [item.order_id, item])) as Record<string, OrderFulfillmentRiskItem>
  return {
    items,
    riskByOrder,
    summary: q.data?.summary ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch() },
  }
}

export function useOrderListAll(
  filters: { status?: string; customer_id?: string; management_category?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<Order>(
    ['orders-all', selectedCompanyId, filters.status, filters.customer_id, filters.management_category],
    () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.status) params.set('status', filters.status);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.management_category) params.set('management_category', filters.management_category);
      return fetchAllOrders(params.toString());
    },
    { enabled: !!selectedCompanyId },
  );
}

export interface OrderSummary {
  total: number;
  received_count: number;
  partial_count: number;
  completed_count: number;
  cancelled_count: number;
}

export function useOrderSummary(params: Omit<OrderListParams, 'pageIndex' | 'pageSize' | 'sort' | 'order'>) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryKey = [
    'orders-summary',
    selectedCompanyId,
    params.status ?? '',
    params.customer_id ?? '',
    params.management_category ?? '',
    params.q ?? '',
  ];
  const q = useQuery<OrderSummary, Error>({
    queryKey,
    queryFn: async () => {
      const search = companyParams(selectedCompanyId!);
      if (params.status) search.set('status', params.status);
      if (params.customer_id) search.set('customer_id', params.customer_id);
      if (params.management_category) search.set('management_category', params.management_category);
      if (params.q) search.set('q', params.q);
      return fetchWithAuth<OrderSummary>(`/api/v1/orders/summary?${search}`);
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  });
  return {
    summary: q.data ?? null,
    loading: q.isLoading,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch(); },
  };
}

export function useOrderDetail(orderId: string | null) {
  return useDetailQuery<Order>(
    ['order', orderId],
    () => fetchWithAuth<Order>(`/api/v1/orders/${orderId}`),
    { enabled: !!orderId },
  );
}

export function useOrderOutbounds(orderId: string | null) {
  return useListQuery<Outbound>(
    ['order-outbounds', orderId],
    () => fetchWithAuth<Outbound[]>(`/api/v1/outbounds?order_id=${orderId}`),
    { enabled: !!orderId },
  );
}
