// 평균 단가 (원/Wp) 드릴다운 — 월별 평균 + 거래처/제조사/관리구분 평균.
//
// 서버 집계 마이그(C-1 orders) — by_*_top10 은 priced ≥ 3 일 때만 avg_unit_price_wp 채움.

import { useMemo } from 'react'
import { useOrderDashboard } from '@/hooks/useOrders'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmt = (v: number) => v.toFixed(1)

export function OrdersUnitPriceInsight() {
  const { dashboard, loading } = useOrderDashboard()

  const overallAvg = dashboard?.totals.avg_unit_price_wp ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.avg_unit_price_wp })),
    [dashboard],
  )

  const byCustomer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_customer_top10 ?? [])
      .filter((r) => r.avg_unit_price_wp > 0)
      .map((r) => ({ key: r.key, label: r.label, value: r.avg_unit_price_wp, share: r.share, count: r.count }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  const byManufacturer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_manufacturer_top10 ?? [])
      .filter((r) => r.avg_unit_price_wp > 0)
      .map((r) => ({ key: r.key, label: r.label, value: r.avg_unit_price_wp, share: r.share, count: r.count }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  const byCategory: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_category ?? [])
      .filter((r) => r.avg_unit_price_wp > 0)
      .map((r) => ({ key: r.key, label: r.label, value: r.avg_unit_price_wp, share: r.share, count: r.count }))
    return [...rows].sort((a, b) => b.value - a.value)
  }, [dashboard])

  return (
    <InsightShell
      title="평균 단가"
      subtitle="원/Wp · 24개월 월별 평균 추이 + 거래처/제조사/관리구분 평균 (3건 이상)"
      unit="원/Wp"
      tone="pos"
      backTo="/orders"
      backLabel="수주 / 수금으로 돌아가기"
      loading={loading}
      totalLabel="전체 평균"
      totalValue={fmt(overallAvg)}
      trend={trend}
      trendValueLabel="평균 단가"
      formatTrend={fmt}
      breakdowns={[
        { label: '관리구분', rows: byCategory, unit: '원/Wp', formatValue: fmt },
        { label: '거래처 상위 10', rows: byCustomer, unit: '원/Wp', formatValue: fmt },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '원/Wp', formatValue: fmt },
      ]}
    />
  )
}
