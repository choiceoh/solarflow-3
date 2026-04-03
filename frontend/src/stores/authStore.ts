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

const INIT_TIMEOUT_MS = 5000;

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

    try {
      const profile = await fetchWithAuth<UserProfile>('/api/v1/users/me');
      set({ user: profile });
    } catch (err) {
      console.error('[authStore] 프로필 조회 실패:', err);
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },

  initialize: () => {
    const timeout = setTimeout(() => {
      console.warn('[authStore] 초기화 타임아웃 — 세션 초기화 후 로그인으로 이동');
      supabase.auth.signOut();
      set({ session: null, user: null, isLoading: false });
    }, INIT_TIMEOUT_MS);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      set({ session });

      if (session) {
        try {
          const profile = await fetchWithAuth<UserProfile>('/api/v1/users/me');
          set({ user: profile, isLoading: false });
        } catch {
          console.warn('[authStore] 프로필 조회 실패 — 세션 초기화 후 로그인으로 이동');
          await supabase.auth.signOut();
          set({ session: null, user: null, isLoading: false });
        }
      } else {
        set({ isLoading: false });
      }
    }).catch(() => {
      clearTimeout(timeout);
      console.error('[authStore] 세션 조회 실패');
      supabase.auth.signOut();
      set({ session: null, user: null, isLoading: false });
    });

    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session });

      if (session) {
        try {
          const profile = await fetchWithAuth<UserProfile>('/api/v1/users/me');
          set({ user: profile });
        } catch {
          // 상태 변경 시 프로필 조회 실패는 무시 (initialize에서 처리됨)
        }
      } else {
        set({ user: null });
      }
    });
  },
}));
