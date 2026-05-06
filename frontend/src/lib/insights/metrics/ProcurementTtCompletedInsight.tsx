// T/T 완료 금액 (M$) 드릴다운 — status=completed amount_usd 합.
//
// 서버 집계 마이그(C-1 procurement) — useTTDashboard(status_scope=completed).

import { useMemo } from 'react'
import { useTTDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function ProcurementTtCompletedInsight() {
  const { dashboard, loading } = useTTDashboard({ status_scope: 'completed' })

  const totalCompleted = dashboard?.totals.completed_amount_usd ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.completed_amount_usd })),
    [dashboard],
  )

  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
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
  const byPurpose: BreakdownRow[] = useMemo(
    () => (dashboard?.by_purpose_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="T/T 완료 금액"
      subtitle="status=completed 송금 금액 (M$) · 24개월 추이 + 제조사/은행/용도 분해"
      unit="M$"
      tone="pos"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtUsdM(totalCompleted)}
      trend={trend}
      trendValueLabel="완료 송금"
      formatTrend={fmtUsdMTick}
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
        { label: '용도 상위 10', rows: byPurpose, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
