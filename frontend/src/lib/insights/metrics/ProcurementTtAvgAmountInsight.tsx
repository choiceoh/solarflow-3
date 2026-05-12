// T/T 평균 송금 드릴다운 — total / count 와 차원별 평균.

import { useMemo } from 'react'
import { useTTDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (n: number) => (n / 1_000_000).toFixed(2)

export function ProcurementTtAvgAmountInsight() {
  const { dashboard, loading } = useTTDashboard()

  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => {
        const count = p.completed_count + p.planned_count
        const amount = p.completed_amount_usd + p.planned_amount_usd
        return { month: p.month, value: count > 0 ? amount / count : 0 }
      }),
    [dashboard],
  )

  const totalUsd = dashboard?.totals.total_amount_usd ?? 0
  const totalCount = dashboard?.totals.count ?? 0
  const avg = totalCount > 0 ? totalUsd / totalCount : 0

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
  const byMfg: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
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
      title="T/T 평균 송금"
      subtitle={`전체 평균 ${fmtUsdM(avg)} M$ · ${totalCount.toLocaleString()}건 기준`}
      unit="M$"
      tone="ink"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="평균/건"
      totalValue={fmtUsdM(avg)}
      trend={trend}
      trendValueLabel="평균 송금"
      formatTrend={fmtUsdM}
      breakdowns={[
        { label: '은행 평균 (상위 10)', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
        { label: '제조사 평균 (상위 10)', rows: byMfg, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
