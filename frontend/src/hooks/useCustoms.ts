import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { fetchAllPaginated, fetchWithAuth } from "@/lib/api"
import { useAppStore } from "@/stores/appStore"
import { companyParams } from "@/lib/companyUtils"
import { useListQuery, useDetailQuery } from "@/lib/queryHelpers"
import type { Declaration, DeclarationCost, Expense, ExpenseSummary } from "@/types/customs"

// CustomsPage 4개 insight (TypeCount/AvgExpense/BlLinked/ExpenseTotal) 의 SQL 집계.
export interface CustomsDashboardBreakdownRow {
  key: string
  label: string
  count: number
  sum_amount: number
  avg_amount: number
  share: number
}

export interface CustomsDashboard {
  totals: {
    count: number
    sum_amount: number
    avg_amount: number
    distinct_type_count: number
    bl_linked_count: number
  }
  trend24: {
    month: string
    count: number
    sum_amount: number
    bl_linked_count: number
    distinct_types: number
    avg_amount: number
  }[]
  by_type: CustomsDashboardBreakdownRow[]
  by_bl_top10: CustomsDashboardBreakdownRow[]
  by_bl_avg_top10: CustomsDashboardBreakdownRow[]
  by_vendor_top10: CustomsDashboardBreakdownRow[]
  by_vendor_avg_top10: CustomsDashboardBreakdownRow[]
}

export function useCustomsDashboard() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const q = useQuery<CustomsDashboard, Error>({
    queryKey: ["customs-dashboard", selectedCompanyId],
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!)
      return fetchWithAuth<CustomsDashboard>(`/api/v1/customs/dashboard?${params}`)
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

// 면장 목록 조회
export function useDeclarationList(filters: { bl_id?: string; month?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  return useListQuery<Declaration>(
    ["declarations", selectedCompanyId, filters.bl_id, filters.month],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.bl_id) params.set("bl_id", filters.bl_id)
      return fetchAllPaginated<Declaration>("/api/v1/declarations", params.toString())
    },
    { enabled: !!selectedCompanyId },
  )
}

// 면장 상세 조회
export function useDeclarationDetail(id: string | null) {
  return useDetailQuery<Declaration>(
    ["declaration", id],
    () => fetchWithAuth<Declaration>(`/api/v1/declarations/${id}`),
    { enabled: !!id },
  )
}

// 원가 목록 조회 (지적 2번: /api/v1/cost-details 사용!)
export function useCostDetailList(declarationId: string | null) {
  return useListQuery<DeclarationCost>(
    ["cost-details", declarationId],
    () => fetchWithAuth<DeclarationCost[]>(`/api/v1/cost-details?declaration_id=${declarationId}`),
    { enabled: !!declarationId },
  )
}

// 부대비용 목록 조회
export function useExpenseList(
  filters: {
    bl_id?: string
    month?: string
    expense_type?: string
    start?: string
    end?: string
  } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  return useListQuery<Expense>(
    [
      "expenses",
      selectedCompanyId,
      filters.bl_id,
      filters.month,
      filters.expense_type,
      filters.start,
      filters.end,
    ],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.bl_id) params.set("bl_id", filters.bl_id)
      if (filters.month) params.set("month", filters.month)
      if (filters.expense_type) params.set("expense_type", filters.expense_type)
      if (filters.start) params.set("start", filters.start)
      if (filters.end) params.set("end", filters.end)
      return fetchAllPaginated<Expense>("/api/v1/expenses", params.toString())
    },
    { enabled: !!selectedCompanyId },
  )
}

export function useExpenseSummary(
  filters: {
    bl_id?: string
    month?: string
    expense_type?: string
    start?: string
    end?: string
  } = {},
) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  return useDetailQuery<ExpenseSummary>(
    [
      "expenses-summary",
      selectedCompanyId,
      filters.bl_id,
      filters.month,
      filters.expense_type,
      filters.start,
      filters.end,
    ],
    () => {
      const params = companyParams(selectedCompanyId!)
      if (filters.bl_id) params.set("bl_id", filters.bl_id)
      if (filters.month) params.set("month", filters.month)
      if (filters.expense_type) params.set("expense_type", filters.expense_type)
      if (filters.start) params.set("start", filters.start)
      if (filters.end) params.set("end", filters.end)
      return fetchWithAuth<ExpenseSummary>(`/api/v1/expenses/summary?${params}`)
    },
    { enabled: !!selectedCompanyId },
  )
}
