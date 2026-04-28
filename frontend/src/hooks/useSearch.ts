// 글로벌 검색 훅 (Step 31)
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc } from '@/lib/companyUtils';
import type { SearchResponse } from '@/types/search';

const HISTORY_KEY = 'solarflow_search_history';
const MAX_HISTORY = 10;

export function useSearch() {
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim() || !selectedCompanyId) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 전체 법인 모드: 법인에 무관한 결과(제품·거래처·공사현장)는 product_id/id/site_id 기준 중복 제거
      const DEDUP_TYPES: Record<string, string> = {
        product:           'product_id',
        compare:           'product_id',
        partner:           'id',
        construction_site: 'site_id',
      };
      const merge = (rs: SearchResponse[]): SearchResponse => {
        const all = rs.flatMap((r) => r.results || []);
        const seen = new Map<string, true>();
        const results = all.filter((r) => {
          const keyField = DEDUP_TYPES[r.result_type];
          if (!keyField) return true;                          // 법인별 결과는 그대로
          const key = `${r.result_type}:${r.link?.params?.[keyField] ?? r.title}`;
          if (seen.has(key)) return false;
          seen.set(key, true);
          return true;
        });
        return {
          query: rs[0]?.query ?? query,
          intent: rs[0]?.intent ?? '',
          parsed: rs[0]?.parsed ?? { keywords: [] },
          results,
          warnings: rs.flatMap((r) => r.warnings || []),
          calculated_at: rs[0]?.calculated_at ?? new Date().toISOString(),
        };
      };
      const res = await fetchCalc<SearchResponse>(
        selectedCompanyId, '/api/v1/calc/search', { query }, merge,
      );
      setResult(res);
      addHistory(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색 실패');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  // 500ms 디바운스 검색
  const debouncedSearch = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResult(null); return; }
    timerRef.current = setTimeout(() => search(query), 500);
  }, [search]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, search, debouncedSearch, clear };
}

// 검색 이력 관리
function addHistory(query: string) {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    let history: string[] = stored ? JSON.parse(stored) : [];
    history = history.filter((h) => h !== query);
    history.unshift(query);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { /* localStorage 사용 불가 시 무시 */ }
}

export function getSearchHistory(): string[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

export function clearSearchHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}
