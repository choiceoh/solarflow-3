import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/models';

const DEV_MOCK_LOGIN_KEY = 'solarflow-dev-mock-login';
const DEV_MOCK_USER_ID = '00000000-0000-4000-8000-000000000019';
const DEV_MOCK_EMAIL = 'mock@solarflow.local';

function readStorageFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeStorageFlag(key: string, enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(key, 'true');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // 개발용 목업 모드는 저장소가 막힌 환경에서는 세션을 유지하지 않는다.
  }
}

export function isDevMockLoginAllowed(): boolean {
  const isLocalBrowser = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '::1'
  );
  return import.meta.env.DEV || isLocalBrowser || import.meta.env.VITE_ENABLE_DEV_MOCK_LOGIN === 'true';
}

export function isDevMockSessionActive(): boolean {
  return isDevMockLoginAllowed() && readStorageFlag(DEV_MOCK_LOGIN_KEY);
}

export function startDevMockSession(): void {
  if (!isDevMockLoginAllowed()) {
    throw new Error('개발용 목업 로그인은 현재 빌드에서 비활성화되어 있습니다');
  }
  writeStorageFlag(DEV_MOCK_LOGIN_KEY, true);
}

export function clearDevMockSession(): void {
  writeStorageFlag(DEV_MOCK_LOGIN_KEY, false);
}

export const DEV_MOCK_PROFILE: UserProfile = {
  user_id: DEV_MOCK_USER_ID,
  email: DEV_MOCK_EMAIL,
  name: '목업 관리자',
  role: 'admin',
  department: '디자인 검토',
  phone: null,
  avatar_url: null,
  is_active: true,
};

export function createDevMockSession(): Session {
  const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60 * 24);
  return {
    access_token: 'dev-mock-access-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: expiresAt,
    refresh_token: 'dev-mock-refresh-token',
    user: {
      id: DEV_MOCK_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: DEV_MOCK_EMAIL,
      email_confirmed_at: '2026-05-01T00:00:00.000Z',
      phone: '',
      confirmed_at: '2026-05-01T00:00:00.000Z',
      last_sign_in_at: '2026-05-01T00:00:00.000Z',
      app_metadata: { provider: 'dev-mock', providers: ['dev-mock'] },
      user_metadata: { name: DEV_MOCK_PROFILE.name },
      identities: [],
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      is_anonymous: false,
    },
  } as Session;
}
