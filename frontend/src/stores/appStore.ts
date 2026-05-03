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
}

const TOKEN_OVERRIDES_KEY = 'sf.token-overrides';

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
  tokenOverrides: Record<string, string>;
  setTokenOverride: (key: string, value: string) => void;
  resetTokenOverride: (key: string) => void;
  resetAllTokenOverrides: () => void;
  classNameDrafts: ClassNameDraft[];
  recordClassNameDraft: (draft: Omit<ClassNameDraft, 'id' | 'ts'>) => void;
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
  classNameDrafts: [],
  recordClassNameDraft: ({ selector, tagName, before, after }) =>
    set((s) => {
      const existing = s.classNameDrafts.find((d) => d.selector === selector);
      const id = existing?.id ?? `${selector}-${Date.now()}`;
      const baseBefore = existing?.before ?? before;
      if (after === baseBefore) {
        // 원복 — draft 제거
        return { classNameDrafts: s.classNameDrafts.filter((d) => d.id !== id) };
      }
      const next: ClassNameDraft = { id, selector, tagName, before: baseBefore, after, ts: Date.now() };
      const filtered = s.classNameDrafts.filter((d) => d.id !== id);
      return { classNameDrafts: [...filtered, next] };
    }),
  removeClassNameDraft: (id) =>
    set((s) => ({ classNameDrafts: s.classNameDrafts.filter((d) => d.id !== id) })),
  clearClassNameDrafts: () => set({ classNameDrafts: [] }),
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
