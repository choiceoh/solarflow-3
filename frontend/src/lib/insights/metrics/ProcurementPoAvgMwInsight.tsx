// PO 평균 용량 (MW) 드릴다운.

import { useMemo } from 'react'
import { usePODashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtMw = (n: number) => n.toFixed(2)

export function ProcurementPoAvgMwInsight() {
  const { dashboard, loading } = usePODashboard()

  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => ({
        month: p.month,
        value: p.count > 0 ? p.total_mw / p.count : 0,
      })),
    [dashboard],
  )

  const totalMw = dashboard?.totals.total_mw ?? 0
  const count = dashboard?.totals.count ?? 0
  const avg = count > 0 ? totalMw / count : 0

  const byMfg: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count > 0 ? r.total_mw / r.count : 0,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )
  const byContractType: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_contract_type ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count > 0 ? r.total_mw / r.count : 0,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="PO 평균 용량"
      subtitle={`전체 평균 ${fmtMw(avg)} MW · ${count.toLocaleString()}건 기준 · 제조사·계약유형 평균`}
      unit="MW"
      tone="ink"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="평균/PO"
      totalValue={fmtMw(avg)}
      trend={trend}
      trendValueLabel="평균 용량"
      formatTrend={fmtMw}
      breakdowns={[
        { label: '제조사 평균 (상위 10)', rows: byMfg, unit: 'MW', formatValue: fmtMw },
        { label: '계약 유형 평균', rows: byContractType, unit: 'MW', formatValue: fmtMw },
      ]}
    />
  )
}
