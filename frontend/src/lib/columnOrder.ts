import { useCallback, useState } from 'react';

/**
 * 컬럼 순서 영속 저장. localStorage 키: `sf.colorder.{scopeId}`.
 * TanStack Table 의 ColumnOrderState 와 호환: string[] (column id 배열).
 *
 * 저장된 순서에 누락된 컬럼이 있으면 (config 가 새 컬럼을 추가했을 때 등) 그 컬럼은
 * 끝에 자동 추가되어 노출됨 — useColumnOrder.resolvedOrder() 헬퍼가 처리.
 */

export type ColumnOrderState = string[];

const COLORDER_PREFIX = 'sf.colorder.';

export function loadOrder(scopeId: string): ColumnOrderState {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(COLORDER_PREFIX + scopeId);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s) => typeof s === 'string');
  } catch {
    return [];
  }
}

export function saveOrder(scopeId: string, order: ColumnOrderState): void {
  if (typeof localStorage === 'undefined') return;
  if (order.length === 0) {
    localStorage.removeItem(COLORDER_PREFIX + scopeId);
    return;
  }
  localStorage.setItem(COLORDER_PREFIX + scopeId, JSON.stringify(order));
}

/**
 * 저장된 user order + 현재 columns 의 default order 를 병합:
 * - user order 에 있고 default 에도 있는 키는 user 순서 유지
 * - default 에만 있는 키 (새로 추가된 컬럼) 는 끝에 추가
 * - user order 에만 있는 키 (제거된 컬럼) 는 무시
 */
export function resolveOrder(userOrder: ColumnOrderState, defaultColumnIds: string[]): ColumnOrderState {
  if (userOrder.length === 0) return defaultColumnIds;
  const set = new Set(defaultColumnIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of userOrder) {
    if (set.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of defaultColumnIds) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export function useColumnOrder(scopeId: string) {
  const [order, setOrderState] = useState<ColumnOrderState>(() => loadOrder(scopeId));

  const setOrder = useCallback((updater: ColumnOrderState | ((prev: ColumnOrderState) => ColumnOrderState)) => {
    setOrderState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveOrder(scopeId, next);
      return next;
    });
  }, [scopeId]);

  /** id 를 targetId 앞으로 (또는 targetId === null 이면 맨 끝으로) 이동 */
  const moveBefore = useCallback((id: string, targetId: string | null) => {
    setOrder((prev) => {
      const without = prev.filter((x) => x !== id);
      if (targetId === null) return [...without, id];
      const idx = without.indexOf(targetId);
      if (idx === -1) return [...without, id];
      return [...without.slice(0, idx), id, ...without.slice(idx)];
    });
  }, [setOrder]);

  return { order, setOrder, moveBefore };
}
