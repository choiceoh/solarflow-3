import { useCallback, useState } from 'react';

/**
 * 컬럼 폭(픽셀) 영속 저장. localStorage 키: `sf.colwidth.{scopeId}`.
 * TanStack Table 의 columnSizing state 와 호환되는 shape: { [columnId]: number }.
 */

export type ColumnSizingState = Record<string, number>;

const COLWIDTH_PREFIX = 'sf.colwidth.';

export function loadColumnSizing(scopeId: string): ColumnSizingState {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(COLWIDTH_PREFIX + scopeId);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    // 숫자만 통과
    const out: ColumnSizingState = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveColumnSizing(scopeId: string, sizing: ColumnSizingState): void {
  if (typeof localStorage === 'undefined') return;
  if (Object.keys(sizing).length === 0) {
    localStorage.removeItem(COLWIDTH_PREFIX + scopeId);
    return;
  }
  localStorage.setItem(COLWIDTH_PREFIX + scopeId, JSON.stringify(sizing));
}

export function useColumnWidths(scopeId: string) {
  const [sizing, setSizingState] = useState<ColumnSizingState>(() => loadColumnSizing(scopeId));

  /**
   * TanStack Table 의 onColumnSizingChange 는 (updater: SizingState | ((prev) => SizingState)) 형태.
   * 여기서도 동일 시그니처를 받아 함수형 업데이트도 지원.
   */
  const setSizing = useCallback((updater: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => {
    setSizingState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveColumnSizing(scopeId, next);
      return next;
    });
  }, [scopeId]);

  const reset = useCallback(() => {
    setSizingState({});
    saveColumnSizing(scopeId, {});
  }, [scopeId]);

  return { sizing, setSizing, reset };
}
