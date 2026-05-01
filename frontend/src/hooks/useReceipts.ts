import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery } from '@/lib/queryHelpers';
import type { Receipt } from '@/types/orders';

export function useReceiptList(filters: { customer_id?: string; month?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<Receipt>(
    ['receipts', selectedCompanyId, filters.customer_id, filters.month],
    () => {
      const params = companyParams(selectedCompanyId);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.month) params.set('month', filters.month);
      return fetchWithAuth<Receipt[]>(`/api/v1/receipts?${params}`);
    },
    { enabled: !!selectedCompanyId },
  );
}
