import { useCallback, useState } from 'react';

/**
 * 컬럼 폭(픽셀) 영속 저장. localStorage 키: `sf.colwidth.{scopeId}`.
 * TanStack Table 의 columnSizing state 와 호환되는 shape: { [columnId]: number }.
 */

export type ColumnSizingState = Record<string, number>;

const COLWIDTH_PREFIX = 'sf.colwidth.';

/**
 * scopeId 의 사용자 저장 폭을 읽는다.
 *
 * fallback 은 운영자 default — 사용자 키가 비어 있을 때만 적용된다. 사용자가 일부
 * 컬럼만 손댔다면 그 키들이 우선이고 나머지는 운영자 default 가 메운다.
 */
export function loadColumnSizing(scopeId: string, fallback?: ColumnSizingState): ColumnSizingState {
  const merged: ColumnSizingState = {};
  if (fallback) {
    for (const [k, v] of Object.entries(fallback)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) merged[k] = v;
    }
  }
  if (typeof localStorage === 'undefined') return merged;
  try {
    const raw = localStorage.getItem(COLWIDTH_PREFIX + scopeId);
    if (!raw) return merged;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return merged;
    // 숫자만 통과 — 운영자 default 위에 사용자 값을 덮어쓴다(개인 > 운영자).
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) merged[k] = v;
    }
    return merged;
  } catch {
    return merged;
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

export function useColumnWidths(scopeId: string, fallback?: ColumnSizingState) {
  const [sizing, setSizingState] = useState<ColumnSizingState>(() => loadColumnSizing(scopeId, fallback));

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
