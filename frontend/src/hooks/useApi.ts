import { useState, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';

// useApi — API 호출 + 로딩/에러 상태 관리 훅
export function useApi() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async <T>(path: string, options?: RequestInit): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchWithAuth<T>(path, options);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : '요청 실패';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const get = useCallback(<T>(path: string) => request<T>(path), [request]);

  const post = useCallback(<T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }), [request]);

  const put = useCallback(<T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }), [request]);

  const del = useCallback(<T>(path: string) =>
    request<T>(path, { method: 'DELETE' }), [request]);

  return { get, post, put, del, isLoading, error };
}
