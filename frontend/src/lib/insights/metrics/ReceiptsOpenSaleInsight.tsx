// 수금 미완료 매출 (매출채권 잔존) 드릴다운 — sale 측에서 receipt_status=open 으로 본다.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (n: number) => (n / 100_000_000).toFixed(2)

export function ReceiptsOpenSaleInsight() {
  const { dashboard, loading } = useSaleDashboard({ receipt_status: 'open' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0
  const totalAmount = dashboard?.totals.sale_amount_sum ?? 0

  const byCustomer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_customer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.sale_amount_sum,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="수금 미완료 매출"
      subtitle={`잔존 매출 ${total.toLocaleString()}건 · 금액 합계 ${fmtEok(totalAmount)}억 · 거래처별 미수금 추적`}
      unit="건"
      tone="warn"
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="잔존"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="수금 미완료"
      breakdowns={[
        { label: '거래처 상위 10 (잔존 금액)', rows: byCustomer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
