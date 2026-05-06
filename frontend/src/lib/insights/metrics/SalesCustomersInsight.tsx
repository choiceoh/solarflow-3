// 매출처 (활성 거래처 수) 드릴다운 — sales 탭 KPI '거래처'.

import { useMemo } from 'react'
import { useSaleListAll } from '@/hooks/useOutbound'
import type { SaleListItem } from '@/types/outbound'
import { breakdownBy, trend24Distinct } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const saleDate = (s: SaleListItem) => s.tax_invoice_date ?? s.outbound_date ?? s.order_date ?? null
const totalAmount = (s: SaleListItem) => s.total_amount ?? s.sale?.total_amount ?? 0

export function SalesCustomersInsight() {
  const { data, loading } = useSaleListAll()

  const trend = useMemo(
    () => trend24Distinct(data, saleDate, (s) => s.customer_id),
    [data],
  )
  const totalDistinct = useMemo(
    () => new Set(data.map((s) => s.customer_id).filter(Boolean)).size,
    [data],
  )

  const byCustomerAmount = useMemo(
    () => breakdownBy(
      data,
      (s) => s.customer_id,
      (s) => s.customer_name ?? '미지정',
      totalAmount,
    ).slice(0, 10),
    [data],
  )
  const byCustomerCount = useMemo(
    () => breakdownBy(
      data,
      (s) => s.customer_id,
      (s) => s.customer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
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
