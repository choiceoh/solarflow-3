import { supabase } from './supabase';

// API 기본 URL — 개발에서는 프록시, 운영에서는 직접 연결
const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD ? 'https://solarflow-backend.fly.dev' : ''
);

// fetchWithAuth — Supabase 세션 토큰을 자동 첨부하는 fetch 래퍼
// 401 응답 시 자동 로그아웃
export async function fetchWithAuth<T>(path: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
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

// 기존 호환용 — 인증 없는 공개 API 호출 (남겨두되 내부에서는 fetchWithAuth 사용)
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
