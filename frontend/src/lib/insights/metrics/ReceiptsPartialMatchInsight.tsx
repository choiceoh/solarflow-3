// 부분 매칭 (건) 드릴다운 — matched_total > 0 AND remaining > 0.
//
// 서버 집계 마이그(C-1 receipts) — useReceiptDashboard 사용.

import { useMemo } from 'react'
import { useReceiptDashboard } from '@/hooks/useReceipts'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ReceiptsPartialMatchInsight() {
  const { dashboard, loading } = useReceiptDashboard()

  const totalPartial = dashboard?.totals.partial_match_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.partial_count })),
    [dashboard],
  )

  // 거래처 분해 — by_customer_top10 의 partial_match_count 기준 재정렬.
  const byCustomer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_customer_top10 ?? [])
      .filter((r) => r.partial_match_count > 0)
      .map((r) => ({
        key: r.key, label: r.label, value: r.partial_match_count, share: r.share, count: r.count,
      }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  return (
    <InsightShell
      title="부분 매칭"
      subtitle="matched_total > 0 AND remaining > 0 — 추가 확인 필요한 입금 건"
      unit="건"
      tone="info"
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="부분 매칭"
      totalValue={totalPartial.toLocaleString()}
      trend={trend}
      trendValueLabel="부분 매칭 건"
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
      ]}
    />
  )
}
