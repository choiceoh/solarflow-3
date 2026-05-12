// L/C 결제 완료 (status=settled) 드릴다운.

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementLcSettledInsight() {
  const { dashboard, loading } = useLCDashboard({ status: 'settled' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.settled_count ?? dashboard?.totals.count ?? 0

  const byBank: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_bank_top10 ?? []).map((r) => ({
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
      title="L/C 결제 완료"
      subtitle="status=settled L/C 의 추세 · 은행 분해"
      unit="건"
      tone="pos"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="결제 누계"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="L/C 결제"
      breakdowns={[
        { label: '은행 상위 10', rows: byBank, unit: '건' },
      ]}
    />
  )
}
