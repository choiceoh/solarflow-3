// 개설 금액 (M$) 드릴다운 — L/C amount_usd 합계.
//
// 서버 집계 마이그(C-1 procurement) — useLCDashboard.

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function ProcurementLcAmountInsight() {
  const { dashboard, loading } = useLCDashboard()

  const totalAmount = dashboard?.totals.total_amount_usd ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.amount_usd })),
    [dashboard],
  )

  const byStatus: BreakdownRow[] = useMemo(
    () => (dashboard?.by_status ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byBank: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="L/C 개설 금액"
      subtitle="amount_usd 합계 (M$) · 24개월 추이 + 상태/은행 분해"
      unit="M$"
      tone="warn"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtUsdM(totalAmount)}
      trend={trend}
      trendValueLabel="개설 금액"
      formatTrend={fmtUsdMTick}
      breakdowns={[
        { label: '상태', rows: byStatus, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
