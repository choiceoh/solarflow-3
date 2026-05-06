// T/T 대기 (건) 드릴다운 — status=planned 송금 예정.
//
// 서버 집계 마이그(C-1 procurement) — useTTDashboard(status_scope=planned).

import { useMemo } from 'react'
import { useTTDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementTtPlannedInsight() {
  const { dashboard, loading } = useTTDashboard({ status_scope: 'planned' })

  const plannedCount = dashboard?.totals.planned_count ?? 0
  const plannedAmount = dashboard?.totals.planned_amount_usd ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.planned_count })),
    [dashboard],
  )

  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byManufacturerAmount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="T/T 대기"
      subtitle={`status=planned 예정 송금 — 24개월 추이 + 제조사 분해 (예정 금액 ${fmtUsdM(plannedAmount)} M$)`}
      unit="건"
      tone="warn"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="대기 합계"
      totalValue={plannedCount.toLocaleString()}
      trend={trend}
      trendValueLabel="예정 송금"
      breakdowns={[
        { label: '제조사 (건수)', rows: byManufacturer, unit: '건' },
        { label: '제조사 (예정 금액)', rows: byManufacturerAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
