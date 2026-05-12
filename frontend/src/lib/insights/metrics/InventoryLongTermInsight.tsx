// 장기재고 품목 드릴다운 — long_term_status 가 warning(180일+) / critical(365일+) 인
// SKU 를 상태·제조사·제품 별로 본다.

import { useMemo } from 'react'
import { useInventory } from '@/hooks/useInventory'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)

const LONG_TERM_LABEL: Record<'normal' | 'warning' | 'critical', string> = {
  normal: '정상',
  warning: '주의 (180일+)',
  critical: '위험 (365일+)',
}

export function InventoryLongTermInsight() {
  const { data, loading } = useInventory()
  const items = (data?.items ?? []).filter(
    (it) =>
      (it.long_term_status === 'warning' || it.long_term_status === 'critical') &&
      it.available_kw > 0,
  )

  const totalAvailKw = items.reduce((sum, it) => sum + it.available_kw, 0)

  const byStatus = useMemo(
    () =>
      breakdownBy(
        items,
        (it) => it.long_term_status,
        (it) => LONG_TERM_LABEL[it.long_term_status] ?? it.long_term_status,
        (it) => it.available_kw,
      ),
    [items],
  )
  const byManufacturer = useMemo(
    () =>
      breakdownBy(
        items,
        (it) => it.manufacturer_name,
        (it) => it.manufacturer_name,
        (it) => it.available_kw,
      ).slice(0, 10),
    [items],
  )
  const byProduct = useMemo(
    () =>
      breakdownBy(
        items,
        (it) => it.product_id,
        (it) => `${it.product_name} (${it.manufacturer_name})`,
        (it) => it.available_kw,
      ).slice(0, 10),
    [items],
  )

  return (
    <InsightShell
      title="장기재고 품목"
      subtitle="180일+ 보유 SKU 의 실재고 available_kw (MW) · 상태/제조사/제품 분해"
      unit="MW"
      tone="warn"
      backTo="/inventory"
      backLabel="재고로 돌아가기"
      loading={loading}
      totalLabel="장기재고 합계"
      totalValue={fmtMW(totalAvailKw)}
      trend={[]}
      trendValueLabel="장기재고"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: 'MW', formatValue: fmtMW },
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
