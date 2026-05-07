import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { fetchAllPaginated, fetchWithAuth, fetchWithAuthMeta } from "@/lib/api"
import { useAppStore } from "@/stores/appStore"
import { companyParams } from "@/lib/companyUtils"
import { useDetailQuery, useListQuery } from "@/lib/queryHelpers"
import type {
  PurchaseOrder,
  POLineItem,
  LCRecord,
  LCLineItem,
  TTRemittance,
  PriceHistory,
  POSummary,
  LCSummary,
  TTSummary,
} from "@/types/procurement"

// PurchaseHistoryPage 4개 insight (Chains/Variants/PriceChanges/RecentEvents) 의 SQL 집계.
// PO + price_histories + LC + BL + TT 한 번에 SQL round-trip.
export interface PurchaseDashboard {
  totals: {
    chain_count: number
    variant_count: number
    price_change_count: number
    event_count: number
    chains_with_variants_count: number
  }
  trend24: {
    month: string
    chain_count: number
    variant_count: number
    price_change_count: number
    event_count: number
  }[]
  by_kind: { key: string; label: string; count: number; share: number }[]
  chains_breakdown: { key: string; label: string; count: number; share: number }[]
  by_manufacturer_top10: {
    key: string
    label: string
    chain_count: number
    variant_count: number
    price_change_count: number
    total_count: number
  }[]
  by_product_top10: { key: string; label: string; count: number; share: number }[]
  by_reason_top10: { key: string; label: string; count: number; share: number }[]
  by_head_po_top10: { key: string; label: string; count: number; share: number }[]
}

export function usePurchaseDashboard() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const q = useQuery<PurchaseDashboard, Error>({
    queryKey: ["purchase-dashboard", selectedCompanyId],
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      return fetchWithAuth<PurchaseDashboard>(`/api/v1/purchase/dashboard?${params}`)
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    dashboard: q.data ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch() },
  }
}

// PO 대시보드 — KPI + 24개월 trend + by_status/by_contract_type/by_manufacturer 를 서버 한 번에.
// ProcurementPage PO 탭 + 3 PO Insight (Active/ContractTypes/Shipping) 가 사용.
export type POScope = 'lifetime' | 'active' | 'shipping'

export interface PODashboard {
  totals: {
    count: number
    active_count: number
    shipping_count: number
    completed_count: number
    cancelled_count: number
    total_mw: number
    active_mw: number
    contract_types_count: number
  }
  trend24: {
    month: string
    count: number
    active_count: number
    shipping_count: number
    total_mw: number
    distinct_contract_types: number
  }[]
  status_scope: POScope
  by_status: PODashboardBreakdownRow[]
  by_contract_type: PODashboardBreakdownRow[]
  by_manufacturer_top10: PODashboardBreakdownRow[]
}

export interface PODashboardBreakdownRow {
  key: string
  label: string
  count: number
  total_mw: number
  share: number
}

export interface PODashboardFilters {
  status?: string
  manufacturer_id?: string
  contract_type?: string
  status_scope?: POScope
}

export function usePODashboard(filters: PODashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const queryKey = [
    'pos-dashboard',
    selectedCompanyId,
    filters.status ?? '',
    filters.manufacturer_id ?? '',
    filters.contract_type ?? '',
    filters.status_scope ?? 'lifetime',
  ]
  const q = useQuery<PODashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set('status', filters.status)
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id)
      if (filters.contract_type) params.set('contract_type', filters.contract_type)
      if (filters.status_scope) params.set('status_scope', filters.status_scope)
      return fetchWithAuth<PODashboard>(`/api/v1/pos/dashboard?${params}`)
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    dashboard: q.data ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch() },
  }
}

