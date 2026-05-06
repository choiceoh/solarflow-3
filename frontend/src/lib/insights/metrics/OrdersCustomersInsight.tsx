// 거래처 (활성 고객 수) 드릴다운 — orders 탭 KPI '거래처' 의 월별 distinct 추이 + 차원별 분해.
//
// 서버 집계 마이그(C-1 orders) — trend 는 dashboard.trend24[i].distinct_customers, breakdown 은 by_customer/category.

import { useMemo } from 'react'
import { useOrderDashboard } from '@/hooks/useOrders'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OrdersCustomersInsight() {
  const { dashboard, loading } = useOrderDashboard()

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.distinct_customers })),
    [dashboard],
  )
  const totalDistinct = dashboard?.totals.customers_count ?? 0

  const byCustomerCount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_customer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byCategory: BreakdownRow[] = useMemo(
    () => (dashboard?.by_category ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="거래처"
      subtitle="월별 발주한 distinct 거래처 수 추이 + 거래처별 발주 건수 / 관리구분 분해"
      unit="곳"
      tone="info"
      backTo="/orders"
      backLabel="수주 / 수금으로 돌아가기"
      loading={loading}
      totalLabel="누적 거래처"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 거래처"
      breakdowns={[
        { label: '거래처 상위 10 (발주 건)', rows: byCustomerCount, unit: '건' },
        { label: '관리구분 (발주 건)', rows: byCategory, unit: '건' },
      ]}
    />
  )
}
