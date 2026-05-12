/**
 * useTurnover — 재고 회전율 조회 훅
 * 단일/다중 법인 모두 엔진이 단일 SQL 로 처리 (company_ids 배열 지원).
 */
import { fetchCalc } from '@/lib/companyUtils';
import { useDetailQuery } from '@/lib/queryHelpers';
import type { TurnoverResponse } from '@/types/turnover';

export function useTurnover(companyId: string | null, days: number = 90) {
  const q = useDetailQuery<TurnoverResponse>(
    ['turnover', companyId, days],
    () => fetchCalc<TurnoverResponse>(
      companyId!,
      '/api/v1/calc/inventory-turnover',
      { days },
    ),
    { enabled: !!companyId },
  );
  return { data: q.data, loading: q.loading, error: q.error, reload: q.reload };
}
