// 매출처 (활성 거래처 수) 드릴다운 — sales 탭 KPI '거래처'.
//
// 서버 집계 마이그(C-1 sales follow-up) — useSaleDashboard 사용.
// trend 는 dashboard.trend24[i].distinct_customers, breakdown 은 by_customer_top10.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function SalesCustomersInsight() {
  const { dashboard, loading } = useSaleDashboard()

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.distinct_customers })),
    [dashboard],
  )

  const totalDistinct = dashboard?.totals.customers_count ?? 0

  // 같은 by_customer_top10 데이터를 두 차원(매출액 / 건수) 으로 변환.
  const byCustomerAmount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_customer_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.sale_amount_sum,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )
  // 건수 기준 정렬은 서버가 sale_amount_sum 으로 정렬했으니 재정렬.
  const byCustomerCount: BreakdownRow[] = useMemo(
    () => {
      const rows = (dashboard?.by_customer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      }))
      return [...rows].sort((a, b) => b.value - a.value)
    },
    [dashboard],
  )

  return (
    <InsightShell
      title="매출처"
      subtitle="월별 매출이 발생한 distinct 거래처 수 추이 + 거래처별 매출액 / 건수"
      unit="곳"
      tone="info"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="누적 거래처"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 거래처"
      breakdowns={[
        { label: '거래처 매출액 상위 10', rows: byCustomerAmount, unit: '억', formatValue: fmtEok },
        { label: '거래처 건수 상위 10', rows: byCustomerCount, unit: '건' },
      ]}
    />
  )
}
