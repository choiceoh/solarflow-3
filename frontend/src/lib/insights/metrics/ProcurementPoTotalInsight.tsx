// PO 전체 (status 무관) 드릴다운.

import { useMemo } from 'react'
import { usePODashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementPoTotalInsight() {
  const { dashboard, loading } = usePODashboard()

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0
  const toRows = (
    rows: { key: string; label: string; count: number; share: number }[],
  ): BreakdownRow[] =>
    rows.map((r) => ({ key: r.key, label: r.label, value: r.count, share: r.share, count: r.count }))

  return (
    <InsightShell
      title="PO 전체"
      subtitle="status 무관 모든 PO · 상태·계약유형·제조사 분해"
      unit="건"
      tone="ink"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="PO"
      breakdowns={[
        { label: '상태', rows: toRows(dashboard?.by_status ?? []), unit: '건' },
        { label: '계약 유형', rows: toRows(dashboard?.by_contract_type ?? []), unit: '건' },
        { label: '제조사 상위 10', rows: toRows(dashboard?.by_manufacturer_top10 ?? []), unit: '건' },
      ]}
    />
  )
}
