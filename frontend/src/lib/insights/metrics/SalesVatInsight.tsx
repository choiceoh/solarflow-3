// 매출 부가세 합계 드릴다운.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (n: number) => (n / 100_000_000).toFixed(2)

export function SalesVatInsight() {
  const { dashboard, loading } = useSaleDashboard()

  // trend24 의 sale_amount_sum 에서 부가세분 추정 (× 0.1/1.1).
  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => ({
        month: p.month,
        value: (p.sale_amount_sum * 0.1) / 1.1,
      })),
    [dashboard],
  )
  const total = dashboard?.totals.vat_amount_sum ?? 0

  const byCustomer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_customer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: (r.sale_amount_sum * 0.1) / 1.1,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="매출 부가세"
      subtitle="부가세 합계 (억) · 거래처 분해. trend24 / by_customer 는 sale_amount × 0.1 / 1.1 근사."
      unit="억"
      tone="info"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="VAT 합계"
      totalValue={fmtEok(total)}
      trend={trend}
      trendValueLabel="VAT (월별 ≈ 부가세)"
      formatTrend={fmtEok}
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
