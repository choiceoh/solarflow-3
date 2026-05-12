// 판매 예약 (sale/other 목적 + pending allocations) 드릴다운.
// 출고 직전의 예약된 capacity 를 거래처/제품/원천(실재고·미착) 별로 본다.

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchWithAuth } from '@/lib/api'
import type { InventoryAllocation } from '@/components/inventory/AllocationForm'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)

const SOURCE_LABEL: Record<'stock' | 'incoming', string> = {
  stock: '실재고',
  incoming: '미착품',
}

const capacityOf = (a: InventoryAllocation) => {
  if (a.capacity_kw != null) return a.capacity_kw
  const wp = a.spec_wp ?? 0
  return wp > 0 ? (a.quantity * wp) / 1000 : 0
}

export function InventorySalePendingInsight() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedCompanyId) return
    let cancelled = false
    setLoading(true)
    const companyParam = selectedCompanyId === 'all' ? '' : `&company_id=${selectedCompanyId}`
    fetchWithAuth<InventoryAllocation[]>(
      `/api/v1/inventory/allocations?status=pending${companyParam}`,
    )
      .then((rows) => {
        if (cancelled) return
        setAllocations(rows.filter((a) => a.purpose === 'sale' || a.purpose === 'other'))
      })
      .catch(() => {
        if (!cancelled) setAllocations([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCompanyId])

  const totalKw = allocations.reduce((sum, a) => sum + capacityOf(a), 0)

  const bySource = useMemo(
    () =>
      breakdownBy(
        allocations,
        (a) => a.source_type,
        (a) => SOURCE_LABEL[a.source_type] ?? a.source_type,
        capacityOf,
      ),
    [allocations],
  )
  const byCustomer = useMemo(
    () =>
      breakdownBy(
        allocations,
        (a) => a.customer_name ?? null,
        (a) => a.customer_name ?? '미지정',
        capacityOf,
      ).slice(0, 10),
    [allocations],
  )
  const byProduct = useMemo(
    () =>
      breakdownBy(
        allocations,
        (a) => a.product_id,
        (a) => a.product_name ?? a.product_code ?? '미지정',
        capacityOf,
      ).slice(0, 10),
    [allocations],
  )

  return (
    <InsightShell
      title="판매 예약"
      subtitle="purpose=sale/other 의 pending allocations capacity (MW) · 원천/거래처/제품 분해"
      unit="MW"
      tone="info"
      backTo="/inventory"
      backLabel="재고로 돌아가기"
      loading={loading}
      totalLabel="예약 중"
      totalValue={fmtMW(totalKw)}
      trend={[]}
      trendValueLabel="판매 예약"
      breakdowns={[
        { label: '원천', rows: bySource, unit: 'MW', formatValue: fmtMW },
        { label: '거래처 상위 10', rows: byCustomer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
