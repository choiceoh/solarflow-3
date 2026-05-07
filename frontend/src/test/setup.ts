import { GlobalRegistrator } from '@happy-dom/global-registrator';

// Bun test 는 기본적으로 DOM 이 없으므로 happy-dom 글로벌 등록.
// register() 는 idempotent — 중복 호출돼도 안전.
if (typeof window === 'undefined') {
  GlobalRegistrator.register();
}

// VITE_* env 는 vite plugin 이 주입하는데 bun test 는 vite 안 통해 그대로 빈 값.
// supabase.ts 같은 모듈이 import 시점에 검증 throw 하므로 dummy 주입 필요.
process.env.VITE_SUPABASE_URL ??= 'http://localhost:54321';
process.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key';
// import.meta.env 도 happy-dom 환경에서 동작하도록 직접 채움.
if (typeof import.meta.env === 'object') {
  (import.meta.env as Record<string, string>).VITE_SUPABASE_URL ??= 'http://localhost:54321';
  (import.meta.env as Record<string, string>).VITE_SUPABASE_ANON_KEY ??= 'test-anon-key';
}

// jest-dom matchers — Bun test 는 jest 호환 expect 를 expose 하므로 그대로 동작.
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, mock } from 'bun:test';

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mock((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: mock(() => {}),
      removeListener: mock(() => {}),
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {}),
      dispatchEvent: mock(() => false),
    })),
  });
}

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: TestResizeObserver,
});

if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    writable: true,
    value: mock(() => {}),
  });
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: mock(() => {}),
  });
}
