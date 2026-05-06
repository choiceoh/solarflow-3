// L/C 연결 (건) 드릴다운 — PO 탭 KPI 'L/C 연결' (= LC 가 개설된 PO 수).
//
// 서버 집계 마이그(C-1 procurement) — useLCDashboard(status_scope=active).

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementLcLinkedInsight() {
  const { dashboard, loading } = useLCDashboard({ status_scope: 'active' })

  const activeCount = dashboard?.totals.active_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.active_count })),
    [dashboard],
  )

  const byBank: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byBankAmount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="L/C 연결"
      subtitle="활성 L/C (cancelled 제외) 24개월 개설 추이 + 은행별 건수/금액"
      unit="건"
      tone="info"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="활성 합계"
      totalValue={activeCount.toLocaleString()}
      trend={trend}
      trendValueLabel="L/C 개설"
      breakdowns={[
        { label: '은행 (건수)', rows: byBank, unit: '건' },
        { label: '은행 (금액 합계)', rows: byBankAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
