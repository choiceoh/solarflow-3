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

/**
 * scopeId 의 사용자 저장 순서를 읽는다.
 *
 * fallback 인자는 운영자가 사이트 단위로 설정한 default — 사용자 localStorage 가
 * 비어 있을 때만 적용된다(개인 > 운영자 원칙). 사용자가 빈 배열로 저장한 경우는
 * 발생하지 않으므로(컬럼 리오더는 항상 1개 이상) 빈 배열을 곧 "사용자 미설정"으로 본다.
 */
export function loadOrder(scopeId: string, fallback?: ColumnOrderState): ColumnOrderState {
  if (typeof localStorage === 'undefined') return fallback ?? [];
  try {
    const raw = localStorage.getItem(COLORDER_PREFIX + scopeId);
    if (!raw) return fallback ?? [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return fallback ?? [];
    const filtered = arr.filter((s) => typeof s === 'string');
    if (filtered.length === 0) return fallback ?? [];
    return filtered;
  } catch {
    return fallback ?? [];
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

export function useColumnOrder(scopeId: string, fallback?: ColumnOrderState) {
  // 운영자 default 는 마운트 시 1회만 합쳐진다 — 늦게 도착하면 다음 페이지 진입부터 반영.
  const [order, setOrderState] = useState<ColumnOrderState>(() => loadOrder(scopeId, fallback));

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
