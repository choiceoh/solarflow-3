import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc } from '@/lib/companyUtils';
import type { InventoryResponse } from '@/types/inventory';

interface UseInventoryOptions {
  manufacturerId?: string;
  productId?: string;
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

      // 엔진이 다중 법인을 단일 호출로 처리하므로 merge 함수는 불필요
      const result = await fetchCalc<InventoryResponse>(
        selectedCompanyId,
        '/api/v1/calc/inventory',
        extra,
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

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
