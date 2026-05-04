import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchWithAuth, fetchWithAuthMeta } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { Order } from '@/types/orders';
import type { Outbound } from '@/types/outbound';

export interface OrderListParams {
  status?: string;
  customer_id?: string;
  management_category?: string;
  q?: string;
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
