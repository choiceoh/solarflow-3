import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
  type QueryKey,
  type UseMutationResult,
  type UseQueryOptions,
} from '@tanstack/react-query';

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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
  } as UseQueryOptions<T, Error>);
  return {
    data: q.data ?? null,
    loading: q.isLoading,
    error: errorMessage(q.error),
    reload: async () => { await q.refetch(); },
  };
}

export class ConflictError extends Error {
  status = 409 as const;
  constructor(message = '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export function isConflict(err: unknown): boolean {
  if (err instanceof ConflictError) return true;
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status: unknown }).status === 409;
  }
  return false;
}

export interface OptimisticListMutationOptions<TInput, TItem> {
  queryKey: QueryKey;
  mutationFn: (input: TInput) => Promise<TItem>;
  applyOptimistic: (cache: TItem[], input: TInput) => TItem[];
  onConflict?: (input: TInput) => void;
}

export function useOptimisticListMutation<TInput, TItem>(
  opts: OptimisticListMutationOptions<TInput, TItem>,
): UseMutationResult<TItem, Error, TInput, { prev: TItem[] | undefined }> {
  const qc = useQueryClient();
  return useMutation<TItem, Error, TInput, { prev: TItem[] | undefined }>({
    mutationFn: opts.mutationFn,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: opts.queryKey });
      const prev = qc.getQueryData<TItem[]>(opts.queryKey);
      if (prev) {
        qc.setQueryData<TItem[]>(opts.queryKey, opts.applyOptimistic(prev, input));
      }
      return { prev };
    },
    onError: (err, input, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(opts.queryKey, ctx.prev);
      }
      if (isConflict(err)) {
        opts.onConflict?.(input);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: opts.queryKey });
    },
  });
}