export function usePOList(
  filters: { status?: string; manufacturer_id?: string; contract_type?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)

  return useListQuery<PurchaseOrder>(
    ["pos", selectedCompanyId, filters.status, filters.manufacturer_id, filters.contract_type],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set("status", filters.status)
      if (filters.manufacturer_id) params.set("manufacturer_id", filters.manufacturer_id)
      if (filters.contract_type) params.set("contract_type", filters.contract_type)
      return fetchAllPaginated<PurchaseOrder>("/api/v1/pos", params.toString())
    },
    { enabled: !!selectedCompanyId },
  )
}

// usePOListPaged — server-side pagination/sort/q. ProcurementPage PO 탭이 사용.
// 기존 usePOList 는 다른 화면 (PurchaseHistoryPage 등) 호환을 위해 유지.
export interface POListPagedFilters {
  status?: string
  manufacturer_id?: string
  contract_type?: string
  q?: string
  sort?: string
  order?: "asc" | "desc"
  page?: number      // 1-based
  pageSize?: number
  enabled?: boolean
}

export function usePOListPaged(filters: POListPagedFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const {
    status, manufacturer_id, contract_type, q,
    sort, order, page = 1, pageSize = 100, enabled = true,
  } = filters
  const queryKey = [
    "pos-paged", selectedCompanyId, status ?? "", manufacturer_id ?? "", contract_type ?? "",
    q ?? "", sort ?? "", order ?? "", page, pageSize,
  ]
  const result = useQuery({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (status) params.set("status", status)
      if (manufacturer_id) params.set("manufacturer_id", manufacturer_id)
      if (contract_type) params.set("contract_type", contract_type)
      if (q) params.set("q", q)
      if (sort) params.set("sort", sort)
      if (order) params.set("order", order)
      params.set("limit", String(pageSize))
      params.set("offset", String((page - 1) * pageSize))
      return fetchWithAuthMeta<PurchaseOrder[]>(`/api/v1/pos?${params}`)
    },
    enabled: enabled && !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    items: result.data?.data ?? [],
    total: result.data?.totalCount ?? 0,
    loading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? (result.error as Error).message : null,
    reload: async () => { await result.refetch() },
  }
}

export function usePOSummary(
  filters: { status?: string; manufacturer_id?: string; contract_type?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  return useDetailQuery<POSummary>(
    [
      "pos-summary",
      selectedCompanyId,
      filters.status,
      filters.manufacturer_id,
      filters.contract_type,
    ],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set("status", filters.status)
      if (filters.manufacturer_id) params.set("manufacturer_id", filters.manufacturer_id)
      if (filters.contract_type) params.set("contract_type", filters.contract_type)
      return fetchWithAuth<POSummary>(`/api/v1/pos/summary?${params}`)
    },
    { enabled: !!selectedCompanyId },
  )
}

export function usePOLines(poId: string | null) {
  return useListQuery<POLineItem>(
    ["po-lines", poId],
    () => fetchWithAuth<POLineItem[]>(`/api/v1/pos/${poId}/lines`),
    { enabled: !!poId },
  )
}

export function useLCLines(lcId: string | null) {
  return useListQuery<LCLineItem>(
    ["lc-lines", lcId],
    () => fetchWithAuth<LCLineItem[]>(`/api/v1/lcs/${lcId}/lines`),
    { enabled: !!lcId },
  )
}

// LC 대시보드 — KPI + 24개월 trend + by_status/by_bank/by_urgency 를 서버 한 번에.
// ProcurementPage LC 탭 + 5 LC Insight (Total/Amount/Banks/Linked/Maturity) 가 사용.
export type LCScope = 'lifetime' | 'active' | 'maturity_soon'

export interface LCDashboard {
  totals: {
    count: number
    active_count: number
    opened_count: number
    settled_count: number
    cancelled_count: number
    total_amount_usd: number
    active_amount_usd: number
    banks_count: number
    maturity_soon_count: number
    overdue_count: number
  }
  trend24: {
    month: string
    count: number
    active_count: number
    amount_usd: number
    distinct_banks: number
  }[]
  status_scope: LCScope
  by_status: LCDashboardBreakdownRow[]
  by_bank_top10: LCDashboardBreakdownRow[]
  by_urgency: LCDashboardBreakdownRow[]  // maturity_soon 일 때만 채워짐
}

