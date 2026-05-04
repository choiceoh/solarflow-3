import { fetchWithAuth, fetchWithAuthMeta } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { Outbound, SaleListItem } from '@/types/outbound';

// 백엔드와 동일한 단일 페이지 상한. Supabase Cloud db-max-rows=1000 이 강제하므로
// 한 번에 더 받을 수 없고, 1000 초과는 offset 을 늘리며 청크 누적한다.
const OUTBOUND_PAGE_SIZE = 1000;
// 데이터 폭주 시 무한 루프 가드 — 50만건까지 안전.
const OUTBOUND_MAX_PAGES = 500;

async function fetchAllOutbounds(baseQuery: string): Promise<Outbound[]> {
  const first = await fetchWithAuthMeta<Outbound[]>(
    `/api/v1/outbounds?${baseQuery}&limit=${OUTBOUND_PAGE_SIZE}&offset=0`,
  );
  const accumulated: Outbound[] = [...first.data];
  const total = first.totalCount;

  // totalCount 가 null(dev mock) 이거나 첫 페이지로 충분하면 종료.
  if (total === null || accumulated.length >= total) return accumulated;

  for (let page = 1; page < OUTBOUND_MAX_PAGES; page++) {
    const offset = page * OUTBOUND_PAGE_SIZE;
    if (offset >= total) break;
    const next = await fetchWithAuth<Outbound[]>(
      `/api/v1/outbounds?${baseQuery}&limit=${OUTBOUND_PAGE_SIZE}&offset=${offset}`,
    );
    if (next.length === 0) break;
    accumulated.push(...next);
    if (accumulated.length >= total) break;
  }
  return accumulated;
}

export function useOutboundList(filters: { status?: string; usage_category?: string; manufacturer_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<Outbound>(
    ['outbounds', selectedCompanyId, filters.status, filters.usage_category, filters.manufacturer_id],
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
