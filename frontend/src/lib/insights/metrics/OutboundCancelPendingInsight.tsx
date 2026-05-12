// 출고 취소 대기 (status=cancel_pending) 드릴다운 — 승인 대기 출고의 분해.

import { useMemo } from 'react'
import { useOutboundDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OutboundCancelPendingInsight() {
  const { dashboard, loading } = useOutboundDashboard({ status: 'cancel_pending', period: 'lifetime' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0

  const toRows = (rows: { key: string; label: string; count: number; share: number }[]): BreakdownRow[] =>
    rows.map((r) => ({ key: r.key, label: r.label, value: r.count, share: r.share, count: r.count }))

  return (
    <InsightShell
      title="취소 대기"
      subtitle="status=cancel_pending 출고 · 승인 결정이 필요한 건들"
      unit="건"
      tone="warn"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="대기"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="취소 대기"
      breakdowns={[
        { label: '용도', rows: toRows(dashboard?.by_usage ?? []), unit: '건' },
        { label: '거래처 상위 10', rows: toRows(dashboard?.by_customer_top10 ?? []), unit: '건' },
        { label: '제조사 상위 10', rows: toRows(dashboard?.by_manufacturer_top10 ?? []), unit: '건' },
      ]}
    />
  )
}
