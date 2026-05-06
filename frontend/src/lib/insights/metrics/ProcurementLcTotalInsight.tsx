// L/C 전체 (건) 드릴다운 — 모든 L/C (status 무관). 상태별 + 은행별 분해.
//
// 서버 집계 마이그(C-1 procurement) — useLCDashboard.

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementLcTotalInsight() {
  const { dashboard, loading } = useLCDashboard()

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
  const byBank: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="L/C 전체"
      subtitle="status 무관 모든 L/C — 24개월 개설 추이 + 상태/은행 분해"
      unit="건"
      tone="solar"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={totalCount.toLocaleString()}
      trend={trend}
      trendValueLabel="L/C 개설"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '은행 상위 10', rows: byBank, unit: '건' },
      ]}
    />
  )
}