export interface LCDashboardBreakdownRow {
  key: string
  label: string
  count: number
  amount_usd_sum: number
  share: number
}

export interface LCDashboardFilters {
  po_id?: string
  bank_id?: string
  status?: string
  status_scope?: LCScope
}

export function useLCDashboard(filters: LCDashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const queryKey = [
    'lcs-dashboard',
    selectedCompanyId,
    filters.po_id ?? '',
    filters.bank_id ?? '',
    filters.status ?? '',
    filters.status_scope ?? 'lifetime',
  ]
  const q = useQuery<LCDashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.po_id) params.set('po_id', filters.po_id)
      if (filters.bank_id) params.set('bank_id', filters.bank_id)
      if (filters.status) params.set('status', filters.status)
      if (filters.status_scope) params.set('status_scope', filters.status_scope)
      return fetchWithAuth<LCDashboard>(`/api/v1/lcs/dashboard?${params}`)
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    dashboard: q.data ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch() },
  }
}

export function useLCList(
  filters: { status?: string; bank_id?: string; po_id?: string; manufacturer_id?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)

  return useListQuery<LCRecord>(
    [
      "lcs",
      selectedCompanyId,
      filters.status,
      filters.bank_id,
      filters.po_id,
      filters.manufacturer_id,
    ],
    async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set("status", filters.status)
      if (filters.bank_id) params.set("bank_id", filters.bank_id)
      if (filters.po_id) params.set("po_id", filters.po_id)
      if (filters.manufacturer_id) params.set("manufacturer_id", filters.manufacturer_id)
      const raw = await fetchAllPaginated<
        LCRecord & {
          banks?: { bank_name?: string }
          companies?: { company_name?: string }
          purchase_orders?: { po_number?: string; manufacturer_id?: string }
          manufacturer_id?: string
        }
      >("/api/v1/lcs", params.toString())
      return raw.map((r) => ({
        ...r,
        bank_name: r.bank_name ?? r.banks?.bank_name,
        company_name: r.company_name ?? r.companies?.company_name,
        po_number: r.po_number ?? r.purchase_orders?.po_number,
        manufacturer_id: r.manufacturer_id ?? r.purchase_orders?.manufacturer_id,
      }))
    },
    { enabled: !!selectedCompanyId },
  )
}

