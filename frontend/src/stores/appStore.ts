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

interface AppState {
  selectedCompanyId: string | null;
  setCompanyId: (id: string | null) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  editMode: boolean;
  toggleEditMode: () => void;
  inspectorTarget: InspectorTarget | null;
  setInspectorTarget: (target: InspectorTarget | null) => void;
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
