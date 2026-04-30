import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import {
  clearStoredAuthSession,
  getAuthSessionPersistence,
  setAuthSessionPersistence,
  supabase,
} from '@/lib/supabase';
import { fetchWithAuth } from '@/lib/api';
import {
  clearDevMockSession,
  createDevMockSession,
  DEV_MOCK_PROFILE,
  isDevMockSessionActive,
  startDevMockSession,
} from '@/lib/devMockMode';
import { useAppStore } from '@/stores/appStore';
import type { UserProfile } from '@/types/models';

interface LoginOptions {
  persistSession?: boolean;
}

interface AuthState {
  session: Session | null;
  user: UserProfile | null;
  isLoading: boolean;
  login: (email: string, password: string, options?: LoginOptions) => Promise<void>;
  loginWithDevMock: () => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => void;
}

const INIT_TIMEOUT_MS = 5000;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,

  login: async (email: string, password: string, options?: LoginOptions) => {
    setAuthSessionPersistence(options?.persistSession ?? getAuthSessionPersistence());
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }

    set({ session: data.session });

    // /users/me와 loadCompanies를 병렬로 시작 — initialize()와 동일한 패턴
    useAppStore.getState().loadCompanies();
    try {
      const profile = await fetchWithAuth<UserProfile>('/api/v1/users/me');
      set({ user: profile });
    } catch (err) {
      console.error('[authStore] 프로필 조회 실패:', err);
    }
  },

  loginWithDevMock: async () => {
    clearStoredAuthSession();
    startDevMockSession();
    set({ session: createDevMockSession(), user: DEV_MOCK_PROFILE, isLoading: false });
    await useAppStore.getState().loadCompanies();
  },

  logout: async () => {
    if (isDevMockSessionActive()) {
      clearDevMockSession();
      clearStoredAuthSession();
    } else {
      await supabase.auth.signOut();
    }
    useAppStore.setState({ companies: [], companiesLoaded: false, selectedCompanyId: 'all' });
    set({ session: null, user: null });
  },

  initialize: () => {
    let initialized = false;

    if (isDevMockSessionActive()) {
      set({ session: createDevMockSession(), user: DEV_MOCK_PROFILE, isLoading: false });
      useAppStore.getState().loadCompanies();
      return;
    }

    const timeout = setTimeout(() => {
      if (isDevMockSessionActive()) {
        set({ session: createDevMockSession(), user: DEV_MOCK_PROFILE, isLoading: false });
        initialized = true;
        return;
      }
      console.warn('[authStore] 초기화 타임아웃 — 세션 초기화 후 로그인으로 이동');
      supabase.auth.signOut();
      set({ session: null, user: null, isLoading: false });
      initialized = true;
    }, INIT_TIMEOUT_MS);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      if (initialized) return;
      if (isDevMockSessionActive()) {
        set({ session: createDevMockSession(), user: DEV_MOCK_PROFILE, isLoading: false });
        useAppStore.getState().loadCompanies();
        initialized = true;
        return;
      }

      set({ session });

      if (session) {
        // me와 loadCompanies 동시 시작 — loadCompanies 실패해도 대시보드 표시
        useAppStore.getState().loadCompanies();
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
      initialized = true;
    }).catch(() => {
      clearTimeout(timeout);
      if (initialized) return;
      if (isDevMockSessionActive()) {
        set({ session: createDevMockSession(), user: DEV_MOCK_PROFILE, isLoading: false });
        useAppStore.getState().loadCompanies();
        initialized = true;
        return;
      }
      console.error('[authStore] 세션 조회 실패');
      supabase.auth.signOut();
      set({ session: null, user: null, isLoading: false });
      initialized = true;
    });

    supabase.auth.onAuthStateChange((event, session) => {
      if (isDevMockSessionActive()) return;

      // 초기화 완료 전이면 getSession에서 처리하므로 무시
      if (!initialized) return;

      console.debug('[authStore] onAuthStateChange:', event);
      set({ session });

      // TOKEN_REFRESHED: 세션만 업데이트, 프로필 재로드 불필요 — 블로킹 방지
      if (event === 'TOKEN_REFRESHED') return;

      if (session) {
        // 비동기 프로필 조회 — await 하지 않음 (블로킹 방지)
        fetchWithAuth<UserProfile>('/api/v1/users/me')
          .then((profile) => set({ user: profile }))
          .catch(() => { /* 상태 변경 시 프로필 조회 실패는 무시 */ });
      } else {
        set({ user: null });
      }
    });
  },
}));
