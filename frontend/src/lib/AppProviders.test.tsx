import { describe, it, expect } from 'vitest';
import providerSrc from './AppProviders.tsx?raw';
import mainSrc from '../main.tsx?raw';

// 회귀 가드 — PR #111 → #119 → #128 → #132 → #343.
// IndexedDB 영속 캐시는 새로고침마다 첫 로딩이 cold 가 되지 않게 하는 핵심 인프라이고,
// 머지 충돌 정리 중 "단순 QueryClientProvider 로 풀어버리는" 사고가 두 번 일어났다.
// 이 테스트가 깨졌다면 같은 회귀가 또 일어난 것 — 풀지 말고 PersistQueryClientProvider 로 복원.
describe('AppProviders 회귀 가드', () => {
  it('PersistQueryClientProvider 로 감싸야 IndexedDB 에서 캐시 복원', () => {
    expect(providerSrc).toContain('PersistQueryClientProvider');
    expect(providerSrc).toContain('persistOptions');
  });

  it('main.tsx 는 AppProviders 만 사용 — 직접 QueryClientProvider 호출 금지', () => {
    expect(mainSrc).toContain('AppProviders');
    expect(mainSrc).not.toMatch(/^\s*import\s+\{[^}]*QueryClientProvider[^}]*\}/m);
  });
});
