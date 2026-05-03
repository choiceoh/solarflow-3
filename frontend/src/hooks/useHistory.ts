// 단순 undo/redo 히스토리 훅 — 최대 N 개, 시간 coalesce.
// 빠른 연속 변경(키스트로크 등)은 한 entry 로 묶고, 500ms 이상 간격이면 새 entry.

import { useCallback, useRef, useState } from 'react';

export interface UseHistoryReturn<T> {
  value: T;
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (next: T) => void;
}

export function useHistory<T>(initial: T, opts?: { max?: number; coalesceMs?: number }): UseHistoryReturn<T> {
  const max = opts?.max ?? 100;
  const coalesceMs = opts?.coalesceMs ?? 500;

  const [stack, setStack] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);
  const lastSetAt = useRef(0);

  const set = useCallback((next: T) => {
    const now = Date.now();
    const within = now - lastSetAt.current < coalesceMs;
    lastSetAt.current = now;

    setStack((prev) => {
      // 현재 index 이후의 redo 가지는 버린다 (새 분기)
      const head = prev.slice(0, index + 1);
      // 변경 없으면 무시
      if (head[head.length - 1] === next) return prev;
      // coalesce — 직전 entry 를 교체 (단, head 가 1개면 그냥 push)
      if (within && head.length > 1) {
        return [...head.slice(0, -1), next].slice(-max);
      }
      return [...head, next].slice(-max);
    });
    setIndex((i) => {
      // coalesce 시 index 유지, 아니면 +1 (max 에서 cap)
      if (within && i > 0) return i;
      return Math.min(i + 1, max - 1);
    });
  }, [index, coalesceMs, max]);

  const undo = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    lastSetAt.current = 0; // 다음 set 은 새 entry 로 강제
  }, []);

  const redo = useCallback(() => {
    setIndex((i) => Math.min(stack.length - 1, i + 1));
    lastSetAt.current = 0;
  }, [stack.length]);

  // config 전환 등 외부 사유로 히스토리 자체를 리셋
  const reset = useCallback((next: T) => {
    setStack([next]);
    setIndex(0);
    lastSetAt.current = 0;
  }, []);

  return {
    value: stack[index],
    set,
    undo,
    redo,
    canUndo: index > 0,
    canRedo: index < stack.length - 1,
    reset,
  };
}
