// 부분 매칭 (건) 드릴다운 — matched_total > 0 AND remaining > 0.

import { useMemo } from 'react'
import { useReceiptList } from '@/hooks/useReceipts'
import type { Receipt } from '@/types/orders'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const isPartial = (r: Receipt) =>
  (r.matched_total ?? 0) > 0 && (r.remaining ?? 0) > 0

export function ReceiptsPartialMatchInsight() {
  const { data, loading } = useReceiptList()

  const partial = useMemo(() => data.filter(isPartial), [data])

  const trend = useMemo(
    () => trend24(partial, (r) => r.receipt_date),
    [partial],
  )

  const byCustomer = useMemo(
    () => breakdownBy(
      partial,
      (r) => r.customer_id,
      (r) => r.customer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [partial],
  )

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
      totalValue={partial.length.toLocaleString()}
      trend={trend}
      trendValueLabel="부분 매칭 건"
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
      ]}
    />
  )
}
