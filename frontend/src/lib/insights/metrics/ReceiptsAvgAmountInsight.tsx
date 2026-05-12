// 평균 입금 (1건당) 드릴다운 — trend24 의 (amount_sum / count) 와 거래처별 평균.

import { useMemo } from 'react'
import { useReceiptDashboard } from '@/hooks/useReceipts'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (n: number) => (n / 100_000_000).toFixed(2)

export function ReceiptsAvgAmountInsight() {
  const { dashboard, loading } = useReceiptDashboard()

  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => ({
        month: p.month,
        value: p.count > 0 ? p.amount_sum / p.count : 0,
      })),
    [dashboard],
  )

  const totalAmount = dashboard?.totals.amount_sum ?? 0
  const totalCount = dashboard?.totals.count ?? 0
  const avg = totalCount > 0 ? totalAmount / totalCount : 0

  const byCustomer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_customer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count > 0 ? r.amount_sum / r.count : 0,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="평균 입금"
      subtitle={`전체 평균 ${fmtEok(avg)}억/건 · ${totalCount.toLocaleString()}건 기준`}
      unit="억"
      tone="info"
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="평균/건"
      totalValue={fmtEok(avg)}
      trend={trend}
      trendValueLabel="평균 입금"
      formatTrend={fmtEok}
      breakdowns={[
        { label: '거래처 평균 (상위 10)', rows: byCustomer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
