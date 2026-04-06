import { supabase } from './supabase';

// API 기본 URL — 개발에서는 프록시, 운영에서는 직접 연결
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// 동시 401 발생 시 refreshSession 한 번만 호출하기 위한 공유 Promise
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = supabase.auth.refreshSession().then(({ data, error }) => {
    refreshPromise = null;
    if (error) {
      console.warn('[SolarFlow] 토큰 갱신 실패:', error.message);
      return null;
    }
    if (!data.session) {
      console.warn('[SolarFlow] 토큰 갱신: 세션 없음');
      return null;
    }
    return data.session.access_token;
  }).catch((err) => {
    refreshPromise = null;
    console.warn('[SolarFlow] 토큰 갱신 예외:', err);
    return null;
  });

  return refreshPromise;
}

// localStorage에서 토큰 직접 읽기 — getSession() 블로킹 시 fallback
function readTokenFromStorage(): string | null {
  try {
    const raw = localStorage.getItem('solarflow-auth');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.access_token ?? null;
  } catch { return null; }
}

// getSession()에 타임아웃 적용 — 토큰 갱신 중 블로킹 방지
const SESSION_TIMEOUT_MS = 3000;

async function getSessionToken(): Promise<string | null> {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_TIMEOUT_MS)),
    ]);
    if (result && 'data' in result) {
      const token = result.data.session?.access_token ?? null;
      if (token) return token;
    }
  } catch (err) {
    console.warn('[SolarFlow] getSession 실패:', err);
  }

  // 타임아웃 또는 실패 시 localStorage fallback
  const fallback = readTokenFromStorage();
  if (fallback) {
    console.debug('[SolarFlow] getSession 타임아웃 — localStorage 토큰 사용');
  }
  return fallback;
}

// fetchWithAuth — Supabase 세션 토큰을 자동 첨부하는 fetch 래퍼
// getSession()에 3초 타임아웃, 401 시 토큰 갱신 후 재시도
export async function fetchWithAuth<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getSessionToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // 토큰 갱신 시도
    const newToken = await refreshAccessToken();

    if (newToken) {
      // 갱신 성공 — 새 토큰으로 원래 요청 재시도
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      });

      if (retryRes.ok) {
        return retryRes.json();
      }

      // 재시도도 401이면 로그아웃
      if (retryRes.status === 401) {
        await supabase.auth.signOut();
        window.location.href = '/login';
        throw new Error('인증이 만료되었습니다');
      }

      const retryError = await retryRes.json().catch(() => ({ message: '요청 실패' }));
      throw new Error(retryError.message || `HTTP ${retryRes.status}`);
    }

    // 갱신 실패 — 로그아웃
    await supabase.auth.signOut();
    window.location.href = '/login';
    throw new Error('인증이 만료되었습니다');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: '요청 실패' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// 기존 호환용
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchWithAuth<T>(path, options);
}

// 마스터 API 함수들
export const masterApi = {
  companies: {
    list: () => fetchWithAuth<any[]>('/api/v1/companies'),
    get: (id: string) => fetchWithAuth<any>(`/api/v1/companies/${id}`),
    create: (data: any) => fetchWithAuth<any>('/api/v1/companies', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth<any>(`/api/v1/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  manufacturers: {
    list: () => fetchWithAuth<any[]>('/api/v1/manufacturers'),
    get: (id: string) => fetchWithAuth<any>(`/api/v1/manufacturers/${id}`),
    create: (data: any) => fetchWithAuth<any>('/api/v1/manufacturers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth<any>(`/api/v1/manufacturers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  products: {
    list: (params?: string) => fetchWithAuth<any[]>(`/api/v1/products${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<any>(`/api/v1/products/${id}`),
    create: (data: any) => fetchWithAuth<any>('/api/v1/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth<any>(`/api/v1/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  partners: {
    list: (params?: string) => fetchWithAuth<any[]>(`/api/v1/partners${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<any>(`/api/v1/partners/${id}`),
    create: (data: any) => fetchWithAuth<any>('/api/v1/partners', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth<any>(`/api/v1/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  warehouses: {
    list: (params?: string) => fetchWithAuth<any[]>(`/api/v1/warehouses${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<any>(`/api/v1/warehouses/${id}`),
    create: (data: any) => fetchWithAuth<any>('/api/v1/warehouses', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth<any>(`/api/v1/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  banks: {
    list: (params?: string) => fetchWithAuth<any[]>(`/api/v1/banks${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<any>(`/api/v1/banks/${id}`),
    create: (data: any) => fetchWithAuth<any>('/api/v1/banks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchWithAuth<any>(`/api/v1/banks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
};
