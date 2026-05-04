import { readStoredAuthToken, supabase } from './supabase';
import { isDevMockApiActive, mockFetchBlobWithAuth, mockFetchWithAuth } from './devMockApi';

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

// getSession()에 타임아웃 적용 — 토큰 갱신 중 블로킹 방지
const SESSION_TIMEOUT_MS = 3000;

async function parseResponseBody<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    return text as T;
  }

  return JSON.parse(text) as T;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const parsed = await parseResponseBody<{ message?: string } | string>(res);
    if (typeof parsed === 'string' && parsed.trim()) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.message) return parsed.message;
  } catch {
    // 에러 응답 본문이 깨져 있어도 원래 HTTP 상태는 유지한다.
  }
  return fallback;
}

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

  // 타임아웃 또는 실패 시 선택된 브라우저 저장소 fallback
  const fallback = readStoredAuthToken();
  if (fallback) {
    console.debug('[SolarFlow] getSession 타임아웃 — 저장된 토큰 사용');
  }
  return fallback;
}

// fetchWithAuthRaw — 인증·토큰갱신 처리만 하고 Response 객체 그대로 반환.
// 헤더(X-Total-Count 등)까지 필요한 호출자가 사용한다. fetchWithAuth 내부에서도 재사용.
async function fetchWithAuthRaw(path: string, options?: RequestInit): Promise<Response> {
  const token = await getSessionToken();
  const isFormData = options?.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status !== 401) return res;

  // 토큰 갱신 시도
  const newToken = await refreshAccessToken();
  if (newToken) {
    headers['Authorization'] = `Bearer ${newToken}`;
    const retryRes = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
    if (retryRes.status !== 401) return retryRes;
  }

  // 401 — 로그아웃
  await supabase.auth.signOut();
  window.location.href = '/login';
  throw new Error('인증이 만료되었습니다');
}

// fetchWithAuth — Supabase 세션 토큰을 자동 첨부하는 fetch 래퍼
// getSession()에 3초 타임아웃, 401 시 토큰 갱신 후 재시도
export async function fetchWithAuth<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  if (isDevMockApiActive()) {
    return mockFetchWithAuth<T>(path, options);
  }

  const res = await fetchWithAuthRaw(path, options);

  if (!res.ok) {
    const error = await readErrorMessage(res, '요청 실패');
    throw new Error(error || `HTTP ${res.status}`);
  }

  return parseResponseBody<T>(res);
}

// fetchAllPaginated — server-side 페이지네이션 응답을 1000건씩 자동 청크 누적해 한 번에 반환.
// Supabase Cloud db-max-rows=1000 cap 을 클라이언트 루프로 우회.
// 옛 시그니처(전체 데이터 한 번에 받음) 를 유지하는 hook 들이 사용한다.
//
// 사용 예: fetchAllPaginated<Outbound>('/api/v1/outbounds', 'company_id=foo&status=active')
// path 는 ? 없는 베이스 경로, baseQuery 는 ?` 없는 기존 쿼리스트링.
const PAGINATION_CHUNK_SIZE = 1000;
const PAGINATION_MAX_PAGES = 500;

export async function fetchAllPaginated<T = unknown>(path: string, baseQuery: string = ''): Promise<T[]> {
  const sep = baseQuery ? '&' : '';
  const first = await fetchWithAuthMeta<T[]>(
    `${path}?${baseQuery}${sep}limit=${PAGINATION_CHUNK_SIZE}&offset=0`,
  );
  const accumulated: T[] = [...first.data];
  const total = first.totalCount;
  if (total === null || accumulated.length >= total) return accumulated;
  for (let page = 1; page < PAGINATION_MAX_PAGES; page++) {
    const offset = page * PAGINATION_CHUNK_SIZE;
    if (offset >= total) break;
    const next = await fetchWithAuth<T[]>(
      `${path}?${baseQuery}${sep}limit=${PAGINATION_CHUNK_SIZE}&offset=${offset}`,
    );
    if (next.length === 0) break;
    accumulated.push(...next);
    if (accumulated.length >= total) break;
  }
  return accumulated;
}

// fetchWithAuthMeta — fetchWithAuth + 응답 헤더(X-Total-Count 등) 같이 반환.
// 청크 페이지네이션 누적용. dev mock 모드에서는 totalCount=null 로 떨어지고 호출 측이 length 로 fallback.
export async function fetchWithAuthMeta<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<{ data: T; totalCount: number | null }> {
  if (isDevMockApiActive()) {
    const data = await mockFetchWithAuth<T>(path, options);
    return { data, totalCount: null };
  }

  const res = await fetchWithAuthRaw(path, options);

  if (!res.ok) {
    const error = await readErrorMessage(res, '요청 실패');
    throw new Error(error || `HTTP ${res.status}`);
  }

  const data = await parseResponseBody<T>(res);
  const raw = res.headers.get('X-Total-Count');
  const parsed = raw === null ? null : Number(raw);
  const totalCount = parsed !== null && Number.isFinite(parsed) ? parsed : null;
  return { data, totalCount };
}

