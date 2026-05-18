import { useCallback, useEffect, useState } from 'react';

/**
 * 컬럼 고정(pinning) 상태 영속 저장. localStorage 키: `sf.colpin.{scopeId}`.
 * TanStack Table 의 ColumnPinningState 와 호환: { left: string[]; right: string[] }.
 */

export interface ColumnPinningState {
  left: string[];
  right: string[];
}

export const COLPIN_PREFIX = 'sf.colpin.';

const EMPTY: ColumnPinningState = { left: [], right: [] };

function sanitizePinning(value: unknown): ColumnPinningState {
  if (!value || typeof value !== 'object') return { left: [], right: [] };
  const obj = value as { left?: unknown; right?: unknown };
  return {
    left: Array.isArray(obj.left) ? obj.left.filter((s) => typeof s === 'string') : [],
    right: Array.isArray(obj.right) ? obj.right.filter((s) => typeof s === 'string') : [],
  };
}

function isEmpty(p: ColumnPinningState): boolean {
  return p.left.length === 0 && p.right.length === 0;
}

/**
 * fallback 은 운영자 사이트 default — 사용자 localStorage 가 비어 있을 때만 적용.
 */
export function loadPinning(scopeId: string, fallback?: ColumnPinningState): ColumnPinningState {
  const cleanFallback = sanitizePinning(fallback);
  if (typeof localStorage === 'undefined') return cleanFallback;
  try {
    const raw = localStorage.getItem(COLPIN_PREFIX + scopeId);
    if (!raw) return cleanFallback;
    const parsed = sanitizePinning(JSON.parse(raw));
    return isEmpty(parsed) ? cleanFallback : parsed;
  } catch {
    return cleanFallback;
  }
}

export function savePinning(scopeId: string, pinning: ColumnPinningState): void {
  if (typeof localStorage === 'undefined') return;
  if (pinning.left.length === 0 && pinning.right.length === 0) {
    localStorage.removeItem(COLPIN_PREFIX + scopeId);
    return;
  }
  localStorage.setItem(COLPIN_PREFIX + scopeId, JSON.stringify(pinning));
}

export function useColumnPinning(scopeId: string, fallback?: ColumnPinningState) {
  const [pinning, setPinningState] = useState<ColumnPinningState>(() => loadPinning(scopeId, fallback));

  // 늦게 도착한 운영자 default — 사용자 localStorage 가 비어 있고 현 state 도 비었을
  // 때만 1회 적용.
  useEffect(() => {
    if (!fallback || isEmpty(fallback)) return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(COLPIN_PREFIX + scopeId)) return;
    setPinningState((prev) => (isEmpty(prev) ? sanitizePinning(fallback) : prev));
  }, [scopeId, fallback]);

  const setPinning = useCallback((updater: ColumnPinningState | ((prev: ColumnPinningState) => ColumnPinningState)) => {
    setPinningState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      savePinning(scopeId, next);
      return next;
    });
  }, [scopeId]);

  const resetToFallback = useCallback(() => {
    savePinning(scopeId, { left: [], right: [] });
    setPinningState(fallback ? sanitizePinning(fallback) : { left: [], right: [] });
  }, [scopeId, fallback]);

  const pinLeft = useCallback((columnId: string) => {
    setPinning((prev) => ({
      left: [...prev.left.filter((id) => id !== columnId), columnId],
      right: prev.right.filter((id) => id !== columnId),
    }));
  }, [setPinning]);

  const pinRight = useCallback((columnId: string) => {
    setPinning((prev) => ({
      left: prev.left.filter((id) => id !== columnId),
      right: [...prev.right.filter((id) => id !== columnId), columnId],
    }));
  }, [setPinning]);

  const unpin = useCallback((columnId: string) => {
    setPinning((prev) => ({
      left: prev.left.filter((id) => id !== columnId),
      right: prev.right.filter((id) => id !== columnId),
    }));
  }, [setPinning]);

  const getPinSide = useCallback((columnId: string): 'left' | 'right' | undefined => {
    if (pinning.left.includes(columnId)) return 'left';
    if (pinning.right.includes(columnId)) return 'right';
    return undefined;
  }, [pinning]);

  return { pinning, setPinning, pinLeft, pinRight, unpin, getPinSide, resetToFallback, EMPTY };
}
