import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc } from '@/lib/companyUtils';
import type { InventoryResponse } from '@/types/inventory';

interface UseInventoryOptions {
  manufacturerId?: string;
  productId?: string;
}

export function useInventory(opts: UseInventoryOptions = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const q = useQuery<InventoryResponse, Error>({
    queryKey: ['inventory', selectedCompanyId, opts.manufacturerId, opts.productId],
    queryFn: () => {
      const extra: Record<string, unknown> = {};
      if (opts.manufacturerId) extra.manufacturer_id = opts.manufacturerId;
      if (opts.productId) extra.product_id = opts.productId;
      return fetchCalc<InventoryResponse>(selectedCompanyId, '/api/v1/calc/inventory', extra);
    },
    enabled: !!selectedCompanyId,
  });

  let error: string | null = null;
  if (q.error) {
    const msg = q.error.message;
    error = msg.includes('503') || msg.includes('unavailable')
      ? '계산 엔진이 일시적으로 사용할 수 없습니다'
      : msg;
  } else if (!selectedCompanyId) {
    error = '법인을 선택해주세요';
  }

  return {
    data: q.data ?? null,
    loading: q.isLoading,
    error,
    reload: async () => { await q.refetch(); },
  };
}
