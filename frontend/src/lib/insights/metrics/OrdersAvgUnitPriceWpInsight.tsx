// 전체 평단(필터 기준 avg_unit_price_wp) 드릴다운 — 거래처/제조사 평균 단가 분해.
//
// 월별 추이는 매출 발행일(sales.tax_invoice_date) 기준 — orders.order_date 는 ERP 도입 후
// 사후 등록된 행이 많아 시계열이 왜곡된다 (db-connectivity-report.md § 6.11 참조).
// 헤더 평균/breakdowns 는 수주 데이터(useOrderDashboard) 그대로.

import { useMemo } from 'react'
import { useOrderDashboard } from '@/hooks/useOrders'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtFixed1 = (n: number) => n.toFixed(1)

export function OrdersAvgUnitPriceWpInsight() {
  const { dashboard, loading } = useOrderDashboard()
  const { dashboard: saleDashboard, loading: saleLoading } = useSaleDashboard()

  const trend: TrendPoint[] = useMemo(
    () => (saleDashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.avg_unit_price_wp })),
    [saleDashboard],
  )
  const overallAvg = dashboard?.totals.avg_unit_price_wp ?? 0

  const toAvgRows = (
    rows: { key: string; label: string; avg_unit_price_wp: number; count: number; share: number }[],
  ): BreakdownRow[] =>
    rows
      .filter((r) => r.avg_unit_price_wp > 0)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.avg_unit_price_wp,
        share: r.share,
        count: r.count,
      }))

  return (
    <InsightShell
      title="전체 평단"
      subtitle="필터 기준 모든 수주의 가중 평균 단가 (원/Wp) · 월별 추이는 매출 발행일 기준 · 거래처·제조사·관리구분 평균 분해"
      unit="원/Wp"
      tone="ink"
      backTo="/orders"
      backLabel="수주 관리로 돌아가기"
      loading={loading || saleLoading}
      totalLabel="평균"
      totalValue={fmtFixed1(overallAvg)}
      trend={trend}
      trendValueLabel="평균 단가"
      formatTrend={fmtFixed1}
      breakdowns={[
        { label: '거래처 평균 (상위 10)', rows: toAvgRows(dashboard?.by_customer_top10 ?? []), unit: '원/Wp', formatValue: fmtFixed1 },
        { label: '제조사 평균 (상위 10)', rows: toAvgRows(dashboard?.by_manufacturer_top10 ?? []), unit: '원/Wp', formatValue: fmtFixed1 },
        { label: '관리 구분 평균', rows: toAvgRows(dashboard?.by_category ?? []), unit: '원/Wp', formatValue: fmtFixed1 },
      ]}
    />
  )
}
