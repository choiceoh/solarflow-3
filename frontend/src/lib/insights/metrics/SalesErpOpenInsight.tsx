// ERP 미마감 (계산서 발행 + 미마감) 드릴다운.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function SalesErpOpenInsight() {
  const { dashboard, loading } = useSaleDashboard({
    invoice_status: 'issued',
    erp_closed: 'false',
  })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0

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
      title="ERP 미마감"
      subtitle="invoice_status=issued + erp_closed=false 매출 · 거래처 분해"
      unit="건"
      tone="warn"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="미마감"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="ERP 미마감"
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
      ]}
    />
  )
}
