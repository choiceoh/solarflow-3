import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc } from '@/lib/companyUtils';
import type { InventoryResponse } from '@/types/inventory';

interface UseInventoryOptions {
  manufacturerId?: string;
  productId?: string;
}

function mergeInventory(rs: InventoryResponse[]): InventoryResponse {
  return {
    items: rs.flatMap((r) => r.items),
    summary: {
      total_physical_kw: rs.reduce((s, r) => s + r.summary.total_physical_kw, 0),
      total_available_kw: rs.reduce((s, r) => s + r.summary.total_available_kw, 0),
      total_incoming_kw: rs.reduce((s, r) => s + r.summary.total_incoming_kw, 0),
      total_secured_kw: rs.reduce((s, r) => s + r.summary.total_secured_kw, 0),
    },
    calculated_at: rs[0]?.calculated_at ?? new Date().toISOString(),
  };
}

export function useInventory(opts: UseInventoryOptions = {}) {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) {
      setData(null);
      setError('법인을 선택해주세요');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const extra: Record<string, unknown> = {};
      if (opts.manufacturerId) extra.manufacturer_id = opts.manufacturerId;
      if (opts.productId) extra.product_id = opts.productId;

      const result = await fetchCalc<InventoryResponse>(
        selectedCompanyId, '/api/v1/calc/inventory', extra, mergeInventory,
      );
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '재고 조회 실패';
      setError(msg.includes('503') || msg.includes('unavailable')
        ? '계산 엔진이 일시적으로 사용할 수 없습니다'
        : msg);
    }
    setLoading(false);
  }, [selectedCompanyId, opts.manufacturerId, opts.productId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
