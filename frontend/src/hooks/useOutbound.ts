import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { Outbound, SaleListItem } from '@/types/outbound';

export function useOutboundList(filters: { status?: string; usage_category?: string; manufacturer_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<Outbound>(
    ['outbounds', selectedCompanyId, filters.status, filters.usage_category, filters.manufacturer_id],
    () => {
      const params = companyParams(selectedCompanyId);
      if (filters.status) params.set('status', filters.status);
      if (filters.usage_category) params.set('usage_category', filters.usage_category);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      return fetchWithAuth<Outbound[]>(`/api/v1/outbounds?${params}`);
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
      const params = companyParams(selectedCompanyId);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.month) params.set('month', filters.month);
      if (filters.invoice_status) params.set('invoice_status', filters.invoice_status);
      return fetchWithAuth<SaleListItem[]>(`/api/v1/sales?${params}`);
    },
    { enabled: !!selectedCompanyId },
  );
}
