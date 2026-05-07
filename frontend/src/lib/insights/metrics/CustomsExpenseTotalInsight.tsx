// 부대비용 합계 (억) 드릴다운 — CustomsPage 부대비용 탭 KPI '부대비용'.
//
// 서버 집계 (customs_dashboard RPC) — 4개 Customs insight 모두 한 번에 수신.

import { useMemo } from 'react'
import { useCustomsDashboard } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function CustomsExpenseTotalInsight() {
  const { dashboard, loading } = useCustomsDashboard()
  const totalSum = dashboard?.totals.sum_amount ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.sum_amount })),
    [dashboard],
  )

  const byType: BreakdownRow[] = useMemo(
    () => (dashboard?.by_type ?? []).map((r) => ({
      key: r.key,
      label: EXPENSE_TYPE_LABEL[r.label as ExpenseType] ?? r.label,
      value: r.sum_amount,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  const byBl: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bl_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.sum_amount,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  const byVendor: BreakdownRow[] = useMemo(
    () => (dashboard?.by_vendor_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.sum_amount,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="부대비용"
      subtitle="24개월 월별 부대비용 추이 (단위 억) · 비용 유형/B/L/거래처 분해"
      unit="억"
      tone="solar"
      backTo="/customs"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSum)}
      trend={trend}
      trendValueLabel="부대비용"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '비용 유형', rows: byType, unit: '억', formatValue: fmtEok },
        { label: 'B/L 상위 10', rows: byBl, unit: '억', formatValue: fmtEok },
        { label: '거래처 상위 10', rows: byVendor, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
