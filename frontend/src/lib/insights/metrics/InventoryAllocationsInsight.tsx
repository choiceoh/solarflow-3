// 예약 차감 (allocations) 드릴다운 — pending + hold 의 capacity 분해.
// allocations 는 page-local fetch 라 이 컴포넌트도 직접 fetch.

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchWithAuth } from '@/lib/api'
import type { InventoryAllocation } from '@/components/inventory/AllocationForm'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)

const PURPOSE_LABEL: Record<InventoryAllocation['purpose'], string> = {
  sale: '상품판매',
  construction: '공사사용',
  construction_own: '공사 (자체)',
  construction_epc: '공사 (EPC)',
  other: '기타',
}

const STATUS_LABEL: Record<'pending' | 'hold', string> = {
  pending: '예약 (pending)',
  hold: '보류 (hold)',
}

const capacityOf = (a: InventoryAllocation) => {
  if (a.capacity_kw != null) return a.capacity_kw
  const wp = a.spec_wp ?? 0
  return wp > 0 ? a.quantity * wp / 1000 : 0
}

export function InventoryAllocationsInsight() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedCompanyId) return
    let cancelled = false
    setLoading(true)
    const companyParam = selectedCompanyId === 'all' ? '' : `&company_id=${selectedCompanyId}`
    Promise.all([
      fetchWithAuth<InventoryAllocation[]>(`/api/v1/inventory/allocations?status=pending${companyParam}`),
      fetchWithAuth<InventoryAllocation[]>(`/api/v1/inventory/allocations?status=hold${companyParam}`),
    ])
      .then(([pending, hold]) => {
        if (!cancelled) setAllocations([...pending, ...hold])
      })
      .catch(() => { if (!cancelled) setAllocations([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedCompanyId])

  const totalKw = allocations.reduce((sum, a) => sum + capacityOf(a), 0)

  const byStatus = useMemo(
    () => breakdownBy(
      allocations,
      (a) => a.status,
      (a) => STATUS_LABEL[a.status as 'pending' | 'hold'] ?? a.status,
      capacityOf,
    ),
    [allocations],
  )
  const byPurpose = useMemo(
    () => breakdownBy(
      allocations,
      (a) => a.purpose,
      (a) => PURPOSE_LABEL[a.purpose] ?? a.purpose,
      capacityOf,
    ),
    [allocations],
  )
  const byCustomer = useMemo(
    () => breakdownBy(
      allocations,
      (a) => a.customer_name ?? null,
      (a) => a.customer_name ?? '미지정',
      capacityOf,
    ).slice(0, 10),
    [allocations],
  )
  const byProduct = useMemo(
    () => breakdownBy(
      allocations,
      (a) => a.product_id,
      (a) => a.product_name ?? a.product_code ?? '미지정',
      capacityOf,
    ).slice(0, 10),
    [allocations],
  )

  return (
    <InsightShell
      title="예약 차감"
      subtitle="pending + hold allocations 의 capacity (MW) · 상태/용도/거래처/제품 분해"
      unit="MW"
      tone="warn"
      backTo="/inventory"
      backLabel="재고로 돌아가기"
      loading={loading}
      totalLabel="현재 예약·보류"
      totalValue={fmtMW(totalKw)}
      trend={[]}
      trendValueLabel="예약 차감"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: 'MW', formatValue: fmtMW },
        { label: '용도', rows: byPurpose, unit: 'MW', formatValue: fmtMW },
        { label: '거래처 상위 10', rows: byCustomer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
