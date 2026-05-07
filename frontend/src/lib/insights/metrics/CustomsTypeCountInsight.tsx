// 비용 유형 (종) 드릴다운 — distinct expense_type 추이 + 유형별 건수/합계.
//
// 서버 집계 (customs_dashboard RPC) — totals.distinct_type_count + trend24.distinct_types.

import { useMemo } from 'react'
import { useCustomsDashboard } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsTypeCountInsight() {
  const { dashboard, loading } = useCustomsDashboard()
  const totalDistinct = dashboard?.totals.distinct_type_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.distinct_types })),
    [dashboard],
  )

  const byTypeAmount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_type ?? []).map((r) => ({
      key: r.key,
      label: EXPENSE_TYPE_LABEL[r.label as ExpenseType] ?? r.label,
      value: r.sum_amount,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  const byTypeCount: BreakdownRow[] = useMemo(
    () => [...(dashboard?.by_type ?? [])]
      .sort((a, b) => b.count - a.count)
      .map((r) => ({
        key: r.key,
        label: EXPENSE_TYPE_LABEL[r.label as ExpenseType] ?? r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="비용 유형"
      subtitle="월별 distinct 비용 유형 추이 + 유형별 합계 / 건수"
      unit="종"
      tone="warn"
      backTo="/customs"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="누적 유형"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 유형"
      breakdowns={[
        { label: '비용 유형 (합계)', rows: byTypeAmount, unit: '억', formatValue: fmtEok },
        { label: '비용 유형 (건수)', rows: byTypeCount, unit: '건' },
      ]}
    />
  )
}
