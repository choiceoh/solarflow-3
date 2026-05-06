// 평균 단가 (원/Wp) 드릴다운 — 월별 평균 + 거래처/제조사/관리구분 평균.

import { useMemo } from 'react'
import { useOrderListAll } from '@/hooks/useOrders'
import { MANAGEMENT_CATEGORY_LABEL } from '@/types/orders'
import type { Order } from '@/types/orders'
import { breakdownAvg, trend24Average } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmt = (v: number) => v.toFixed(1)

const unitPriceWp = (o: Order) =>
  o.unit_price_wp ?? (o.spec_wp ? (o.unit_price_ea ?? 0) / o.spec_wp : 0)

export function OrdersUnitPriceInsight() {
  const { data, loading } = useOrderListAll()

  // 단가 0/없음 행은 평균에서 제외 (비매출 수주 노이즈).
  const priced = useMemo(
    () => data.filter((o) => unitPriceWp(o) > 0),
    [data],
  )

  const trend = useMemo(
    () => trend24Average(priced, (o) => o.order_date, unitPriceWp),
    [priced],
  )
  const overallAvg = priced.length > 0
    ? priced.reduce((sum, o) => sum + unitPriceWp(o), 0) / priced.length
    : 0

  const byCustomer = useMemo(
    () => breakdownAvg(
      priced,
      (o) => o.customer_id,
      (o) => o.customer_name ?? '미지정',
      unitPriceWp,
      3,
    ).slice(0, 10),
    [priced],
  )
  const byManufacturer = useMemo(
    () => breakdownAvg(
      priced,
      (o) => o.manufacturer_name ?? null,
      (o) => o.manufacturer_name ?? '미지정',
      unitPriceWp,
      3,
    ).slice(0, 10),
    [priced],
  )
  const byCategory = useMemo(
    () => breakdownAvg(
      priced,
      (o) => o.management_category,
      (o) => MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category,
      unitPriceWp,
      3,
    ),
    [priced],
  )

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
