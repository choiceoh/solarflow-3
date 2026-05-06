// 매출 평균 단가 (원/Wp) 드릴다운.

import { useMemo } from 'react'
import { useSaleListAll } from '@/hooks/useOutbound'
import type { SaleListItem } from '@/types/outbound'
import { breakdownAvg, trend24Average } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmt = (v: number) => v.toFixed(1)
const saleDate = (s: SaleListItem) => s.tax_invoice_date ?? s.outbound_date ?? s.order_date ?? null
const unitPriceWp = (s: SaleListItem) =>
  s.unit_price_wp ?? (s.spec_wp ? (s.unit_price_ea ?? 0) / s.spec_wp : 0)

export function SalesUnitPriceInsight() {
  const { data, loading } = useSaleListAll()

  const priced = useMemo(
    () => data.filter((s) => unitPriceWp(s) > 0),
    [data],
  )

  const trend = useMemo(
    () => trend24Average(priced, saleDate, unitPriceWp),
    [priced],
  )
  const overallAvg = priced.length > 0
    ? priced.reduce((sum, s) => sum + unitPriceWp(s), 0) / priced.length
    : 0

  const byCustomer = useMemo(
    () => breakdownAvg(
      priced,
      (s) => s.customer_id,
      (s) => s.customer_name ?? '미지정',
      unitPriceWp,
      3,
    ).slice(0, 10),
    [priced],
  )
  const byManufacturer = useMemo(
    () => breakdownAvg(
      priced,
      (s) => s.manufacturer_id ?? null,
      (s) => s.manufacturer_name ?? '미지정',
      unitPriceWp,
      3,
    ).slice(0, 10),
    [priced],
  )

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
