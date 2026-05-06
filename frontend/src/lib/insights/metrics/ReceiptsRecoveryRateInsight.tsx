// 회수율 (%) 드릴다운 — (입금 - 미정산) / 입금 * 100 = matched / total.
//
// 서버 집계 마이그(C-1 receipts) — by_customer_top10 은 표본 ≥ 3 일 때만 recovery_rate 0 아님.

import { useMemo } from 'react'
import { useReceiptDashboard } from '@/hooks/useReceipts'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtPct = (v: number) => v.toFixed(1)

export function ReceiptsRecoveryRateInsight() {
  const { dashboard, loading } = useReceiptDashboard()

  const totalRate = dashboard?.totals.recovery_rate ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.recovery_rate })),
    [dashboard],
  )

  // 거래처 회수율 (낮은순 위험도) — recovery_rate > 0 만 (표본 부족 행 제외).
  const byCustomer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_customer_top10 ?? [])
      .filter((r) => r.recovery_rate > 0)
      .map((r) => ({
        key: r.key, label: r.label, value: r.recovery_rate, share: r.share, count: r.count,
      }))
    return [...rows].sort((a, b) => a.value - b.value).slice(0, 10)
  }, [dashboard])

  const tone: 'pos' | 'info' | 'warn' = totalRate >= 90 ? 'pos' : totalRate >= 70 ? 'info' : 'warn'

  return (
    <InsightShell
      title="회수율"
      subtitle="(입금액 - 미정산) / 입금액 — 24개월 월별 + 거래처 회수율 (3건 이상, 위험순)"
      unit="%"
      tone={tone}
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="전체 회수율"
      totalValue={fmtPct(totalRate)}
      trend={trend}
      trendValueLabel="회수율"
      formatTrend={fmtPct}
      breakdowns={[
        { label: '거래처 (회수율 낮은순)', rows: byCustomer, unit: '%', formatValue: fmtPct },
      ]}
    />
  )
}
