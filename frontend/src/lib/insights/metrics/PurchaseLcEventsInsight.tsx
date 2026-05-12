// L/C 이벤트 (lc_open + lc_settle) 드릴다운 — purchase dashboard by_kind 의 LC 항목.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const LC_KINDS = new Set(['lc_open', 'lc_settle'])

export function PurchaseLcEventsInsight() {
  const { dashboard, loading } = usePurchaseDashboard()

  const lcRows = useMemo(
    () => (dashboard?.by_kind ?? []).filter((r) => LC_KINDS.has(r.key)),
    [dashboard],
  )
  const total = lcRows.reduce((sum, r) => sum + r.count, 0)

  const byKind: BreakdownRow[] = useMemo(
    () =>
      lcRows.map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [lcRows],
  )

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
      title="L/C 이벤트"
      subtitle="L/C 개설·결제 이벤트 합계 · 종류·제조사 분해 (구매 dashboard 기준)"
      unit="건"
      tone="info"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="L/C 이벤트"
      totalValue={total.toLocaleString()}
      trend={[]}
      trendValueLabel="L/C 이벤트"
      breakdowns={[
        { label: '이벤트 종류', rows: byKind, unit: '건' },
        { label: '제조사 상위 10 (전체 이벤트)', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
