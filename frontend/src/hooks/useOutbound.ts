import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchWithAuth, fetchWithAuthMeta } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { Outbound, SaleListItem } from '@/types/outbound';

export interface OutboundListParams {
  status?: string;
  usage_category?: string;
  manufacturer_id?: string;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  pageIndex: number;
  pageSize: number;
}

export interface OutboundListResult {
  items: Outbound[];
  totalCount: number;
  loading: boolean;
  isFetching: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

// useOutboundList — 서버사이드 페이지네이션·검색·정렬.
// 한 페이지(items)와 필터 적용 후 전체 건수(totalCount) 를 함께 반환한다.
// keepPreviousData 로 페이지 전환 시 직전 페이지가 잠시 보이고 새 데이터로 교체.
export function useOutboundList(params: OutboundListParams): OutboundListResult {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryKey = [
    'outbounds',
    selectedCompanyId,
    params.status ?? '',
    params.usage_category ?? '',
    params.manufacturer_id ?? '',
    params.q ?? '',
    params.sort ?? '',
    params.order ?? '',
    params.pageIndex,
    params.pageSize,
  ];
  const q = useQuery<{ items: Outbound[]; totalCount: number }, Error>({
    queryKey,
    queryFn: async () => {
      const search = companyParams(selectedCompanyId!);
      if (params.status) search.set('status', params.status);
      if (params.usage_category) search.set('usage_category', params.usage_category);
      if (params.manufacturer_id) search.set('manufacturer_id', params.manufacturer_id);
      if (params.q) search.set('q', params.q);
      if (params.sort) search.set('sort', params.sort);
      if (params.order) search.set('order', params.order);
      search.set('limit', String(params.pageSize));
      search.set('offset', String(params.pageIndex * params.pageSize));
      const res = await fetchWithAuthMeta<Outbound[]>(`/api/v1/outbounds?${search}`);
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

export interface OutboundSummary {
  total: number;
  active_count: number;
  cancel_pending_count: number;
  cancelled_count: number;
  sale_amount_sum: number;
  invoice_pending_count: number;
}

// useOutboundSummary — KPI 카드용 집계.
// List 와 동일 필터(status/usage_category/manufacturer_id/q) 를 사용해 페이지에 무관한 전체 집계를 받는다.
export function useOutboundSummary(params: Omit<OutboundListParams, 'pageIndex' | 'pageSize' | 'sort' | 'order'>) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryKey = [
    'outbounds-summary',
    selectedCompanyId,
    params.status ?? '',
    params.usage_category ?? '',
    params.manufacturer_id ?? '',
    params.q ?? '',
  ];
  const q = useQuery<OutboundSummary, Error>({
    queryKey,
    queryFn: async () => {
      const search = companyParams(selectedCompanyId!);
      if (params.status) search.set('status', params.status);
      if (params.usage_category) search.set('usage_category', params.usage_category);
      if (params.manufacturer_id) search.set('manufacturer_id', params.manufacturer_id);
      if (params.q) search.set('q', params.q);
      return fetchWithAuth<OutboundSummary>(`/api/v1/outbounds/summary?${search}`);
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

export function useOutboundDetail(outboundId: string | null) {
  return useDetailQuery<Outbound>(
    ['outbound', outboundId],
    () => fetchWithAuth<Outbound>(`/api/v1/outbounds/${outboundId}`),
    { enabled: !!outboundId },
  );
}

export function useSaleList(filters: { customer_id?: string; month?: string; invoice_status?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<SaleListItem>(
    ['sales', selectedCompanyId, filters.customer_id, filters.month, filters.invoice_status],
    () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.month) params.set('month', filters.month);
      if (filters.invoice_status) params.set('invoice_status', filters.invoice_status);
      return fetchWithAuth<SaleListItem[]>(`/api/v1/sales?${params}`);
    },
    { enabled: !!selectedCompanyId },
  );
}
