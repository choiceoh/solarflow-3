// 매출 합계 (억) 드릴다운 — sales 탭 KPI '매출 합계'.

import { useMemo } from 'react'
import { useSaleListAll } from '@/hooks/useOutbound'
import type { SaleListItem } from '@/types/outbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)
const saleDate = (s: SaleListItem) => s.tax_invoice_date ?? s.outbound_date ?? s.order_date ?? null
const totalAmount = (s: SaleListItem) => s.total_amount ?? s.sale?.total_amount ?? 0

export function SalesTotalInsight() {
  const { data, loading } = useSaleListAll()

  const trend = useMemo(
    () => trend24(data, saleDate, totalAmount),
    [data],
  )

  const totalSum = data.reduce((sum, s) => sum + totalAmount(s), 0)

  const byCustomer = useMemo(
    () => breakdownBy(
      data,
      (s) => s.customer_id,
      (s) => s.customer_name ?? '미지정',
      totalAmount,
    ).slice(0, 10),
    [data],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      data,
      (s) => s.manufacturer_id ?? null,
      (s) => s.manufacturer_name ?? '미지정',
      totalAmount,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="매출 합계"
      subtitle="24개월 월별 매출 추이 (단위 억) · 거래처/제조사 Top10 분해"
      unit="억"
      tone="solar"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSum)}
      trend={trend}
      trendValueLabel="매출"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
