// L/C 평균 개설액 (USD M) 드릴다운 — 은행별 평균 금액.

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (n: number) => (n / 1_000_000).toFixed(2)

export function ProcurementLcAvgAmountInsight() {
  const { dashboard, loading } = useLCDashboard()

  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => ({
        month: p.month,
        value: p.count > 0 ? p.amount_usd / p.count : 0,
      })),
    [dashboard],
  )

  const total = dashboard?.totals.total_amount_usd ?? 0
  const count = dashboard?.totals.count ?? 0
  const avg = count > 0 ? total / count : 0

  const byBank: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_bank_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count > 0 ? r.amount_usd_sum / r.count : 0,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="L/C 평균 개설액"
      subtitle={`전체 평균 ${fmtUsdM(avg)} M$ · ${count.toLocaleString()}건 기준 · 은행별 평균`}
      unit="M$"
      tone="ink"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="평균 개설액"
      totalValue={fmtUsdM(avg)}
      trend={trend}
      trendValueLabel="평균"
      formatTrend={fmtUsdM}
      breakdowns={[
        { label: '은행별 평균 (상위 10)', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