// useLCListPaged — server-side pagination/sort/q. ProcurementPage LC 탭이 사용.
// 주의: backend 가 manufacturer_id 필터 시 페이지 결과가 가변 (post-fetch 필터링) 이라
// total 이 부정확. ProcurementPage 는 manufacturer_id 사용 시 client-side 필터 fallback.
export interface LCListPagedFilters {
  status?: string
  bank_id?: string
  po_id?: string
  manufacturer_id?: string
  q?: string
  sort?: string
  order?: "asc" | "desc"
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useLCListPaged(filters: LCListPagedFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const {
    status, bank_id, po_id, manufacturer_id, q,
    sort, order, page = 1, pageSize = 100, enabled = true,
  } = filters
  const queryKey = [
    "lcs-paged", selectedCompanyId, status ?? "", bank_id ?? "", po_id ?? "",
    manufacturer_id ?? "", q ?? "", sort ?? "", order ?? "", page, pageSize,
  ]
  const result = useQuery({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (status) params.set("status", status)
      if (bank_id) params.set("bank_id", bank_id)
      if (po_id) params.set("po_id", po_id)
      if (manufacturer_id) params.set("manufacturer_id", manufacturer_id)
      if (q) params.set("q", q)
      if (sort) params.set("sort", sort)
      if (order) params.set("order", order)
      params.set("limit", String(pageSize))
      params.set("offset", String((page - 1) * pageSize))
      const meta = await fetchWithAuthMeta<Array<LCRecord & {
        banks?: { bank_name?: string }
        companies?: { company_name?: string }
        purchase_orders?: { po_number?: string; manufacturer_id?: string }
      }>>(`/api/v1/lcs?${params}`)
      const items = meta.data.map((r) => ({
        ...r,
        bank_name: r.bank_name ?? r.banks?.bank_name,
        company_name: r.company_name ?? r.companies?.company_name,
        po_number: r.po_number ?? r.purchase_orders?.po_number,
        manufacturer_id: r.manufacturer_id ?? r.purchase_orders?.manufacturer_id,
      })) as LCRecord[]
      return { data: items, totalCount: meta.totalCount }
    },
    enabled: enabled && !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    items: result.data?.data ?? [],
    total: result.data?.totalCount ?? 0,
    loading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? (result.error as Error).message : null,
    reload: async () => { await result.refetch() },
  }
}

export function useLCSummary(
  filters: { status?: string; bank_id?: string; po_id?: string; manufacturer_id?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  return useDetailQuery<LCSummary>(
    [
      "lcs-summary",
      selectedCompanyId,
      filters.status,
      filters.bank_id,
      filters.po_id,
      filters.manufacturer_id,
    ],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set("status", filters.status)
      if (filters.bank_id) params.set("bank_id", filters.bank_id)
      if (filters.po_id) params.set("po_id", filters.po_id)
      if (filters.manufacturer_id) params.set("manufacturer_id", filters.manufacturer_id)
      return fetchWithAuth<LCSummary>(`/api/v1/lcs/summary?${params}`)
    },
    { enabled: !!selectedCompanyId },
  )
}

// API 응답 중첩 구조: purchase_orders.po_number, purchase_orders.manufacturers.name_kr
type RawTT = TTRemittance & {
  purchase_orders?: { po_number?: string; manufacturers?: { name_kr?: string } }
}

// TT 대시보드 — KPI + 24개월 trend + by_status/by_manufacturer/by_bank/by_purpose/by_po 를 서버 한 번에.
// ProcurementPage TT 탭 + 4 TT Insight 가 사용. 응답 ~수 KB.
export type TTScope = 'lifetime' | 'completed' | 'planned'

export interface TTDashboard {
  totals: {
    count: number
    completed_count: number
    planned_count: number
    completed_amount_usd: number
    planned_amount_usd: number
    total_amount_usd: number
    po_count: number
  }
  trend24: {
    month: string
    count: number
    completed_count: number
    planned_count: number
    completed_amount_usd: number
    planned_amount_usd: number
    distinct_pos: number
  }[]
  status_scope: TTScope
  by_status: TTDashboardBreakdownRow[]
  by_manufacturer_top10: TTDashboardBreakdownRow[]
  by_bank_top10: TTDashboardBreakdownRow[]
  by_purpose_top10: TTDashboardBreakdownRow[]
  by_po_top10: TTDashboardBreakdownRow[]
}

export interface TTDashboardBreakdownRow {
  key: string
  label: string
  count: number
  amount_usd_sum: number
  share: number
}

export interface TTDashboardFilters {
  status?: string
  po_id?: string
  status_scope?: TTScope
}

export function useTTDashboard(filters: TTDashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const queryKey = [
    'tts-dashboard',
    selectedCompanyId,
    filters.status ?? '',
    filters.po_id ?? '',
    filters.status_scope ?? 'lifetime',
  ]
  const q = useQuery<TTDashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set('status', filters.status)
      if (filters.po_id) params.set('po_id', filters.po_id)
      if (filters.status_scope) params.set('status_scope', filters.status_scope)
      return fetchWithAuth<TTDashboard>(`/api/v1/tts/dashboard?${params}`)
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    dashboard: q.data ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch() },
  }
}

