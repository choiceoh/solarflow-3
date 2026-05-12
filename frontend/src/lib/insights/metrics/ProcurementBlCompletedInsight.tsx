// B/L 입고 완료 (status=completed) 드릴다운.

import { useMemo } from 'react'
import { useBLDashboard } from '@/hooks/useInbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementBlCompletedInsight() {
  const { dashboard, loading } = useBLDashboard({ status: 'completed' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.completed_count ?? dashboard?.totals.count ?? 0
  const toRows = (
    rows: { key: string; label: string; count: number; share: number }[],
  ): BreakdownRow[] =>
    rows.map((r) => ({ key: r.key, label: r.label, value: r.count, share: r.share, count: r.count }))

  return (
    <InsightShell
      title="B/L 입고 완료"
      subtitle="status=completed B/L · 재고 반영 분 · 입고 구분·제조사·포워더 분해"
      unit="건"
      tone="pos"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="완료 누계"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="완료"
      breakdowns={[
        { label: '입고 구분', rows: toRows(dashboard?.by_inbound_type ?? []), unit: '건' },
        { label: '제조사 상위 10', rows: toRows(dashboard?.by_manufacturer_top10 ?? []), unit: '건' },
        { label: '포워더 상위 10', rows: toRows(dashboard?.by_forwarder_top10 ?? []), unit: '건' },
      ]}
    />
  )
}
