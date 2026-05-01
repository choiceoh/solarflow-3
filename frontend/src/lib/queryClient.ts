import { QueryClient } from '@tanstack/react-query';

const TWO_MIN = 2 * 60_000;
const ONE_DAY = 24 * 60 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: TWO_MIN,
      gcTime: ONE_DAY,
      refetchInterval: TWO_MIN,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchIntervalInBackground: false,
      retry: 1,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
    },
  },
});
