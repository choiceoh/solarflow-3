// 실재고 (창고 보유 available_kw) 드릴다운.

import { useMemo } from 'react'
import { useInventory } from '@/hooks/useInventory'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)

const LONG_TERM_LABEL: Record<'normal' | 'warning' | 'critical', string> = {
  normal: '정상',
  warning: '주의',
  critical: '위험',
}

export function InventoryPhysicalInsight() {
  const { data, loading } = useInventory()
  const items = data?.items ?? []

  const totalAvailableKw = items.reduce((sum, it) => sum + it.available_kw, 0)

  const byManufacturer = useMemo(
    () => breakdownBy(
      items.filter((it) => it.available_kw > 0),
      (it) => it.manufacturer_name,
      (it) => it.manufacturer_name,
      (it) => it.available_kw,
    ).slice(0, 10),
    [items],
  )
  const byProduct = useMemo(
    () => breakdownBy(
      items.filter((it) => it.available_kw > 0),
      (it) => it.product_id,
      (it) => `${it.product_name} (${it.manufacturer_name})`,
      (it) => it.available_kw,
    ).slice(0, 10),
    [items],
  )
  const byLongTerm = useMemo(
    () => breakdownBy(
      items.filter((it) => it.available_kw > 0),
      (it) => it.long_term_status,
      (it) => LONG_TERM_LABEL[it.long_term_status] ?? it.long_term_status,
      (it) => it.available_kw,
    ),
    [items],
  )
  // 예약/배정 차감 분해 — physical_kw 대비 reserved_kw / allocated_kw / available_kw.
  const byReserveBreakdown = useMemo(() => {
    const reserved = items.reduce((s, it) => s + it.reserved_kw, 0)
    const allocated = items.reduce((s, it) => s + it.allocated_kw, 0)
    const physical = items.reduce((s, it) => s + it.physical_kw, 0)
    const available = physical - reserved - allocated
    const total = physical
    return [
      { key: 'available', label: '가용 (예약 차감 후)', value: Math.max(0, available), share: total > 0 ? Math.max(0, available) / total : 0, count: 0 },
      { key: 'reserved', label: '예약', value: reserved, share: total > 0 ? reserved / total : 0, count: 0 },
      { key: 'allocated', label: '배정', value: allocated, share: total > 0 ? allocated / total : 0, count: 0 },
    ]
  }, [items])

  return (
    <InsightShell
      title="실재고"
      subtitle="창고 보유 가용재고 (예약/배정 차감 후, MW) · 제조사/제품/장기재고 분해"
      unit="MW"
      tone="ink"
      backTo="/inventory?tab=physical"
      backLabel="실재고로 돌아가기"
      loading={loading}
      totalLabel="실재고 가용"
      totalValue={fmtMW(totalAvailableKw)}
      trend={[]}
      trendValueLabel="실재고"
      breakdowns={[
        { label: '재고 구성 (실재고 전체)', rows: byReserveBreakdown, unit: 'MW', formatValue: fmtMW },
        { label: '장기재고 상태', rows: byLongTerm, unit: 'MW', formatValue: fmtMW },
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
