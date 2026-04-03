import { useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import type { ExchangeCompareResult } from '@/types/customs';

// 환율 비교 (Rust API 연동)
export function useExchangeCompare() {
  const [result, setResult] = useState<ExchangeCompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (amount: number, rate1: number, rate2: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWithAuth<ExchangeCompareResult>('/api/v1/calc/exchange-compare', {
        method: 'POST',
        body: JSON.stringify({ amount_usd: amount, rate1, rate2 }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '환율 비교 실패');
      setResult(null);
    }
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, compare, clear };
}
