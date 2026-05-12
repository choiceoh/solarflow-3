// B/L 입고 예정 (status=scheduled) 드릴다운.

import { useMemo } from 'react'
import { useBLDashboard } from '@/hooks/useInbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementBlScheduledInsight() {
  const { dashboard, loading } = useBLDashboard({ status: 'scheduled' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0
  const toRows = (
    rows: { key: string; label: string; count: number; share: number }[],
  ): BreakdownRow[] =>
    rows.map((r) => ({ key: r.key, label: r.label, value: r.count, share: r.share, count: r.count }))

  return (
    <InsightShell
      title="B/L 입고 예정"
      subtitle="status=scheduled B/L · 입고 구분·제조사·항구 분해 (ETD 등록 전 포함)"
      unit="건"
      tone="ink"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="예정"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="예정"
      breakdowns={[
        { label: '입고 구분', rows: toRows(dashboard?.by_inbound_type ?? []), unit: '건' },
        { label: '제조사 상위 10', rows: toRows(dashboard?.by_manufacturer_top10 ?? []), unit: '건' },
        { label: '항구 상위 10', rows: toRows(dashboard?.by_port_top10 ?? []), unit: '건' },
      ]}
    />
  )
}
