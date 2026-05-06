// 매출 평균 단가 (원/Wp) 드릴다운.
//
// 서버 집계 마이그(C-1 sales follow-up) — useSaleDashboard 사용.
// 서버에서 by_*_top10 은 priced ≥ 3 일 때만 avg_unit_price_wp 를 채워준다 (작은 표본 노이즈 제거).

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmt = (v: number) => v.toFixed(1)

export function SalesUnitPriceInsight() {
  const { dashboard, loading } = useSaleDashboard()

  const overallAvg = dashboard?.totals.avg_unit_price_wp ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.avg_unit_price_wp })),
    [dashboard],
  )

  const byCustomer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_customer_top10 ?? [])
      .filter((r) => r.avg_unit_price_wp > 0)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.avg_unit_price_wp,
        share: r.share,
        count: r.count,
      }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  const byManufacturer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_manufacturer_top10 ?? [])
      .filter((r) => r.avg_unit_price_wp > 0)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.avg_unit_price_wp,
        share: r.share,
        count: r.count,
      }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  return (
    <InsightShell
      title="매출 평균 단가"
      subtitle="원/Wp · 24개월 월별 평균 추이 + 거래처/제조사 평균 (3건 이상)"
      unit="원/Wp"
      tone="ink"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="전체 평균"
      totalValue={fmt(overallAvg)}
      trend={trend}
      trendValueLabel="평균 단가"
      formatTrend={fmt}
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '원/Wp', formatValue: fmt },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '원/Wp', formatValue: fmt },
      ]}
    />
  )
}
