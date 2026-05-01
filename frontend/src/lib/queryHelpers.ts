import { useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';

function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface ListQueryResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useListQuery<T>(
  key: QueryKey,
  fn: () => Promise<T[]>,
  options?: { enabled?: boolean; staleTime?: number; gcTime?: number },
): ListQueryResult<T> {
  const q = useQuery<T[], Error>({
    queryKey: key,
    queryFn: fn,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
  } as UseQueryOptions<T[], Error>);
  return {
    data: q.data ?? [],
    loading: q.isLoading,
    error: errorMessage(q.error),
    reload: async () => { await q.refetch(); },
  };
}

export interface DetailQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useDetailQuery<T>(
  key: QueryKey,
  fn: () => Promise<T>,
  options?: { enabled?: boolean; staleTime?: number; gcTime?: number },
): DetailQueryResult<T> {
  const q = useQuery<T, Error>({
    queryKey: key,
    queryFn: fn,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime,
    gcTime: options?.gcTime,
  } as UseQueryOptions<T, Error>);
  return {
    data: q.data ?? null,
    loading: q.isLoading,
    error: errorMessage(q.error),
    reload: async () => { await q.refetch(); },
  };
}
