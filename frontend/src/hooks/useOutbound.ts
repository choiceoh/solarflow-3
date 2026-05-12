import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchWithAuth, fetchWithAuthMeta } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { Outbound, SaleListItem } from '@/types/outbound';
import type { OutboundFifoMatchesResponse } from '@/types/fifo';

// 청크 누적 페이지네이션 — server mode 미도입 화면(예: OrdersPage 출고 탭)이
// 옛 동작(전체 출고를 한 번에 받음) 을 유지하기 위한 호환 헬퍼.
// Supabase db-max-rows=1000 제한을 offset 증가 청크로 우회한다.
const OUTBOUND_CHUNK_SIZE = 1000;
const OUTBOUND_MAX_PAGES = 500;

async function fetchAllOutbounds(baseQuery: string): Promise<Outbound[]> {
  const first = await fetchWithAuthMeta<Outbound[]>(
    `/api/v1/outbounds?${baseQuery}&limit=${OUTBOUND_CHUNK_SIZE}&offset=0`,
  );
  const accumulated: Outbound[] = [...first.data];
  const total = first.totalCount;
  if (total === null || accumulated.length >= total) return accumulated;
  for (let page = 1; page < OUTBOUND_MAX_PAGES; page++) {
    const offset = page * OUTBOUND_CHUNK_SIZE;
    if (offset >= total) break;
    const next = await fetchWithAuth<Outbound[]>(
      `/api/v1/outbounds?${baseQuery}&limit=${OUTBOUND_CHUNK_SIZE}&offset=${offset}`,
    );
    if (next.length === 0) break;
    accumulated.push(...next);
    if (accumulated.length >= total) break;
  }
  return accumulated;
}

