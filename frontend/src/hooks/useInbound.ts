import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { fetchAllPaginated, fetchWithAuth, fetchWithAuthMeta } from "@/lib/api"
import { useAppStore } from "@/stores/appStore"
import { companyParams } from "@/lib/companyUtils"
import { useListQuery, useDetailQuery } from "@/lib/queryHelpers"
import type { BLSummary, BLShipment, BLLineItem } from "@/types/inbound"

// BL 대시보드 — KPI + 24개월 trend + by_status/by_inbound_type/by_manufacturer/by_port/by_forwarder.
// ProcurementPage BL 탭 + 4 BL Insight (Total/Import/Shipping/Customs) 가 사용.
export type BLScope = 'lifetime' | 'import' | 'shipping' | 'customs'

export interface BLDashboard {
  totals: {
    count: number
    import_count: number
    shipping_count: number
    customs_count: number
    completed_count: number
    cif_amount_krw: number
  }
  trend24: {
    month: string
    count: number
    import_count: number
    shipping_count: number
    customs_count: number
  }[]
  status_scope: BLScope
  by_status: BLDashboardBreakdownRow[]
  by_inbound_type: BLDashboardBreakdownRow[]
  by_manufacturer_top10: BLDashboardBreakdownRow[]
  by_port_top10: BLDashboardBreakdownRow[]
  by_forwarder_top10: BLDashboardBreakdownRow[]
}

export interface BLDashboardBreakdownRow {
  key: string
  label: string
  count: number
  share: number
}

export interface BLDashboardFilters {
  manufacturer_id?: string
  status?: string
  inbound_type?: string
  status_scope?: BLScope
}

export function useBLDashboard(filters: BLDashboardFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const queryKey = [
    'bls-dashboard',
    selectedCompanyId,
    filters.manufacturer_id ?? '',
    filters.status ?? '',
    filters.inbound_type ?? '',
    filters.status_scope ?? 'lifetime',
  ]
  const q = useQuery<BLDashboard, Error>({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id)
      if (filters.status) params.set('status', filters.status)
      if (filters.inbound_type) params.set('inbound_type', filters.inbound_type)
      if (filters.status_scope) params.set('status_scope', filters.status_scope)
      return fetchWithAuth<BLDashboard>(`/api/v1/bls/dashboard?${params}`)
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

export function useBLList(
  filters: { inbound_type?: string; status?: string; manufacturer_id?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)

  return useListQuery<BLShipment>(
    ["bls", selectedCompanyId, filters.inbound_type, filters.status, filters.manufacturer_id],
    async () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.inbound_type) params.set("inbound_type", filters.inbound_type)
      if (filters.status) params.set("status", filters.status)
      if (filters.manufacturer_id) params.set("manufacturer_id", filters.manufacturer_id)
      // 1000건 cap 우회 — 청크 누적으로 전체 받음.
      const list = await fetchAllPaginated<BLShipment>("/api/v1/bls", params.toString())
      // F18: PO번호/LC번호 enrichment — 백엔드가 평탄 반환이라 클라이언트 룩업
      const needPo = Array.from(
        new Set(
          list
            .map((b) => b.po_id)
            .filter((x): x is string => !!x && !list.find((l) => l.po_id === x)?.po_number),
        ),
      )
      const needLc = Array.from(
        new Set(
          list
            .map((b) => b.lc_id)
            .filter((x): x is string => !!x && !list.find((l) => l.lc_id === x)?.lc_number),
        ),
      )
      let poMap: Record<string, string> = {}
      let lcMap: Record<string, string> = {}
      if (needPo.length > 0 || needLc.length > 0) {
        try {
          const pos = await fetchAllPaginated<{ po_id: string; po_number?: string }>(
            "/api/v1/pos",
            companyParams(selectedCompanyId!).toString(),
          )
          poMap = Object.fromEntries(pos.map((p) => [p.po_id, p.po_number ?? ""]))
        } catch {
          /* skip */
        }
        try {
          const lcs = await fetchAllPaginated<{
            lc_id: string
            lc_number?: string
            purchase_orders?: { po_number?: string }
          }>("/api/v1/lcs", companyParams(selectedCompanyId!).toString())
          lcMap = Object.fromEntries(lcs.map((l) => [l.lc_id, l.lc_number ?? ""]))
        } catch {
          /* skip */
        }
      }
      return list.map((b) => ({
        ...b,
        po_number: b.po_number ?? (b.po_id ? poMap[b.po_id] : undefined),
        lc_number: b.lc_number ?? (b.lc_id ? lcMap[b.lc_id] : undefined),
      }))
    },
    { enabled: !!selectedCompanyId },
  )
}

