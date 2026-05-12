// 입금 건수 (receipts count) 드릴다운.

import { useMemo } from 'react'
import { useReceiptDashboard } from '@/hooks/useReceipts'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ReceiptsCountInsight() {
  const { dashboard, loading } = useReceiptDashboard()

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
  const byMatchStatus: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_match_status ?? []).map((r) => ({
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
      title="입금 건수"
      subtitle="입금 건수의 월별 추세 · 매칭 상태/거래처 분해"
      unit="건"
      tone="ink"
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="입금"
      breakdowns={[
        { label: '매칭 상태', rows: byMatchStatus, unit: '건' },
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
      ]}
    />
  )
}
