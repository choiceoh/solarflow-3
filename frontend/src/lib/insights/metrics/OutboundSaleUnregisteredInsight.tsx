// 매출 미등록 (출고 완료 후 sale 미연결) 드릴다운.
// work_queue=sale_unregistered 필터로 dashboard 결과를 좁힌다.

import { useMemo } from 'react'
import { useOutboundDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OutboundSaleUnregisteredInsight() {
  const { dashboard, loading } = useOutboundDashboard({
    work_queue: 'sale_unregistered',
    period: 'lifetime',
  })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0
  const toRows = (rows: { key: string; label: string; count: number; share: number }[]): BreakdownRow[] =>
    rows.map((r) => ({ key: r.key, label: r.label, value: r.count, share: r.share, count: r.count }))

  return (
    <InsightShell
      title="매출 미등록"
      subtitle="출고 후 sale 미연결 — 매출 작업 큐. 용도·거래처·제조사 분해"
      unit="건"
      tone="warn"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="미등록"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="매출 미등록"
      breakdowns={[
        { label: '용도', rows: toRows(dashboard?.by_usage ?? []), unit: '건' },
        { label: '거래처 상위 10', rows: toRows(dashboard?.by_customer_top10 ?? []), unit: '건' },
        { label: '제조사 상위 10', rows: toRows(dashboard?.by_manufacturer_top10 ?? []), unit: '건' },
      ]}
    />
  )
}
