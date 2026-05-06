// L/C 은행 (곳) 드릴다운 — distinct bank 수 + 은행별 LC 건수/금액.
//
// 서버 집계 마이그(C-1 procurement) — useLCDashboard.

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementLcBanksInsight() {
  const { dashboard, loading } = useLCDashboard()

  const totalDistinct = dashboard?.totals.banks_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.distinct_banks })),
    [dashboard],
  )

  const byBankCount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byBankAmount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="L/C 은행"
      subtitle="월별 L/C 개설 distinct 은행 수 추이 + 은행별 건수/금액"
      unit="곳"
      tone="ink"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="누적 은행"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 은행"
      breakdowns={[
        { label: '은행 (건수)', rows: byBankCount, unit: '건' },
        { label: '은행 (금액)', rows: byBankAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
