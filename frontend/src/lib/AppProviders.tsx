import { StrictMode, type ReactNode } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient } from '@/lib/queryClient';
import { persistOptions } from '@/lib/persist';

// 새로고침 시 IndexedDB 캐시 즉시 복원이 핵심.
// 단순 QueryClientProvider 로 되돌리지 말 것 — PR #111 → #119 → #128 → #132 → #343 회귀 이력.
// 그래서 main.tsx 가 충돌 표면이 되지 않게 이 파일로 추출. AppProviders.test.tsx 가 회귀 가드.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        {children}
      </PersistQueryClientProvider>
    </StrictMode>
  );
}
