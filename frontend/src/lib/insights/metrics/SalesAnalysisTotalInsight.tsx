// 부가세 포함 매출 (억) 드릴다운 — sale.total_amount. 공급가 대비 부가세 비율 분해.

import { useMemo } from 'react'
import { useSaleListAll } from '@/hooks/useOutbound'
import type { SaleListItem } from '@/types/outbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)
const totalAmount = (s: SaleListItem) => s.total_amount ?? s.sale?.total_amount ?? 0
const vatAmount = (s: SaleListItem) => s.vat_amount ?? s.sale?.vat_amount ?? 0
const saleDate = (s: SaleListItem) => s.tax_invoice_date ?? s.outbound_date ?? s.order_date ?? null

export function SalesAnalysisTotalInsight() {
  const { data, loading } = useSaleListAll()

  const trend = useMemo(
    () => trend24(data, saleDate, totalAmount),
    [data],
  )
  const totalSum = data.reduce((sum, s) => sum + totalAmount(s), 0)
  const vatSum = data.reduce((sum, s) => sum + vatAmount(s), 0)

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
      title="부가세 포함 매출"
      subtitle={`sale.total_amount 기준 24개월 추이 (단위 억) · VAT 합 ${fmtEok(vatSum)}억 · 거래처/제조사 Top10`}
      unit="억"
      tone="ink"
      backTo="/sales-analysis"
      backLabel="매출 분석으로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSum)}
      trend={trend}
      trendValueLabel="부가세 포함"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
