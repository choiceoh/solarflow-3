// 취소 수주 (status=cancelled) 드릴다운.

import { useMemo } from 'react'
import { useOrderDashboard } from '@/hooks/useOrders'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OrdersCancelledInsight() {
  const { dashboard, loading } = useOrderDashboard({ status: 'cancelled' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.cancelled_count ?? dashboard?.totals.count ?? 0
  const toRows = (
    rows: { key: string; label: string; count: number; share: number }[],
  ): BreakdownRow[] =>
    rows.map((r) => ({ key: r.key, label: r.label, value: r.count, share: r.share, count: r.count }))

  return (
    <InsightShell
      title="취소 수주"
      subtitle="status=cancelled 수주의 추세 · 거래처·제조사·관리구분 분해"
      unit="건"
      tone="ink"
      backTo="/orders"
      backLabel="수주 관리로 돌아가기"
      loading={loading}
      totalLabel="취소 누계"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="취소"
      breakdowns={[
        { label: '관리 구분', rows: toRows(dashboard?.by_category ?? []), unit: '건' },
        { label: '거래처 상위 10', rows: toRows(dashboard?.by_customer_top10 ?? []), unit: '건' },
        { label: '제조사 상위 10', rows: toRows(dashboard?.by_manufacturer_top10 ?? []), unit: '건' },
      ]}
    />
  )
}
