// B/L 통관중 (건) 드릴다운 — status=customs 면장 확인 필요.
//
// 서버 집계 마이그(C-1 procurement) — useBLDashboard(status_scope=customs).

import { useMemo } from 'react'
import { useBLDashboard } from '@/hooks/useInbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementBlCustomsInsight() {
  const { dashboard, loading } = useBLDashboard({ status_scope: 'customs' })

  const totalCustoms = dashboard?.totals.customs_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.customs_count })),
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

  return (
    <InsightShell
      title="B/L 통관중"
      subtitle="status=customs 면장 확인 필요 — 24개월 추이 + 제조사/항만 분해"
      unit="건"
      tone="warn"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="통관 합계"
      totalValue={totalCustoms.toLocaleString()}
      trend={trend}
      trendValueLabel="통관 진입"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '항만 상위 10', rows: byPort, unit: '건' },
      ]}
    />
  )
}