export function useTTList(filters: { status?: string; po_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)

  return useListQuery<TTRemittance>(
    ["tts", selectedCompanyId, filters.status, filters.po_id],
    async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set("status", filters.status)
      if (filters.po_id) params.set("po_id", filters.po_id)
      const raw = await fetchAllPaginated<RawTT>("/api/v1/tts", params.toString())
      return raw.map((r) => ({
        ...r,
        po_number: r.po_number ?? r.purchase_orders?.po_number ?? undefined,
        manufacturer_name:
          r.manufacturer_name ?? r.purchase_orders?.manufacturers?.name_kr ?? undefined,
      }))
    },
    { enabled: !!selectedCompanyId },
  )
}

// useTTListPaged — server-side pagination/sort/q. ProcurementPage TT 탭이 사용.
export interface TTListPagedFilters {
  status?: string
  po_id?: string
  q?: string
  sort?: string
  order?: "asc" | "desc"
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useTTListPaged(filters: TTListPagedFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const {
    status, po_id, q, sort, order, page = 1, pageSize = 100, enabled = true,
  } = filters
  const queryKey = [
    "tts-paged", selectedCompanyId, status ?? "", po_id ?? "",
    q ?? "", sort ?? "", order ?? "", page, pageSize,
  ]
  const result = useQuery({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (status) params.set("status", status)
      if (po_id) params.set("po_id", po_id)
      if (q) params.set("q", q)
      if (sort) params.set("sort", sort)
      if (order) params.set("order", order)
      params.set("limit", String(pageSize))
      params.set("offset", String((page - 1) * pageSize))
      const meta = await fetchWithAuthMeta<RawTT[]>(`/api/v1/tts?${params}`)
      const items = meta.data.map((r) => ({
        ...r,
        po_number: r.po_number ?? r.purchase_orders?.po_number ?? undefined,
        manufacturer_name:
          r.manufacturer_name ?? r.purchase_orders?.manufacturers?.name_kr ?? undefined,
      })) as TTRemittance[]
      return { data: items, totalCount: meta.totalCount }
    },
    enabled: enabled && !!selectedCompanyId,
    placeholderData: keepPreviousData,
  })
  return {
    items: result.data?.data ?? [],
    total: result.data?.totalCount ?? 0,
    loading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? (result.error as Error).message : null,
    reload: async () => { await result.refetch() },
  }
}

export function useTTSummary(filters: { status?: string; po_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  return useDetailQuery<TTSummary>(
    ["tts-summary", selectedCompanyId, filters.status, filters.po_id],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.status) params.set("status", filters.status)
      if (filters.po_id) params.set("po_id", filters.po_id)
      return fetchWithAuth<TTSummary>(`/api/v1/tts/summary?${params}`)
    },
    { enabled: !!selectedCompanyId },
  )
}

type RawPriceHistory = PriceHistory & {
  manufacturers?: { name_kr: string }
  products?: { product_code: string; product_name: string; spec_wp?: number }
  purchase_orders?: { po_number?: string }
}

export function usePriceHistoryList(filters: { manufacturer_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)

  return useListQuery<PriceHistory>(
    ["price-histories", selectedCompanyId, filters.manufacturer_id],
    async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.manufacturer_id) params.set("manufacturer_id", filters.manufacturer_id)
      const raw = await fetchAllPaginated<RawPriceHistory>(
        "/api/v1/price-histories",
        params.toString(),
      )
      return raw.map((r) => ({
        ...r,
        manufacturer_name: r.manufacturer_name ?? r.manufacturers?.name_kr,
        product_name: r.product_name ?? r.products?.product_name,
        spec_wp: r.spec_wp ?? r.products?.spec_wp,
        related_po_number: r.related_po_number ?? r.purchase_orders?.po_number ?? undefined,
      }))
    },
    { enabled: !!selectedCompanyId },
  )
}
