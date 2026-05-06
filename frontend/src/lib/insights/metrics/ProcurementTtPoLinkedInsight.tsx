// T/T PO 연결 (건) 드릴다운 — distinct po_id 수 + PO별 송금 합계.

import { useMemo } from 'react'
import { useTTList } from '@/hooks/useProcurement'
import { breakdownBy, trend24Distinct } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementTtPoLinkedInsight() {
  const { data, loading } = useTTList()

  const trend = useMemo(
    () => trend24Distinct(data, (t) => t.remit_date ?? null, (t) => t.po_id),
    [data],
  )
  const totalDistinct = useMemo(
    () => new Set(data.map((t) => t.po_id)).size,
    [data],
  )

  const byPoCount = useMemo(
    () => breakdownBy(
      data,
      (t) => t.po_id,
      (t) => t.po_number ?? t.po_id.slice(0, 8),
      () => 1,
    ).slice(0, 10),
    [data],
  )
  const byPoAmount = useMemo(
    () => breakdownBy(
      data,
      (t) => t.po_id,
      (t) => t.po_number ?? t.po_id.slice(0, 8),
      (t) => t.amount_usd ?? 0,
    ).slice(0, 10),
    [data],
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
