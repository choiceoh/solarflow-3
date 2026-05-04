import { fetchAllPaginated } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery } from '@/lib/queryHelpers';
import type { Receipt } from '@/types/orders';

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