export interface OutboundListParams {
  status?: string;
  usage_category?: string;
  manufacturer_id?: string;
  work_queue?: 'sale_unregistered';
  q?: string;
  start?: string;
  end?: string;
  min_kw?: number;
  max_kw?: number;
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
    params.work_queue ?? '',
    params.q ?? '',
    params.start ?? '',
    params.end ?? '',
    params.min_kw ?? '',
    params.max_kw ?? '',
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
      if (params.work_queue) search.set('work_queue', params.work_queue);
      if (params.q) search.set('q', params.q);
      if (params.start) search.set('start', params.start);
      if (params.end) search.set('end', params.end);
      if (params.min_kw !== undefined) search.set('min_kw', String(params.min_kw));
      if (params.max_kw !== undefined) search.set('max_kw', String(params.max_kw));
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

// 출고 대시보드 — KPI + 24개월 trend + breakdown 을 서버에서 한 번에 받는다.
// OrdersPage outbound 탭 + 4 개 Insight (OutboundCount/Kw/KwYear/SaleConversion) 가 사용.
// 응답 ~수 KB 라 fetchAllOutbounds (수 MB) 를 대체.
//
// period (기본 lifetime) 으로 by_usage / by_manufacturer_top10 / by_customer_top10
// 의 범위를 prev_month / year 로 좁힌다. trend24 와 totals 는 항상 전체.
export type OutboundDashboardPeriod = 'lifetime' | 'prev_month' | 'year'

export interface OutboundDashboard {
  totals: {
    count: number
    kw_sum: number
    active_count: number
    cancel_pending_count: number
    cancelled_count: number
    sale_amount_sum: number
    invoice_pending_count: number
  }
  trend24: { month: string; count: number; kw_sum: number }[]
  weekly12: { week_start: string; count: number; kw_sum: number }[]
  yoy3y: {
    months_this_year: number
    two_years_ago: number[]
    last_year: number[]
    current_year: number[]
    last_year_same: number
    yoy_pct: number | null
  }
  period: OutboundDashboardPeriod
  by_usage: OutboundDashboardBreakdownRow[]
  by_manufacturer_top10: OutboundDashboardBreakdownRow[]
  by_customer_top10: OutboundDashboardBreakdownRow[]
  sale_conversion: {
    eligible_count: number
    linked_count: number
    monthly: { month: string; eligible_count: number; linked_count: number }[]
    by_usage: OutboundSaleConvBreakdownRow[]
    by_manufacturer_top10: OutboundSaleConvBreakdownRow[]
    by_customer_top10: OutboundSaleConvBreakdownRow[]
  }
}

export interface OutboundDashboardBreakdownRow {
  key: string
  label: string
  count: number
  kw_sum: number
  share: number
}

export interface OutboundSaleConvBreakdownRow {
  key: string
  label: string
  eligible_count: number
  linked_count: number
  rate: number  // 0..100
}

export interface OutboundDashboardFilters {
  status?: string
  usage_category?: string
  manufacturer_id?: string
  work_queue?: 'sale_unregistered'
  q?: string
  start?: string
  end?: string
  min_kw?: number
  max_kw?: number
  period?: OutboundDashboardPeriod
}

export function useOutboundDashboard(filters: OutboundDashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const queryKey = [
    'outbounds-dashboard',
    selectedCompanyId,
    filters.status ?? '',
    filters.usage_category ?? '',
    filters.manufacturer_id ?? '',
    filters.work_queue ?? '',
    filters.q ?? '',
    filters.start ?? '',
    filters.end ?? '',
    filters.min_kw ?? '',
    filters.max_kw ?? '',
    filters.period ?? 'lifetime',
  ]
  const q = useQuery<OutboundDashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set('status', filters.status)
      if (filters.usage_category) params.set('usage_category', filters.usage_category)
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id)
      if (filters.work_queue) params.set('work_queue', filters.work_queue)
      if (filters.q) params.set('q', filters.q)
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      if (filters.min_kw !== undefined) params.set('min_kw', String(filters.min_kw))
      if (filters.max_kw !== undefined) params.set('max_kw', String(filters.max_kw))
      if (filters.period) params.set('period', filters.period)
      return fetchWithAuth<OutboundDashboard>(`/api/v1/outbounds/dashboard?${params}`)
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

// useOutboundListAll — 호환 훅. 옛 시그니처(filters만 받고 전체 데이터를 한 번에 반환).
// 새 화면은 useOutboundList(params) 를 쓰고, 아직 server mode 마이그레이션 안 된 화면이 사용한다.
// 청크 누적이라 데이터 5만건 넘으면 무거워지니 점차 페이지네이션으로 이전 권장.
export function useOutboundListAll(
  filters: { status?: string; usage_category?: string; manufacturer_id?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<Outbound>(
    ['outbounds-all', selectedCompanyId, filters.status, filters.usage_category, filters.manufacturer_id],
    () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.status) params.set('status', filters.status);
      if (filters.usage_category) params.set('usage_category', filters.usage_category);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      return fetchAllOutbounds(params.toString());
    },
    { enabled: !!selectedCompanyId },
  );
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
    params.work_queue ?? '',
    params.q ?? '',
    params.start ?? '',
    params.end ?? '',
  ];
  const q = useQuery<OutboundSummary, Error>({
    queryKey,
    queryFn: async () => {
      const search = companyParams(selectedCompanyId!);
      if (params.status) search.set('status', params.status);
      if (params.usage_category) search.set('usage_category', params.usage_category);
      if (params.manufacturer_id) search.set('manufacturer_id', params.manufacturer_id);
      if (params.work_queue) search.set('work_queue', params.work_queue);
      if (params.q) search.set('q', params.q);
      if (params.start) search.set('start', params.start);
      if (params.end) search.set('end', params.end);
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

// D-064 PR 29: 출고 한 건의 FIFO 매칭 (입고 LOT ↔ 출고 배분 + 원가/이익).
// fifo_matches 가 0 인 출고도 정상 — 응답 매치 빈 배열.
export function useOutboundFifoMatches(outboundId: string | null) {
  return useDetailQuery<OutboundFifoMatchesResponse>(
    ['outbound-fifo-matches', outboundId],
    () => fetchWithAuth<OutboundFifoMatchesResponse>(`/api/v1/outbounds/${outboundId}/fifo-matches`),
    { enabled: !!outboundId },
  );
}

export interface SaleListParams {
  customer_id?: string;
  month?: string;
  start?: string;
  end?: string;
  invoice_status?: string;
  receipt_status?: string;
  erp_closed?: 'true' | 'false';
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  pageIndex: number;
  pageSize: number;
}

export interface SaleListResult {
  items: SaleListItem[];
  totalCount: number;
  loading: boolean;
  isFetching: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

// useSaleList — 서버사이드 페이지·검색·정렬. Outbound 와 같은 패턴.
export function useSaleList(params: SaleListParams): SaleListResult {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryKey = [
    'sales',
    selectedCompanyId,
    params.customer_id ?? '',
    params.month ?? '',
    params.start ?? '',
    params.end ?? '',
    params.invoice_status ?? '',
    params.receipt_status ?? '',
    params.erp_closed ?? '',
    params.q ?? '',
    params.sort ?? '',
    params.order ?? '',
    params.pageIndex,
    params.pageSize,
  ];
  const q = useQuery<{ items: SaleListItem[]; totalCount: number }, Error>({
    queryKey,
    queryFn: async () => {
      const search = companyParams(selectedCompanyId!);
      if (params.customer_id) search.set('customer_id', params.customer_id);
      if (params.month) search.set('month', params.month);
      if (params.start) search.set('start', params.start);
      if (params.end) search.set('end', params.end);
      if (params.invoice_status) search.set('invoice_status', params.invoice_status);
      if (params.receipt_status) search.set('receipt_status', params.receipt_status);
      if (params.erp_closed) search.set('erp_closed', params.erp_closed);
      if (params.q) search.set('q', params.q);
      if (params.sort) search.set('sort', params.sort);
      if (params.order) search.set('order', params.order);
      search.set('limit', String(params.pageSize));
      search.set('offset', String(params.pageIndex * params.pageSize));
      const res = await fetchWithAuthMeta<SaleListItem[]>(`/api/v1/sales?${search}`);
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

// 매출 대시보드 — KPI + 24개월 trend + by_customer/by_manufacturer top10 을 서버에서 한 번에 받는다.
// OrdersPage 매출 탭 + 4 개 sales drilldown insights 가 사용. 응답 ~수 KB 라 fetchAllSales (수 MB) 를 대체.
export interface SaleDashboard {
  totals: {
    count: number
    sale_amount_sum: number
    supply_amount_sum: number
    vat_amount_sum: number
    invoice_issued_count: number
    invoice_pending_count: number
    customers_count: number
    avg_unit_price_wp: number
  }
  trend24: SaleDashboardTrendPoint[]
  pending_trend24: SaleDashboardTrendPoint[]
  by_customer_top10: SaleDashboardBreakdownRow[]
  by_manufacturer_top10: SaleDashboardBreakdownRow[]
}

export interface SaleDashboardTrendPoint {
  month: string
  count: number
  sale_amount_sum: number
  pending_count: number
  distinct_customers: number
  avg_unit_price_wp: number
}

export interface SaleDashboardBreakdownRow {
  key: string
  label: string
  count: number
  sale_amount_sum: number
  invoice_pending_count: number
  avg_unit_price_wp: number  // 0 if priced count < 3
  share: number
}

// 호환 alias (이전 이름 유지) — OrdersPage 가 아직 by_customer 만 사용.
export type SaleDashboardCustomerRow = SaleDashboardBreakdownRow

export interface SaleDashboardFilters {
  customer_id?: string
  month?: string
  start?: string
  end?: string
  invoice_status?: string
  receipt_status?: string
  erp_closed?: 'true' | 'false'
  q?: string
}

export function useSaleDashboard(filters: SaleDashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const queryKey = [
    'sales-dashboard',
    selectedCompanyId,
    filters.customer_id ?? '',
    filters.month ?? '',
    filters.start ?? '',
    filters.end ?? '',
    filters.invoice_status ?? '',
    filters.receipt_status ?? '',
    filters.erp_closed ?? '',
    filters.q ?? '',
  ]
  const q = useQuery<SaleDashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.customer_id) params.set('customer_id', filters.customer_id)
      if (filters.month) params.set('month', filters.month)
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      if (filters.invoice_status) params.set('invoice_status', filters.invoice_status)
      if (filters.receipt_status) params.set('receipt_status', filters.receipt_status)
      if (filters.erp_closed) params.set('erp_closed', filters.erp_closed)
      if (filters.q) params.set('q', filters.q)
      return fetchWithAuth<SaleDashboard>(`/api/v1/sales/dashboard?${params}`)
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

// useSaleListAll — 호환 훅. 옛 시그니처(filters만 받고 전체 매출 청크 누적).
// server mode 마이그레이션 안 된 화면(예: OrdersPage 매출 탭) 이 사용한다.
const SALE_CHUNK_SIZE = 1000;
const SALE_MAX_PAGES = 500;

async function fetchAllSales(baseQuery: string): Promise<SaleListItem[]> {
  const first = await fetchWithAuthMeta<SaleListItem[]>(
    `/api/v1/sales?${baseQuery}&limit=${SALE_CHUNK_SIZE}&offset=0`,
  );
  const accumulated: SaleListItem[] = [...first.data];
  const total = first.totalCount;
  if (total === null || accumulated.length >= total) return accumulated;
  for (let page = 1; page < SALE_MAX_PAGES; page++) {
    const offset = page * SALE_CHUNK_SIZE;
    if (offset >= total) break;
    const next = await fetchWithAuth<SaleListItem[]>(
      `/api/v1/sales?${baseQuery}&limit=${SALE_CHUNK_SIZE}&offset=${offset}`,
    );
    if (next.length === 0) break;
    accumulated.push(...next);
    if (accumulated.length >= total) break;
  }
  return accumulated;
}

export function useSaleListAll(
  filters: { customer_id?: string; month?: string; invoice_status?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<SaleListItem>(
    ['sales-all', selectedCompanyId, filters.customer_id, filters.month, filters.invoice_status],
    () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.month) params.set('month', filters.month);
      if (filters.invoice_status) params.set('invoice_status', filters.invoice_status);
      return fetchAllSales(params.toString());
    },
    { enabled: !!selectedCompanyId },
  );
}

export interface SaleSummary {
  total: number;
  sale_amount_sum: number;
  invoice_pending_count: number;
}

export function useSaleSummary(params: Omit<SaleListParams, 'pageIndex' | 'pageSize' | 'sort' | 'order'>) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryKey = [
    'sales-summary',
    selectedCompanyId,
    params.customer_id ?? '',
    params.month ?? '',
    params.start ?? '',
    params.end ?? '',
    params.invoice_status ?? '',
    params.receipt_status ?? '',
    params.erp_closed ?? '',
    params.q ?? '',
  ];
  const q = useQuery<SaleSummary, Error>({
    queryKey,
    queryFn: async () => {
      const search = companyParams(selectedCompanyId!);
      if (params.customer_id) search.set('customer_id', params.customer_id);
      if (params.month) search.set('month', params.month);
      if (params.start) search.set('start', params.start);
      if (params.end) search.set('end', params.end);
      if (params.invoice_status) search.set('invoice_status', params.invoice_status);
      if (params.receipt_status) search.set('receipt_status', params.receipt_status);
      if (params.erp_closed) search.set('erp_closed', params.erp_closed);
      if (params.q) search.set('q', params.q);
      return fetchWithAuth<SaleSummary>(`/api/v1/sales/summary?${search}`);
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
