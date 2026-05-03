import { create } from 'zustand';
import { fetchWithAuth } from '@/lib/api';
import type { Company, Manufacturer, Product } from '@/types/masters';

export interface InspectorTarget {
  selector: string;
  tagName: string;
  className: string;
  configSource?: string;
  rect: { top: number; left: number; width: number; height: number };
}

export type InspectorMode = 'element' | 'token' | 'structure';

export type InspectorPseudoState = 'default' | 'hover' | 'focus' | 'active' | 'disabled';

export interface ClassNameDraft {
  id: string;
  selector: string;
  tagName: string;
  before: string;
  after: string;
  ts: number;
  /** 변경이 만들어진 페이지 pathname — 자동 재적용 시 같은 pathname 일 때만 적용 (다른 화면 영향 차단) */
  path: string;
}

const TOKEN_OVERRIDES_KEY = 'sf.token-overrides';
const CLASSNAME_DRAFTS_KEY = 'sf.inspector.classname-drafts';

const readDrafts = (): ClassNameDraft[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CLASSNAME_DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as ClassNameDraft[]) : [];
  } catch {
    return [];
  }
};

const writeDrafts = (drafts: ClassNameDraft[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (drafts.length === 0) {
      window.localStorage.removeItem(CLASSNAME_DRAFTS_KEY);
    } else {
      window.localStorage.setItem(CLASSNAME_DRAFTS_KEY, JSON.stringify(drafts));
    }
  } catch {
    /* noop */
  }
};

const readTokenOverrides = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TOKEN_OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
};

const writeTokenOverrides = (overrides: Record<string, string>) => {
  if (typeof window === 'undefined') return;
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(TOKEN_OVERRIDES_KEY);
    } else {
      window.localStorage.setItem(TOKEN_OVERRIDES_KEY, JSON.stringify(overrides));
    }
  } catch {
    /* noop */
  }
};

interface AppState {
  selectedCompanyId: string | null;
  setCompanyId: (id: string | null) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  editMode: boolean;
  toggleEditMode: () => void;
  inspectorTarget: InspectorTarget | null;
  setInspectorTarget: (target: InspectorTarget | null) => void;
  inspectorMode: InspectorMode;
  setInspectorMode: (mode: InspectorMode) => void;
  inspectorPseudoState: InspectorPseudoState;
  setInspectorPseudoState: (state: InspectorPseudoState) => void;
  /** 인스펙터에서 *다른 역할로 미리보기* 활성 시 그 역할. null 이면 실제 JWT 역할. */
  inspectorPreviewRole: string | null;
  setInspectorPreviewRole: (role: string | null) => void;
  /** 어시스턴트 drawer 열림 상태 — FloatingAssistantButton 이 사용 */
  assistantDrawerOpen: boolean;
  setAssistantDrawerOpen: (open: boolean) => void;
  tokenOverrides: Record<string, string>;
  setTokenOverride: (key: string, value: string) => void;
  resetTokenOverride: (key: string) => void;
  resetAllTokenOverrides: () => void;
  classNameDrafts: ClassNameDraft[];
  recordClassNameDraft: (draft: Omit<ClassNameDraft, 'id' | 'ts' | 'path'>) => void;
  removeClassNameDraft: (id: string) => void;
  clearClassNameDrafts: () => void;
  contextMenuPosition: { x: number; y: number } | null;
  setContextMenuPosition: (pos: { x: number; y: number } | null) => void;
  copiedClassName: string | null;
  setCopiedClassName: (cls: string | null) => void;
  companies: Company[];
  companiesLoaded: boolean;
  loadCompanies: () => Promise<void>;
  manufacturers: Manufacturer[];
  manufacturersLoaded: boolean;
  loadManufacturers: () => Promise<void>;
  invalidateManufacturers: () => void;
  products: Product[];
  productsLoaded: boolean;
  loadProducts: () => Promise<void>;
  invalidateProducts: () => void;
}

