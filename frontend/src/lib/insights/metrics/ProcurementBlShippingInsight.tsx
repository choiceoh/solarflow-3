// B/L 선적/입항 (건) 드릴다운 — status=shipping|arrived 해상 운송 구간.
//
// 서버 집계 마이그(C-1 procurement) — useBLDashboard(status_scope=shipping).

import { useMemo } from 'react'
import { useBLDashboard } from '@/hooks/useInbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementBlShippingInsight() {
  const { dashboard, loading } = useBLDashboard({ status_scope: 'shipping' })

  const totalShipping = dashboard?.totals.shipping_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.shipping_count })),
    [dashboard],
  )

  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byPort: BreakdownRow[] = useMemo(
    () => (dashboard?.by_port_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byForwarder: BreakdownRow[] = useMemo(
    () => (dashboard?.by_forwarder_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="B/L 선적/입항"
      subtitle="status=shipping|arrived 해상 운송 구간 — 24개월 추이 + 제조사/항만/포워더 분해"
      unit="건"
      tone="info"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="진행 합계"
      totalValue={totalShipping.toLocaleString()}
      trend={trend}
      trendValueLabel="선적/입항"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '항만 상위 10', rows: byPort, unit: '건' },
        { label: '포워더 상위 10', rows: byForwarder, unit: '건' },
      ]}
    />
  )
}