// useBLListPaged — server-side pagination/sort/q. ProcurementPage BL 탭이 사용.
// enrichment (po_number/lc_number) 는 page 단위로 작은 IN 조회로 처리 — 기존 useBLList 의
// 전체 PO/LC fetchAll 패턴 회피.
export interface BLListPagedFilters {
  inbound_type?: string
  status?: string
  manufacturer_id?: string
  q?: string
  sort?: string
  order?: "asc" | "desc"
  page?: number
  pageSize?: number
  enabled?: boolean
}

export function useBLListPaged(filters: BLListPagedFilters = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const {
    inbound_type, status, manufacturer_id, q,
    sort, order, page = 1, pageSize = 100, enabled = true,
  } = filters
  const queryKey = [
    "bls-paged", selectedCompanyId, inbound_type ?? "", status ?? "", manufacturer_id ?? "",
    q ?? "", sort ?? "", order ?? "", page, pageSize,
  ]
  const result = useQuery({
    queryKey,
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      if (inbound_type) params.set("inbound_type", inbound_type)
      if (status) params.set("status", status)
      if (manufacturer_id) params.set("manufacturer_id", manufacturer_id)
      if (q) params.set("q", q)
      if (sort) params.set("sort", sort)
      if (order) params.set("order", order)
      params.set("limit", String(pageSize))
      params.set("offset", String((page - 1) * pageSize))
      const meta = await fetchWithAuthMeta<BLShipment[]>(`/api/v1/bls?${params}`)
      // page 단위 enrichment — unique po_id/lc_id 만 IN 조회.
      const list = meta.data
      const poIds = Array.from(new Set(list.map((b) => b.po_id).filter((x): x is string => !!x && !list.find((l) => l.po_id === x)?.po_number)))
      const lcIds = Array.from(new Set(list.map((b) => b.lc_id).filter((x): x is string => !!x && !list.find((l) => l.lc_id === x)?.lc_number)))
      let poMap: Record<string, string> = {}
      let lcMap: Record<string, string> = {}
      if (poIds.length > 0) {
        try {
          const inList = `(${poIds.join(",")})`
          const pos = await fetchWithAuth<{ po_id: string; po_number?: string }[]>(`/api/v1/pos?po_id=in.${encodeURIComponent(inList)}&limit=${poIds.length}`)
          poMap = Object.fromEntries(pos.map((p) => [p.po_id, p.po_number ?? ""]))
        } catch { /* skip */ }
      }
      if (lcIds.length > 0) {
        try {
          const inList = `(${lcIds.join(",")})`
          const lcs = await fetchWithAuth<{ lc_id: string; lc_number?: string }[]>(`/api/v1/lcs?lc_id=in.${encodeURIComponent(inList)}&limit=${lcIds.length}`)
          lcMap = Object.fromEntries(lcs.map((l) => [l.lc_id, l.lc_number ?? ""]))
        } catch { /* skip */ }
      }
      const enriched = list.map((b) => ({
        ...b,
        po_number: b.po_number ?? (b.po_id ? poMap[b.po_id] : undefined),
        lc_number: b.lc_number ?? (b.lc_id ? lcMap[b.lc_id] : undefined),
      }))
      return { data: enriched, totalCount: meta.totalCount }
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

export function useBLSummary(
  filters: { inbound_type?: string; status?: string; manufacturer_id?: string } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)

  return useDetailQuery<BLSummary>(
    [
      "bls-summary",
      selectedCompanyId,
      filters.inbound_type,
      filters.status,
      filters.manufacturer_id,
    ],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.inbound_type) params.set("inbound_type", filters.inbound_type)
      if (filters.status) params.set("status", filters.status)
      if (filters.manufacturer_id) params.set("manufacturer_id", filters.manufacturer_id)
      return fetchWithAuth<BLSummary>(`/api/v1/bls/summary?${params}`)
    },
    { enabled: !!selectedCompanyId },
  )
}

export function useBLDetail(blId: string | null) {
  return useDetailQuery<BLShipment>(
    ["bl", blId],
    () => fetchWithAuth<BLShipment>(`/api/v1/bls/${blId}`),
    { enabled: !!blId },
  )
}

export function useBLLines(blId: string | null) {
  return useListQuery<BLLineItem>(
    ["bl-lines", blId],
    () => fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${blId}/lines`),
    { enabled: !!blId },
  )
}
