import { useCallback, useEffect, useState } from 'react';

/**
 * 정렬 상태 영속 저장. localStorage 키: `sf.colsort.{scopeId}`.
 * TanStack Table 의 SortingState 와 호환되는 shape: ColumnSort[].
 * 단일 정렬만 노출(배열 길이 0 또는 1) — multi-sort 가 필요해지면 hook 만 풀면 됨.
 */

export interface ColumnSort {
  id: string;
  desc: boolean;
}
export type SortingState = ColumnSort[];

export const COLSORT_PREFIX = 'sf.colsort.';

/**
 * fallback 은 운영자 사이트 default — 사용자 localStorage 가 비어 있을 때만 적용.
 */
export function loadSorting(scopeId: string, fallback?: SortingState): SortingState {
  const cleanFallback = (fallback ?? []).filter(
    (s) => s && typeof s.id === 'string' && typeof s.desc === 'boolean',
  );
  if (typeof localStorage === 'undefined') return cleanFallback;
  try {
    const raw = localStorage.getItem(COLSORT_PREFIX + scopeId);
    if (!raw) return cleanFallback;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return cleanFallback;
    const filtered = arr
      .filter((s) => s && typeof s.id === 'string' && typeof s.desc === 'boolean')
      .map((s) => ({ id: String(s.id), desc: !!s.desc }));
    return filtered.length > 0 ? filtered : cleanFallback;
  } catch {
    return cleanFallback;
  }
}

export function saveSorting(scopeId: string, sorting: SortingState): void {
  if (typeof localStorage === 'undefined') return;
  if (sorting.length === 0) {
    localStorage.removeItem(COLSORT_PREFIX + scopeId);
    return;
  }
  localStorage.setItem(COLSORT_PREFIX + scopeId, JSON.stringify(sorting));
}

export function useColumnSort(scopeId: string, fallback?: SortingState) {
  const [sorting, setSortingState] = useState<SortingState>(() => loadSorting(scopeId, fallback));

  // 늦게 도착한 운영자 default — 사용자 localStorage 가 비어 있고 현 state 도 비었을
  // 때만 1회 머지. 사용자가 명시적으로 정렬 해제(빈 배열)한 경우와 구분하기 위해
  // localStorage 키 존재 유무로 판단.
  useEffect(() => {
    if (!fallback || fallback.length === 0) return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(COLSORT_PREFIX + scopeId)) return;
    setSortingState((prev) => (prev.length === 0 ? fallback : prev));
  }, [scopeId, fallback]);

  const setSorting = useCallback((updater: SortingState | ((prev: SortingState) => SortingState)) => {
    setSortingState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveSorting(scopeId, next);
      return next;
    });
  }, [scopeId]);

  const resetToFallback = useCallback(() => {
    saveSorting(scopeId, []);
    setSortingState(fallback ?? []);
  }, [scopeId, fallback]);

  return { sorting, setSorting, resetToFallback };
}
