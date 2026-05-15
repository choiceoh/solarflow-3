// 운영자(또는 admin)가 사이트 단위로 설정한 UI 기본값(테이블 컬럼 순서/폭, KPI 카드).
//
// 의도: 사용자가 자기 localStorage 에 한 번도 컬럼을 만지지 않았을 때 적용되는 default.
// 개인 > 운영자 우선순위는 column hook 들과 useKpiVisibility 안에서 강제한다.
//
// 부트스트랩: App.tsx 가 로그인 직후 load() 를 한 번 호출 → /api/v1/ui-defaults/{tenant}
// fetch 후 캐시. 페이지가 마운트될 때 store 값이 이미 들어있으면 hook 의 initialState
// 로 합쳐지고, 늦게 도착하면 다음 페이지 진입 시부터 반영된다(허용 가능한 race).
//
// 저장: 운영자 설정 페이지가 save(payload) 를 호출 → PUT /api/v1/ui-defaults/{tenant}.
import { create } from 'zustand';
import { fetchWithAuth } from '@/lib/api';
import type { ColumnPinningState } from '@/lib/columnPinning';
import type { SortingState } from '@/lib/columnSort';
import type { TenantScope } from '@/lib/tenantScope';

export interface UiTableDefault {
  /** TanStack columnOrderState 호환 — column id 배열. */
  order?: string[];
  /** TanStack columnSizingState 호환 — { [columnId]: number }. */
  widths?: Record<string, number>;
  /** 정렬 default — SortingState. 비어 있으면 정렬 없음. */
  sort?: SortingState;
  /** 컬럼 고정 default — { left, right }. 비어 있으면 고정 없음. */
  pinning?: ColumnPinningState;
}

export interface UiKpiDefault {
  /** KpiStrip 이 숨길 metric id 목록. 비어있으면 전부 노출. */
  hidden?: string[];
}

export interface UiDefaults {
  tables: Record<string, UiTableDefault>;
  kpi: Record<string, UiKpiDefault>;
}

const EMPTY_DEFAULTS: UiDefaults = { tables: {}, kpi: {} };

interface UiDefaultsState {
  tenant: TenantScope | null;
  defaults: UiDefaults;
  loaded: boolean;
  loading: boolean;
  load: (tenant: TenantScope) => Promise<void>;
  save: (tenant: TenantScope, next: UiDefaults) => Promise<void>;
  /** 핸들러/페이지가 직접 갱신할 때 — save() 응답을 기다리지 않고 즉시 store 갱신. */
  setLocal: (next: UiDefaults) => void;
}

let inflight: Promise<void> | null = null;

export const useUiDefaultsStore = create<UiDefaultsState>((set, get) => ({
  tenant: null,
  defaults: EMPTY_DEFAULTS,
  loaded: false,
  loading: false,

  load: (tenant) => {
    const current = get();
    if (current.tenant === tenant && current.loaded) return Promise.resolve();
    if (inflight) return inflight;
    set({ loading: true, tenant });
    inflight = fetchWithAuth<UiDefaults>(`/api/v1/ui-defaults/${tenant}`)
      .then((value) => {
        const next: UiDefaults = {
          tables: value?.tables ?? {},
          kpi: value?.kpi ?? {},
        };
        set({ defaults: next, loaded: true, loading: false });
      })
      .catch(() => {
        // 실패해도 빈 default 로 동작 — 사용자 경험 막지 않음.
        set({ defaults: EMPTY_DEFAULTS, loaded: true, loading: false });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },

  save: async (tenant, next) => {
    // 낙관적 업데이트 — 실패 시 원복.
    const prev = get().defaults;
    set({ defaults: next });
    try {
      await fetchWithAuth(`/api/v1/ui-defaults/${tenant}`, {
        method: 'PUT',
        body: JSON.stringify(next),
      });
    } catch (err) {
      set({ defaults: prev });
      throw err;
    }
  },

  setLocal: (next) => set({ defaults: next }),
}));

// 비-React 컨텍스트(컬럼 hook 들)에서 마운트 시 한 번 읽기 위한 헬퍼.
export function getTableDefault(tableId: string): UiTableDefault | undefined {
  return useUiDefaultsStore.getState().defaults.tables[tableId];
}

export function getKpiDefault(scopeId: string): UiKpiDefault | undefined {
  return useUiDefaultsStore.getState().defaults.kpi[scopeId];
}

/**
 * React 컴포넌트가 한 테이블의 운영자 default 를 구독하기 위한 selector.
 * 페이지가 useColumnPinning 등에 fallback 으로 넘길 때 사용.
 */
export function useTableDefault(tableId: string): UiTableDefault | undefined {
  return useUiDefaultsStore((s) => s.defaults.tables[tableId]);
}
