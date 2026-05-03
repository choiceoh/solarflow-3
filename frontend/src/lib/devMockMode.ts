import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/models';
import { detectTenantScope } from '@/lib/tenantScope';

const DEV_MOCK_LOGIN_KEY = 'solarflow-dev-mock-login';
const DEV_MOCK_USER_ID_TOPSOLAR = '00000000-0000-4000-8000-000000000019';
const DEV_MOCK_USER_ID_BARO = '00000000-0000-4000-8000-000000000020';
const DEV_MOCK_EMAIL_TOPSOLAR = 'mock@solarflow.local';
const DEV_MOCK_EMAIL_BARO = 'mock@baro.local';

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
  return import.meta.env.VITE_ENABLE_DEV_MOCK_LOGIN !== 'false';
}

export function isDevMockSessionActive(): boolean {
  return isDevMockLoginAllowed() && readStorageFlag(DEV_MOCK_LOGIN_KEY);
}

export function startDevMockSession(): void {
  if (!isDevMockLoginAllowed()) {
    throw new Error('목업 로그인은 현재 빌드에서 비활성화되어 있습니다');
  }
  writeStorageFlag(DEV_MOCK_LOGIN_KEY, true);
}

export function clearDevMockSession(): void {
  writeStorageFlag(DEV_MOCK_LOGIN_KEY, false);
}

const DEV_MOCK_PROFILE_TOPSOLAR: UserProfile = {
  user_id: DEV_MOCK_USER_ID_TOPSOLAR,
  email: DEV_MOCK_EMAIL_TOPSOLAR,
  name: '목업 관리자',
  role: 'admin',
  department: '디자인 검토',
  phone: null,
  avatar_url: null,
  is_active: true,
  persona: null,
  preferences: null,
};

const DEV_MOCK_PROFILE_BARO: UserProfile = {
  user_id: DEV_MOCK_USER_ID_BARO,
  email: DEV_MOCK_EMAIL_BARO,
  name: '바로 목업 관리자',
  role: 'admin',
  department: '바로 검토',
  phone: null,
  avatar_url: null,
  is_active: true,
  persona: null,
  preferences: null,
};

export function getDevMockProfile(): UserProfile {
  return detectTenantScope() === 'baro' ? DEV_MOCK_PROFILE_BARO : DEV_MOCK_PROFILE_TOPSOLAR;
}

export function createDevMockSession(): Session {
  const profile = getDevMockProfile();
  const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60 * 24);
  return {
    access_token: 'dev-mock-access-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: expiresAt,
    refresh_token: 'dev-mock-refresh-token',
    user: {
      id: profile.user_id,
      aud: 'authenticated',
      role: 'authenticated',
      email: profile.email,
      email_confirmed_at: '2026-05-01T00:00:00.000Z',
      phone: '',
      confirmed_at: '2026-05-01T00:00:00.000Z',
      last_sign_in_at: '2026-05-01T00:00:00.000Z',
      app_metadata: { provider: 'dev-mock', providers: ['dev-mock'] },
      user_metadata: { name: profile.name },
      identities: [],
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      is_anonymous: false,
    },
  } as Session;
}
