// Phase 4 PoC: 계열사 포크 — tenant 기반 config 오버레이
// URL ?tenant=topenergy 또는 localStorage 로 tenant 전환.
// 메타 화면/폼이 tenant override 를 적용해 같은 코드로 다른 도메인 라벨/컬럼/필드를 표현.

import { create } from 'zustand';

export type TenantId = 'topworks' | 'topenergy';
export const TENANT_LABELS: Record<TenantId, string> = {
  topworks: '탑웍스 (기본)',
  topenergy: '탑에너지 (계열사 PoC)',
};

interface TenantState {
  tenantId: TenantId;
  // Phase 4 PoC: runtime override 버전 — 변경 시 ListScreen/MetaForm 재렌더 트리거
  runtimeVersion: number;
  setTenantId: (id: TenantId) => void;
  initialize: () => void;
  bumpRuntimeVersion: () => void;
}

const STORAGE_KEY = 'sf.tenantId';

function readInitial(): TenantId {
  // 1) URL 우선
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('tenant');
    if (fromUrl === 'topenergy' || fromUrl === 'topworks') return fromUrl;
  }
  // 2) localStorage 폴백
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'topenergy' || stored === 'topworks') return stored;
  }
  return 'topworks';
}

export const useTenantStore = create<TenantState>((set) => ({
  tenantId: 'topworks',
  runtimeVersion: 0,
  setTenantId: (id) => {
    set({ tenantId: id });
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  },
  initialize: () => {
    set({ tenantId: readInitial() });
    // Runtime override 변경 이벤트 → version 증가
    if (typeof window !== 'undefined') {
      window.addEventListener('sf-tenant-runtime-changed', () => {
        set((s) => ({ runtimeVersion: s.runtimeVersion + 1 }));
      });
    }
  },
  bumpRuntimeVersion: () => set((s) => ({ runtimeVersion: s.runtimeVersion + 1 })),
}));
