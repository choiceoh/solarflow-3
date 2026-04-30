import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const AUTH_STORAGE_KEY = 'solarflow-auth';
export const AUTH_PERSIST_LOGIN_KEY = 'solarflow-auth-persist-login';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[SolarFlow] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다.\n' +
    '.env 파일에 환경변수를 설정해주세요.'
  );
}

function getStorageValue(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageValue(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // 브라우저 저장소가 막혀 있어도 로그인 시도 자체는 계속 진행한다.
  }
}

function removeStorageValue(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // 브라우저 저장소가 막혀 있어도 로그아웃 흐름은 계속 진행한다.
  }
}

export function getAuthSessionPersistence(): boolean {
  return getStorageValue(localStorage, AUTH_PERSIST_LOGIN_KEY) !== 'false';
}

export function setAuthSessionPersistence(enabled: boolean): void {
  setStorageValue(localStorage, AUTH_PERSIST_LOGIN_KEY, enabled ? 'true' : 'false');
  removeStorageValue(enabled ? sessionStorage : localStorage, AUTH_STORAGE_KEY);
}

function getAuthSessionStorage(): Storage {
  return getAuthSessionPersistence() ? localStorage : sessionStorage;
}

function parseAccessToken(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return typeof data?.access_token === 'string' ? data.access_token : null;
  } catch {
    return null;
  }
}

export function readStoredAuthToken(): string | null {
  return parseAccessToken(getStorageValue(getAuthSessionStorage(), AUTH_STORAGE_KEY));
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: AUTH_STORAGE_KEY,
      storage: {
        getItem: (key: string) => getStorageValue(getAuthSessionStorage(), key),
        setItem: (key: string, value: string) => {
          const targetStorage = getAuthSessionStorage();
          const otherStorage = targetStorage === localStorage ? sessionStorage : localStorage;
          setStorageValue(targetStorage, key, value);
          removeStorageValue(otherStorage, key);
        },
        removeItem: (key: string) => {
          removeStorageValue(localStorage, key);
          removeStorageValue(sessionStorage, key);
        },
      },
    },
  }
);

// 탭 복귀 시 세션 선제 갱신 — 방치 후 첫 클릭 블로킹 방지
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    supabase.auth.getSession().catch(() => {
      console.debug('[SolarFlow] 탭 복귀 시 세션 조회 실패 — 다음 API 호출 시 처리됨');
    });
  }
});
