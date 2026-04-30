import { useAuthStore } from '@/stores/authStore';

// useAuth — 인증 상태 래퍼 훅
export function useAuth() {
  const { session, user, isLoading, login, loginWithDevMock, logout } = useAuthStore();

  return {
    isAuthenticated: !!session,
    user,
    role: user?.role ?? null,
    login,
    loginWithDevMock,
    logout,
    isLoading,
  };
}
