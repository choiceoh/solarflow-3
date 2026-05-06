// T/T PO 연결 (건) 드릴다운 — distinct po_id 수 + PO별 송금 합계.
//
// 서버 집계 마이그(C-1 procurement) — useTTDashboard.

import { useMemo } from 'react'
import { useTTDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementTtPoLinkedInsight() {
  const { dashboard, loading } = useTTDashboard()

  const totalDistinct = dashboard?.totals.po_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.distinct_pos })),
    [dashboard],
  )

  const byPoCount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_po_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byPoAmount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_po_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="T/T PO 연결"
      subtitle="distinct po_id 추이 + PO별 송금 건수/금액 — 계약금 집계 대상"
      unit="건"
      tone="ink"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="누적 PO"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 PO"
      breakdowns={[
        { label: 'PO 송금 건수 상위 10', rows: byPoCount, unit: '건' },
        { label: 'PO 송금 금액 상위 10', rows: byPoAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
