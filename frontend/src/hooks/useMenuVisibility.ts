// 사이트 단위 메뉴 가시성 — system_settings.menu_visibility 키 사용.
// admin이 사이트 설정에서 끄면 모든 사용자의 사이드바에서 즉시 사라진다.
import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

const KEY = 'menu_visibility';

interface VisibilityValue {
  hidden?: string[];
}

export function useMenuVisibility() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth<VisibilityValue | null>(`/api/v1/system-settings/${KEY}`);
      const arr = Array.isArray(res?.hidden) ? res!.hidden : [];
      setHidden(new Set(arr));
    } catch {
      setHidden(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async (next: Set<string>) => {
    await fetchWithAuth(`/api/v1/system-settings/${KEY}`, {
      method: 'PUT',
      body: JSON.stringify({ hidden: Array.from(next) }),
    });
    setHidden(new Set(next));
  }, []);

  return { hidden, loading, refresh, save };
}
