// T/T 이력 (건) 드릴다운 — 모든 송금 (planned + completed). 상태/은행/제조사 분해.

import { useMemo } from 'react'
import { useTTList } from '@/hooks/useProcurement'
import { TT_STATUS_LABEL, type TTStatus } from '@/types/procurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function ProcurementTtTotalInsight() {
  const { data, loading } = useTTList()

  const trend = useMemo(
    () => trend24(data, (t) => t.remit_date ?? null),
    [data],
  )

  const byStatus = useMemo(
    () => breakdownBy(
      data,
      (t) => t.status,
      (t) => TT_STATUS_LABEL[t.status as TTStatus] ?? t.status,
      () => 1,
    ),
    [data],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      data,
      (t) => t.manufacturer_name ?? null,
      (t) => t.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )
  const byPurpose = useMemo(
    () => breakdownBy(
      data,
      (t) => t.purpose ?? null,
      (t) => t.purpose ?? '용도 미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="T/T 이력"
      subtitle="모든 T/T 송금 (planned + completed) — 24개월 추이 + 상태/제조사/용도 분해"
      unit="건"
      tone="solar"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={data.length.toLocaleString()}
      trend={trend}
      trendValueLabel="송금"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '용도 상위 10', rows: byPurpose, unit: '건' },
      ]}
    />
  )
}
