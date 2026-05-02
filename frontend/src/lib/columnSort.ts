import { useCallback, useState } from 'react';

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

const COLSORT_PREFIX = 'sf.colsort.';

export function loadSorting(scopeId: string): SortingState {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COLSORT_PREFIX + scopeId);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.id === 'string' && typeof s.desc === 'boolean')
      .map((s) => ({ id: String(s.id), desc: !!s.desc }));
  } catch {
    return [];
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

export function useColumnSort(scopeId: string) {
  const [sorting, setSortingState] = useState<SortingState>(() => loadSorting(scopeId));

  const setSorting = useCallback((updater: SortingState | ((prev: SortingState) => SortingState)) => {
    setSortingState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveSorting(scopeId, next);
      return next;
    });
  }, [scopeId]);

  return { sorting, setSorting };
}