export async function fetchBlobWithAuth(path: string, options?: RequestInit): Promise<Response> {
  if (isDevMockApiActive()) {
    return mockFetchBlobWithAuth();
  }

  const token = await getSessionToken();
  const headers: Record<string, string> = {
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
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      });
      if (retryRes.ok) return retryRes;
      if (retryRes.status === 401) {
        await supabase.auth.signOut();
        window.location.href = '/login';
        throw new Error('인증이 만료되었습니다');
      }
      throw new Error(`HTTP ${retryRes.status}`);
    }

    await supabase.auth.signOut();
    window.location.href = '/login';
    throw new Error('인증이 만료되었습니다');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res;
}

// streamFetchWithAuth — Vercel AI SDK 의 transport.fetch 에 주입할 fetch 래퍼.
// fetch 시그니처(input, init) 그대로 받아 Response 반환. 401 시 토큰 갱신 후 1회 재시도.
// fetchWithAuth 와 달리 본문 파싱 안 함 — 스트림은 호출자가 res.body 로 직접 읽음.
export const streamFetchWithAuth: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const token = await getSessionToken();

  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const finalURL = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
  const res = await fetch(finalURL, { ...init, headers });
  if (res.status !== 401) return res;

  const newToken = await refreshAccessToken();
  if (!newToken) {
    await supabase.auth.signOut();
    window.location.href = '/login';
    throw new Error('인증이 만료되었습니다');
  }
  headers.set('Authorization', `Bearer ${newToken}`);
  return fetch(finalURL, { ...init, headers });
};

// 기존 호환용
export async function api<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  return fetchWithAuth<T>(path, options);
}

// 마스터 API 함수들
type MasterRecord = Record<string, unknown>;

export const masterApi = {
  companies: {
    list: () => fetchWithAuth<MasterRecord[]>('/api/v1/companies'),
    get: (id: string) => fetchWithAuth<MasterRecord>(`/api/v1/companies/${id}`),
    create: (data: MasterRecord) => fetchWithAuth<MasterRecord>('/api/v1/companies', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MasterRecord) => fetchWithAuth<MasterRecord>(`/api/v1/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  manufacturers: {
    list: () => fetchWithAuth<MasterRecord[]>('/api/v1/manufacturers'),
    get: (id: string) => fetchWithAuth<MasterRecord>(`/api/v1/manufacturers/${id}`),
    create: (data: MasterRecord) => fetchWithAuth<MasterRecord>('/api/v1/manufacturers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MasterRecord) => fetchWithAuth<MasterRecord>(`/api/v1/manufacturers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  products: {
    list: (params?: string) => fetchWithAuth<MasterRecord[]>(`/api/v1/products${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<MasterRecord>(`/api/v1/products/${id}`),
    create: (data: MasterRecord) => fetchWithAuth<MasterRecord>('/api/v1/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MasterRecord) => fetchWithAuth<MasterRecord>(`/api/v1/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  partners: {
    list: (params?: string) => fetchWithAuth<MasterRecord[]>(`/api/v1/partners${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<MasterRecord>(`/api/v1/partners/${id}`),
    create: (data: MasterRecord) => fetchWithAuth<MasterRecord>('/api/v1/partners', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MasterRecord) => fetchWithAuth<MasterRecord>(`/api/v1/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  warehouses: {
    list: (params?: string) => fetchWithAuth<MasterRecord[]>(`/api/v1/warehouses${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<MasterRecord>(`/api/v1/warehouses/${id}`),
    create: (data: MasterRecord) => fetchWithAuth<MasterRecord>('/api/v1/warehouses', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MasterRecord) => fetchWithAuth<MasterRecord>(`/api/v1/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  banks: {
    list: (params?: string) => fetchWithAuth<MasterRecord[]>(`/api/v1/banks${params ? '?' + params : ''}`),
    get: (id: string) => fetchWithAuth<MasterRecord>(`/api/v1/banks/${id}`),
    create: (data: MasterRecord) => fetchWithAuth<MasterRecord>('/api/v1/banks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: MasterRecord) => fetchWithAuth<MasterRecord>(`/api/v1/banks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
};
