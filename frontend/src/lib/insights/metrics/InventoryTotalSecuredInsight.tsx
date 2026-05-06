// 가용 (총 secured KW) 드릴다운 — physical + incoming. 스냅샷이라 trend 비움.

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

export function InventoryTotalSecuredInsight() {
  const { data, loading } = useInventory()
  const items = data?.items ?? []

  const totalSecuredKw = items.reduce((sum, it) => sum + it.total_secured_kw, 0)

  const byManufacturer = useMemo(
    () => breakdownBy(
      items.filter((it) => it.total_secured_kw > 0),
      (it) => it.manufacturer_name,
      (it) => it.manufacturer_name,
      (it) => it.total_secured_kw,
    ).slice(0, 10),
    [items],
  )
  const byProduct = useMemo(
    () => breakdownBy(
      items.filter((it) => it.total_secured_kw > 0),
      (it) => it.product_id,
      (it) => `${it.product_name} (${it.manufacturer_name})`,
      (it) => it.total_secured_kw,
    ).slice(0, 10),
    [items],
  )
  const byLongTerm = useMemo(
    () => breakdownBy(
      items.filter((it) => it.total_secured_kw > 0),
      (it) => it.long_term_status,
      (it) => LONG_TERM_LABEL[it.long_term_status] ?? it.long_term_status,
      (it) => it.total_secured_kw,
    ),
    [items],
  )

  return (
    <InsightShell
      title="가용 재고"
      subtitle="실재고 + 미착품 합계 (단위 MW) · 제조사/제품/장기재고 상태 분해"
      unit="MW"
      tone="solar"
      backTo="/inventory"
      backLabel="재고로 돌아가기"
      loading={loading}
      totalLabel="현재 가용"
      totalValue={fmtMW(totalSecuredKw)}
      trend={[]}
      trendValueLabel="가용"
      breakdowns={[
        { label: '장기재고 상태', rows: byLongTerm, unit: 'MW', formatValue: fmtMW },
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
