import { useState, useCallback } from 'react';
import type { ExchangeCompareResult } from '@/types/customs';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc } from '@/lib/companyUtils';

function mergeExchangeCompare(results: ExchangeCompareResult[]): ExchangeCompareResult {
  return {
    items: results.flatMap((result) => result.items || []),
    latest_rate: results.length === 1 ? results[0].latest_rate : 0,
    latest_rate_source: results.length === 1 ? results[0].latest_rate_source : '법인별 최근 면장 환율',
    calculated_at: new Date().toISOString(),
  };
}

// 환율 비교 (Rust API 연동) — 사용자 클릭 트리거이므로 useQuery 대신 명령형 유지
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
        mergeExchangeCompare,
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
