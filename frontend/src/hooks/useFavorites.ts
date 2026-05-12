import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_FAVORITES, type ActionId } from '@/config/quickActions';

const STORAGE_KEY = (userId: string) => `solarflow:nav-favorites:${userId}`;

export function useFavorites(userId: string | undefined) {
  const [favorites, setFavorites] = useState<ActionId[]>(DEFAULT_FAVORITES);

  useEffect(() => {
    // 사용자 전환(A→B) 시 A 의 즐겨찾기가 stale 로 잔존하는 누출 방지 —
    // userId 가 바뀌면 DEFAULT 로 먼저 리셋하고, localStorage 가 있을 때만 덮어쓴다.
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavorites(DEFAULT_FAVORITES);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY(userId));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavorites(raw ? JSON.parse(raw) : DEFAULT_FAVORITES);
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFavorites(DEFAULT_FAVORITES);
    }
  }, [userId]);

  const save = useCallback((ids: ActionId[]) => {
    setFavorites(ids);
    if (!userId) return;
    try {
      localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(ids));
    } catch {
      // 저장 실패 시 무시 (private 모드 등)
    }
  }, [userId]);

  const toggle = useCallback((id: ActionId) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      if (userId) {
        try { localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [userId]);

  return { favorites, save, toggle };
}
