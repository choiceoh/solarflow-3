// 미정산 (억) 드릴다운 — sum(receipt.remaining).
//
// 서버 집계 마이그(C-1 receipts) — useReceiptDashboard 사용.

import { useMemo } from 'react'
import { useReceiptDashboard } from '@/hooks/useReceipts'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function ReceiptsRemainingInsight() {
  const { dashboard, loading } = useReceiptDashboard()

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.remaining_sum })),
    [dashboard],
  )

  const totalRemaining = dashboard?.totals.remaining_sum ?? 0

  // 미정산 분해 — by_customer_top10 의 remaining_sum 사용 (positive 만 표시).
  const byCustomer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_customer_top10 ?? [])
      .filter((r) => r.remaining_sum > 0)
      .map((r) => ({
        key: r.key, label: r.label, value: r.remaining_sum, share: r.share, count: r.count,
      }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  return (
    <InsightShell
      title="미정산"
      subtitle="receipt.remaining 합계 · 24개월 월별 미정산 발생 추이 + 거래처 분해"
      unit="억"
      tone={totalRemaining > 0 ? 'warn' : 'pos'}
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="현재 미정산"
      totalValue={fmtEok(totalRemaining)}
      trend={trend}
      trendValueLabel="미정산 발생"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
