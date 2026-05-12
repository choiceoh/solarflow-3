// PO 운송중 비중 (shipping_count / total %) 드릴다운.

import { useMemo } from 'react'
import { usePODashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtPct = (n: number) => n.toFixed(1)

export function ProcurementPoShippingRatioInsight() {
  const { dashboard, loading } = usePODashboard()

  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => ({
        month: p.month,
        value: p.count > 0 ? (p.shipping_count / p.count) * 100 : 0,
      })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0
  const shipping = dashboard?.totals.shipping_count ?? 0
  const ratio = total > 0 ? (shipping / total) * 100 : 0

  const byMfg: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="PO 운송중 비중"
      subtitle={`shipping / total = ${shipping.toLocaleString()} / ${total.toLocaleString()} · 상태 분포`}
      unit="%"
      tone="info"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="운송중 비중"
      totalValue={fmtPct(ratio)}
      trend={trend}
      trendValueLabel="운송중 비중"
      formatTrend={fmtPct}
      breakdowns={[
        {
          label: '상태 분포',
          rows: (dashboard?.by_status ?? []).map((r) => ({
            key: r.key,
            label: r.label,
            value: r.count,
            share: r.share,
            count: r.count,
          })),
          unit: '건',
        },
        { label: '제조사 점유율 (상위 10)', rows: byMfg, unit: '건' },
      ]}
    />
  )
}
