// L/C 진행률 (opened / total %) 드릴다운 — 상태별 진행 분포.

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtPct = (n: number) => n.toFixed(1)

export function ProcurementLcProgressInsight() {
  const { dashboard, loading } = useLCDashboard()

  // 진행률 = active_count(opened+docs_received) / total
  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => ({
        month: p.month,
        value: p.count > 0 ? (p.active_count / p.count) * 100 : 0,
      })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0
  const opened = dashboard?.totals.opened_count ?? 0
  const rate = total > 0 ? (opened / total) * 100 : 0

  const byStatus: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_status ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="L/C 진행률"
      subtitle={`opened / total = ${opened.toLocaleString()} / ${total.toLocaleString()} · 상태 분포`}
      unit="%"
      tone="info"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="진행률"
      totalValue={fmtPct(rate)}
      trend={trend}
      trendValueLabel="진행률"
      formatTrend={fmtPct}
      breakdowns={[
        { label: '상태 분포', rows: byStatus, unit: '건' },
      ]}
    />
  )
}
