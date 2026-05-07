// 평균 비용 (억) 드릴다운 — 건당 평균 + 유형별/B/L별/거래처별 평균.
//
// 서버 집계 (customs_dashboard RPC) — by_*_avg_top10 (count >= 3 필터링) 사용.

import { useMemo } from 'react'
import { useCustomsDashboard } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function CustomsAvgExpenseInsight() {
  const { dashboard, loading } = useCustomsDashboard()
  const overallAvg = dashboard?.totals.avg_amount ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.avg_amount })),
    [dashboard],
  )

  const byType: BreakdownRow[] = useMemo(
    () => [...(dashboard?.by_type ?? [])]
      .sort((a, b) => b.avg_amount - a.avg_amount)
      .map((r) => ({
        key: r.key,
        label: EXPENSE_TYPE_LABEL[r.label as ExpenseType] ?? r.label,
        value: r.avg_amount,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  const byBl: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bl_avg_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.avg_amount,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  const byVendor: BreakdownRow[] = useMemo(
    () => (dashboard?.by_vendor_avg_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.avg_amount,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="평균 부대비용"
      subtitle="건당 평균 (억) · 24개월 월별 평균 + 유형/B/L/거래처별 평균 (3건↑)"
      unit="억"
      tone="ink"
      backTo="/customs"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="전체 평균"
      totalValue={fmtEok(overallAvg)}
      trend={trend}
      trendValueLabel="평균 비용"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '비용 유형 평균', rows: byType, unit: '억', formatValue: fmtEok },
        { label: 'B/L 평균 상위 10 (3건↑)', rows: byBl, unit: '억', formatValue: fmtEok },
        { label: '거래처 평균 상위 10 (3건↑)', rows: byVendor, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
