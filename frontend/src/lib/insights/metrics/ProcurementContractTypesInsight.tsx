// 계약 유형 (종) 드릴다운 — distinct contract_type 수 + 유형별 PO/MW 분포.
//
// 서버 집계 마이그(C-1 procurement) — usePODashboard 사용.

import { useMemo } from 'react'
import { usePODashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementContractTypesInsight() {
  const { dashboard, loading } = usePODashboard()

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.distinct_contract_types })),
    [dashboard],
  )
  const totalDistinct = dashboard?.totals.contract_types_count ?? 0

  const byTypeCount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_contract_type ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byTypeMw: BreakdownRow[] = useMemo(
    () => (dashboard?.by_contract_type ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.total_mw, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="계약 유형"
      subtitle="distinct contract_type 추이 + 유형별 PO 건수/MW (spot/frame/annual 등)"
      unit="종"
      tone="pos"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="누적 유형"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 유형"
      breakdowns={[
        { label: '유형별 PO 건수', rows: byTypeCount, unit: '건' },
        { label: '유형별 MW', rows: byTypeMw, unit: 'MW', formatValue: (v) => v.toFixed(1) },
      ]}
    />
  )
}
