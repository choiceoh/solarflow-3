import { useState, useCallback } from 'react';
import type { ExchangeCompareResult } from '@/types/customs';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc } from '@/lib/companyUtils';

// 환율 비교 (Rust API 연동)
// D-024: 실시간 환율 API 연동 전까지 Rust가 최근 면장 환율을 현재 환율로 사용한다.
export function useExchangeCompare() {
  const [result, setResult] = useState<ExchangeCompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const compare = useCallback(async () => {
    if (!selectedCompanyId) {
      setResult(null);
      setError('법인을 먼저 선택해주세요');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCalc<ExchangeCompareResult>(
        selectedCompanyId,
        '/api/v1/calc/exchange-compare',
        {},
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '환율 비교 실패');
      setResult(null);
    }
    setLoading(false);
  }, [selectedCompanyId]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, compare, clear };
}
