// D-112: 사용자가 사이드바 탭 클릭 → 즉시 user_profiles.persona 영구 저장.
// v1: 매 클릭 = 영구 변경 (잠깐 엿보기 vs 기본 분리는 v2에서 도입할 수 있음).
import { useCallback, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function useUserPersona() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [saving, setSaving] = useState(false);

  const setPersona = useCallback(
    async (next: string | null) => {
      if (!user) return;
      if (user.persona === next) return; // 동일 값이면 no-op
      setSaving(true);
      const previous = user.persona;
      setUser({ ...user, persona: next }); // 낙관적 업데이트
      try {
        await fetchWithAuth('/api/v1/users/me/persona', {
          method: 'PUT',
          body: JSON.stringify({ persona: next }),
        });
      } catch (err) {
        setUser({ ...user, persona: previous }); // 실패 시 롤백
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [user, setUser],
  );

  return { persona: user?.persona ?? null, setPersona, saving };
}
