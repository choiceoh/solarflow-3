import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { Order } from '@/types/orders';
import type { Outbound } from '@/types/outbound';

export function useOrderList(filters: { status?: string; customer_id?: string; management_category?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<Order>(
    ['orders', selectedCompanyId, filters.status, filters.customer_id, filters.management_category],
    () => {
      const params = companyParams(selectedCompanyId);
      if (filters.status) params.set('status', filters.status);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.management_category) params.set('management_category', filters.management_category);
      return fetchWithAuth<Order[]>(`/api/v1/orders?${params}`);
    },
    { enabled: !!selectedCompanyId },
  );
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
