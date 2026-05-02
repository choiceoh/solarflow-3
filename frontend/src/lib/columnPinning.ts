import { useCallback, useState } from 'react';

/**
 * 컬럼 고정(pinning) 상태 영속 저장. localStorage 키: `sf.colpin.{scopeId}`.
 * TanStack Table 의 ColumnPinningState 와 호환: { left: string[]; right: string[] }.
 */

export interface ColumnPinningState {
  left: string[];
  right: string[];
}

const COLPIN_PREFIX = 'sf.colpin.';

const EMPTY: ColumnPinningState = { left: [], right: [] };

export function loadPinning(scopeId: string): ColumnPinningState {
  if (typeof localStorage === 'undefined') return { left: [], right: [] };
  try {
    const raw = localStorage.getItem(COLPIN_PREFIX + scopeId);
    if (!raw) return { left: [], right: [] };
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return { left: [], right: [] };
    return {
      left: Array.isArray(obj.left) ? obj.left.filter((s: unknown) => typeof s === 'string') : [],
      right: Array.isArray(obj.right) ? obj.right.filter((s: unknown) => typeof s === 'string') : [],
    };
  } catch {
    return { left: [], right: [] };
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

export function useColumnPinning(scopeId: string) {
  const [pinning, setPinningState] = useState<ColumnPinningState>(() => loadPinning(scopeId));

  const setPinning = useCallback((updater: ColumnPinningState | ((prev: ColumnPinningState) => ColumnPinningState)) => {
    setPinningState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      savePinning(scopeId, next);
      return next;
    });
  }, [scopeId]);

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

  return { pinning, setPinning, pinLeft, pinRight, unpin, getPinSide, EMPTY };
}
