// 미정산 (억) 드릴다운 — sum(receipt.remaining).

import { useMemo } from 'react'
import { useReceiptList } from '@/hooks/useReceipts'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function ReceiptsRemainingInsight() {
  const { data, loading } = useReceiptList()

  const outstanding = useMemo(
    () => data.filter((r) => (r.remaining ?? 0) > 0),
    [data],
  )

  const trend = useMemo(
    () => trend24(data, (r) => r.receipt_date, (r) => r.remaining ?? 0),
    [data],
  )

  const totalRemaining = outstanding.reduce((sum, r) => sum + (r.remaining ?? 0), 0)

  const byCustomer = useMemo(
    () => breakdownBy(
      outstanding,
      (r) => r.customer_id,
      (r) => r.customer_name ?? '미지정',
      (r) => r.remaining ?? 0,
    ).slice(0, 10),
    [outstanding],
  )

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
