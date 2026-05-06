// B/L 전체 (건) 드릴다운 — 모든 B/L. 상태/제조사/입고유형 분해.
//
// 서버 집계 마이그(C-1 procurement) — useBLDashboard.

import { useMemo } from 'react'
import { useBLDashboard } from '@/hooks/useInbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementBlTotalInsight() {
  const { dashboard, loading } = useBLDashboard()

  const totalCount = dashboard?.totals.count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )

  const byStatus: BreakdownRow[] = useMemo(
    () => (dashboard?.by_status ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byInboundType: BreakdownRow[] = useMemo(
    () => (dashboard?.by_inbound_type ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="B/L 전체"
      subtitle="모든 B/L — 24개월 추이 (actual_arrival/eta/etd 우선순위) + 상태/입고유형/제조사 분해"
      unit="건"
      tone="solar"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={totalCount.toLocaleString()}
      trend={trend}
      trendValueLabel="B/L 등록"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '입고 유형', rows: byInboundType, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
