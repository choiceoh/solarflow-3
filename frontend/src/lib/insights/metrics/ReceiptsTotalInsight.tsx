// 입금 합계 (억) 드릴다운 — receipts 탭 KPI '입금 합계'.
//
// 서버 집계 마이그(C-1 receipts) — useReceiptDashboard 사용.

import { useMemo } from 'react'
import { useReceiptDashboard } from '@/hooks/useReceipts'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function ReceiptsTotalInsight() {
  const { dashboard, loading } = useReceiptDashboard()

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.amount_sum })),
    [dashboard],
  )

  const totalSum = dashboard?.totals.amount_sum ?? 0

  const byCustomer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_customer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byMatchStatus: BreakdownRow[] = useMemo(
    () => (dashboard?.by_match_status ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="입금 합계"
      subtitle="24개월 월별 입금 추이 (단위 억) · 거래처 / 매칭상태별 분해"
      unit="억"
      tone="solar"
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSum)}
      trend={trend}
      trendValueLabel="입금"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '매칭상태', rows: byMatchStatus, unit: '억', formatValue: fmtEok },
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
