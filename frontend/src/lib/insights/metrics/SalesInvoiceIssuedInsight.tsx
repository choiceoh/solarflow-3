// 계산서 발행 (invoice_issued) 드릴다운.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function SalesInvoiceIssuedInsight() {
  const { dashboard, loading } = useSaleDashboard({ invoice_status: 'issued' })

  // 발행된 sale 만 필터된 dashboard 의 trend24.count.
  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.invoice_issued_count ?? dashboard?.totals.count ?? 0

  const byCustomer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_customer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="계산서 발행"
      subtitle="invoice_status=issued 매출의 추세 · 거래처 분해"
      unit="건"
      tone="pos"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="발행"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="계산서 발행"
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
      ]}
    />
  )
}
