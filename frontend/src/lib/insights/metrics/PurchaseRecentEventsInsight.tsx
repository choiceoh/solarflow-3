// 최근 이벤트 (건) 드릴다운 — PO/PH/LC/BL/TT 발생 이벤트의 월별 + 종류별 분해.
//
// 서버 집계 (purchase_dashboard RPC) — totals.event_count + trend24.event_count + by_kind.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

export function PurchaseRecentEventsInsight() {
  const { dashboard, loading } = usePurchaseDashboard()
  const totalEvents = dashboard?.totals.event_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.event_count })),
    [dashboard],
  )

  const byKind: BreakdownRow[] = useMemo(
    () => (dashboard?.by_kind ?? []).map((r) => ({
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
      title="최근 이벤트"
      subtitle="구매 라이프사이클 전체 이벤트 (PO·변경계약·단가·LC·B/L·T/T) — 24개월 추이 + 종류 분해"
      unit="건"
      tone="ink"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="이벤트 합계"
      totalValue={totalEvents.toLocaleString()}
      trend={trend}
      trendValueLabel="이벤트"
      breakdowns={[
        { label: '이벤트 종류', rows: byKind, unit: '건' },
      ]}
    />
  )
}
