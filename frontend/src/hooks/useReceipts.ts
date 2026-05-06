import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAllPaginated, fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery } from '@/lib/queryHelpers';
import type { Receipt } from '@/types/orders';

// 수금 대시보드 — KPI + 24개월 trend + by_customer/by_match_status 를 서버 한 번에.
// OrdersPage 수금/매칭 탭 + 4 Receipts Insight 가 사용. 응답 ~수 KB.
export interface ReceiptDashboard {
  totals: {
    count: number
    amount_sum: number
    matched_sum: number
    remaining_sum: number
    matched_count: number
    partial_match_count: number
    unmatched_count: number
    customers_count: number
    recovery_rate: number  // 0..100
  }
  trend24: ReceiptDashboardTrendPoint[]
  by_customer_top10: ReceiptDashboardBreakdownRow[]
  by_match_status: ReceiptDashboardBreakdownRow[]
}

export interface ReceiptDashboardTrendPoint {
  month: string
  count: number
  amount_sum: number
  remaining_sum: number
  matched_sum: number
  partial_count: number
  recovery_rate: number
}

export interface ReceiptDashboardBreakdownRow {
  key: string
  label: string
  count: number
  amount_sum: number
  remaining_sum: number
  matched_sum: number
  partial_match_count: number
  recovery_rate: number
  share: number
}

export interface ReceiptDashboardFilters {
  customer_id?: string
  month?: string
  start?: string
  end?: string
}

export function useReceiptDashboard(filters: ReceiptDashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const queryKey = [
    'receipts-dashboard',
    selectedCompanyId,
    filters.customer_id ?? '',
    filters.month ?? '',
    filters.start ?? '',
    filters.end ?? '',
  ];
  const q = useQuery<ReceiptDashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.month) params.set('month', filters.month);
      if (filters.start) params.set('start', filters.start);
      if (filters.end) params.set('end', filters.end);
      return fetchWithAuth<ReceiptDashboard>(`/api/v1/receipts/dashboard?${params}`);
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  });
  return {
    dashboard: q.data ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch(); },
  };
}

export function useReceiptList(
  filters: { customer_id?: string; month?: string; start?: string; end?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<Receipt>(
    ['receipts', selectedCompanyId, filters.customer_id, filters.month, filters.start, filters.end],
    () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.month) params.set('month', filters.month);
      if (filters.start) params.set('start', filters.start);
      if (filters.end) params.set('end', filters.end);
      return fetchAllPaginated<Receipt>('/api/v1/receipts', params.toString());
    },
    { enabled: !!selectedCompanyId },
  );
}