let companiesPromise: Promise<void> | null = null;
let manufacturersPromise: Promise<void> | null = null;
let productsPromise: Promise<void> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  selectedCompanyId: 'all',
  setCompanyId: (id) => set({ selectedCompanyId: id }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  editMode: false,
  toggleEditMode: () => set((s) => ({ editMode: !s.editMode, inspectorTarget: null })),
  inspectorTarget: null,
  setInspectorTarget: (target) => set({ inspectorTarget: target }),
  inspectorMode: 'element',
  setInspectorMode: (mode) => set({ inspectorMode: mode }),
  inspectorPseudoState: 'default',
  setInspectorPseudoState: (state) => set({ inspectorPseudoState: state }),
  inspectorPreviewRole: null,
  setInspectorPreviewRole: (role) => set({ inspectorPreviewRole: role }),
  assistantDrawerOpen: false,
  setAssistantDrawerOpen: (open) => set({ assistantDrawerOpen: open }),
  tokenOverrides: readTokenOverrides(),
  setTokenOverride: (key, value) =>
    set((s) => {
      const next = { ...s.tokenOverrides, [key]: value };
      writeTokenOverrides(next);
      return { tokenOverrides: next };
    }),
  resetTokenOverride: (key) =>
    set((s) => {
      const { [key]: _omit, ...rest } = s.tokenOverrides;
      writeTokenOverrides(rest);
      return { tokenOverrides: rest };
    }),
  resetAllTokenOverrides: () =>
    set(() => {
      writeTokenOverrides({});
      return { tokenOverrides: {} };
    }),
  classNameDrafts: readDrafts(),
  recordClassNameDraft: ({ selector, tagName, before, after }) =>
    set((s) => {
      // path 자동 캡쳐 — 변경 발생 시점 pathname (자동 재적용 시 페이지 격리에 사용)
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      // 같은 selector + 같은 path 의 기존 entry 만 매칭 (다른 페이지의 같은 selector 는 별개)
      const existing = s.classNameDrafts.find((d) => d.selector === selector && d.path === path);
      const id = existing?.id ?? `${selector}|${path}|${Date.now()}`;
      const baseBefore = existing?.before ?? before;
      let next: ClassNameDraft[];
      if (after === baseBefore) {
        // 원복 — draft 제거
        next = s.classNameDrafts.filter((d) => d.id !== id);
      } else {
        const newDraft: ClassNameDraft = { id, selector, tagName, before: baseBefore, after, ts: Date.now(), path };
        next = [...s.classNameDrafts.filter((d) => d.id !== id), newDraft];
      }
      writeDrafts(next);
      return { classNameDrafts: next };
    }),
  removeClassNameDraft: (id) =>
    set((s) => {
      const next = s.classNameDrafts.filter((d) => d.id !== id);
      writeDrafts(next);
      return { classNameDrafts: next };
    }),
  clearClassNameDrafts: () =>
    set(() => {
      writeDrafts([]);
      return { classNameDrafts: [] };
    }),
  contextMenuPosition: null,
  setContextMenuPosition: (pos) => set({ contextMenuPosition: pos }),
  copiedClassName: null,
  setCopiedClassName: (cls) => set({ copiedClassName: cls }),
  companies: [],
  companiesLoaded: false,
  loadCompanies: () => {
    if (get().companiesLoaded) return Promise.resolve();
    if (companiesPromise) return companiesPromise;
    companiesPromise = fetchWithAuth<Company[]>('/api/v1/companies')
      .then((list) => {
        set({ companies: list.filter((c) => c.is_active), companiesLoaded: true });
      })
      .catch((err) => {
        console.error('[appStore] companies 로딩 실패:', err);
      })
      .finally(() => {
        companiesPromise = null;
      });
    return companiesPromise;
  },
  manufacturers: [],
  manufacturersLoaded: false,
  loadManufacturers: () => {
    if (get().manufacturersLoaded) return Promise.resolve();
    if (manufacturersPromise) return manufacturersPromise;
    manufacturersPromise = fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => {
        set({ manufacturers: list.filter((m) => m.is_active), manufacturersLoaded: true });
      })
      .catch((err) => {
        console.error('[appStore] manufacturers 로딩 실패:', err);
      })
      .finally(() => {
        manufacturersPromise = null;
      });
    return manufacturersPromise;
  },
  invalidateManufacturers: () => set({ manufacturersLoaded: false }),
  products: [],
  productsLoaded: false,
  loadProducts: () => {
    if (get().productsLoaded) return Promise.resolve();
    if (productsPromise) return productsPromise;
    productsPromise = fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => {
        set({ products: list.filter((p) => p.is_active), productsLoaded: true });
      })
      .catch((err) => {
        console.error('[appStore] products 로딩 실패:', err);
      })
      .finally(() => {
        productsPromise = null;
      });
    return productsPromise;
  },
  invalidateProducts: () => set({ productsLoaded: false }),
}));
