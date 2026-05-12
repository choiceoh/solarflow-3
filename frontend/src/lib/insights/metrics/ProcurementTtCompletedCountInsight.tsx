// T/T 완료 건수 드릴다운.

import { useMemo } from 'react'
import { useTTDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementTtCompletedCountInsight() {
  const { dashboard, loading } = useTTDashboard({ status: 'completed' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.completed_count })),
    [dashboard],
  )
  const total = dashboard?.totals.completed_count ?? dashboard?.totals.count ?? 0
  const toRows = (
    rows: { key: string; label: string; count: number; share: number }[],
  ): BreakdownRow[] =>
    rows.map((r) => ({ key: r.key, label: r.label, value: r.count, share: r.share, count: r.count }))

  return (
    <InsightShell
      title="T/T 완료 건수"
      subtitle="송금 완료 T/T · 제조사·은행·목적 분해"
      unit="건"
      tone="pos"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="완료 누계"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="완료"
      breakdowns={[
        { label: '제조사 상위 10', rows: toRows(dashboard?.by_manufacturer_top10 ?? []), unit: '건' },
        { label: '은행 상위 10', rows: toRows(dashboard?.by_bank_top10 ?? []), unit: '건' },
        { label: '목적 상위 10', rows: toRows(dashboard?.by_purpose_top10 ?? []), unit: '건' },
      ]}
    />
  )
}
