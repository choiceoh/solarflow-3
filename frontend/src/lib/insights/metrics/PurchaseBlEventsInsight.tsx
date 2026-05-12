// B/L 이벤트 드릴다운 — bl_event kind.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

export function PurchaseBlEventsInsight() {
  const { dashboard, loading } = usePurchaseDashboard()

  const blRow = (dashboard?.by_kind ?? []).find((r) => r.key === 'bl_event')
  const total = blRow?.count ?? 0

  const byManufacturer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.total_count,
        share: 0,
        count: r.total_count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="B/L 이벤트"
      subtitle="B/L 선적/입항/통관/완료 이벤트 · 제조사 분해 (구매 dashboard 기준)"
      unit="건"
      tone="info"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="B/L 이벤트"
      totalValue={total.toLocaleString()}
      trend={[]}
      trendValueLabel="B/L"
      breakdowns={[
        { label: '제조사 상위 10 (전체 이벤트)', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
