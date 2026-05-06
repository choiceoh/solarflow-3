// T/T 대기 (건) 드릴다운 — status=planned 송금 예정.

import { useMemo } from 'react'
import { useTTList } from '@/hooks/useProcurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementTtPlannedInsight() {
  const { data, loading } = useTTList()

  const planned = useMemo(() => data.filter((t) => t.status === 'planned'), [data])

  const trend = useMemo(
    () => trend24(planned, (t) => t.remit_date ?? null),
    [planned],
  )
  const plannedAmount = planned.reduce((sum, t) => sum + (t.amount_usd ?? 0), 0)

  const byManufacturer = useMemo(
    () => breakdownBy(
      planned,
      (t) => t.manufacturer_name ?? null,
      (t) => t.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [planned],
  )
  const byManufacturerAmount = useMemo(
    () => breakdownBy(
      planned,
      (t) => t.manufacturer_name ?? null,
      (t) => t.manufacturer_name ?? '미지정',
      (t) => t.amount_usd ?? 0,
    ).slice(0, 10),
    [planned],
  )

  return (
    <InsightShell
      title="T/T 대기"
      subtitle={`status=planned 예정 송금 — 24개월 추이 + 제조사 분해 (예정 금액 ${fmtUsdM(plannedAmount)} M$)`}
      unit="건"
      tone="warn"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="대기 합계"
      totalValue={planned.length.toLocaleString()}
      trend={trend}
      trendValueLabel="예정 송금"
      breakdowns={[
        { label: '제조사 (건수)', rows: byManufacturer, unit: '건' },
        { label: '제조사 (예정 금액)', rows: byManufacturerAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
