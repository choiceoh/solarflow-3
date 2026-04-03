import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchWithAuth } from '@/lib/api';
import type { UserProfile } from '@/types/models';

interface AuthState {
  session: Session | null;
  user: UserProfile | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,

  login: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }

    set({ session: data.session });

    // users/me에서 프로필 조회
    try {
      const profile = await fetchWithAuth<UserProfile>('/api/v1/users/me');
      set({ user: profile });
    } catch (err) {
      console.error('[authStore] 프로필 조회 실패:', err);
      // 프로필 조회 실패해도 세션은 유지 (users/me가 아직 없을 수 있음)
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },

  initialize: () => {
    // 현재 세션 확인
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      set({ session });

      if (session) {
        try {
          const profile = await fetchWithAuth<UserProfile>('/api/v1/users/me');
          set({ user: profile, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    });

    // 인증 상태 변경 구독
    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session });

      if (session) {
        try {
          const profile = await fetchWithAuth<UserProfile>('/api/v1/users/me');
          set({ user: profile });
        } catch {
          // 프로필 조회 실패 시 무시
        }
      } else {
        set({ user: null });
      }
    });
  },
}));
