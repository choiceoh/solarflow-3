import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_FAVORITES, type ActionId } from '@/config/quickActions';

const STORAGE_KEY = (userId: string) => `solarflow:nav-favorites:${userId}`;

export function useFavorites(userId: string | undefined) {
  const [favorites, setFavorites] = useState<ActionId[]>(DEFAULT_FAVORITES);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY(userId));
      if (raw) setFavorites(JSON.parse(raw));
    } catch {
      // localStorage 읽기 실패 시 기본값 유지
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
