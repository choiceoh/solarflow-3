// 계산서 미발행 (건) 드릴다운 — tax_invoice_date 가 없는 매출.

import { useMemo } from 'react'
import { useSaleListAll } from '@/hooks/useOutbound'
import type { SaleListItem } from '@/types/outbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

// 미발행은 출고일자 기준 (발행일이 없으니).
const outboundDate = (s: SaleListItem) => s.outbound_date ?? s.order_date ?? null

export function SalesInvoicePendingInsight() {
  const { data, loading } = useSaleListAll()

  const pending = useMemo(
    () => data.filter((s) => !(s.tax_invoice_date ?? s.sale?.tax_invoice_date)),
    [data],
  )

  const trend = useMemo(
    () => trend24(pending, outboundDate),
    [pending],
  )

  const byCustomer = useMemo(
    () => breakdownBy(
      pending,
      (s) => s.customer_id,
      (s) => s.customer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [pending],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      pending,
      (s) => s.manufacturer_id ?? null,
      (s) => s.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [pending],
  )

  return (
    <InsightShell
      title="계산서 미발행"
      subtitle="tax_invoice_date 가 비어있는 매출 — 출고월 기준 24개월 추이"
      unit="건"
      tone={pending.length > 0 ? 'warn' : 'pos'}
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="미발행 합계"
      totalValue={pending.length.toLocaleString()}
      trend={trend}
      trendValueLabel="미발행 건수"
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
