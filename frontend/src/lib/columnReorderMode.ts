import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * 컬럼 순서 변경 모드(드래그-리오더) 토글 — tableId 별로 공유.
 * 영속 안 함: 폭 조정과 충돌해 평상시엔 OFF 가 기본. 새로고침/페이지 이동 시 OFF 로 복귀.
 */

const state = new Map<string, boolean>();
const listeners = new Map<string, Set<() => void>>();

function subscribe(scopeId: string, cb: () => void): () => void {
  if (!scopeId) return () => {};
  const set = listeners.get(scopeId) ?? new Set<() => void>();
  set.add(cb);
  listeners.set(scopeId, set);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(scopeId);
  };
}

export function useColumnReorderMode(scopeId: string) {
  const sub = useMemo(() => (cb: () => void) => subscribe(scopeId, cb), [scopeId]);
  const enabled = useSyncExternalStore(
    sub,
    () => (scopeId ? (state.get(scopeId) ?? false) : false),
    () => false,
  );
  const setEnabled = useCallback((next: boolean) => {
    if (!scopeId) return;
    if ((state.get(scopeId) ?? false) === next) return;
    state.set(scopeId, next);
    listeners.get(scopeId)?.forEach((fn) => fn());
  }, [scopeId]);

  return { enabled, setEnabled };
}
