// B/L 통관중 (건) 드릴다운 — status=customs 면장 확인 필요.

import { useMemo } from 'react'
import { useBLList } from '@/hooks/useInbound'
import type { BLShipment } from '@/types/inbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const blDate = (b: BLShipment) => b.actual_arrival ?? b.eta ?? b.etd ?? null

export function ProcurementBlCustomsInsight() {
  const { data, loading } = useBLList()

  const customs = useMemo(() => data.filter((b) => b.status === 'customs'), [data])

  const trend = useMemo(
    () => trend24(customs, blDate),
    [customs],
  )

  const byManufacturer = useMemo(
    () => breakdownBy(
      customs,
      (b) => b.manufacturer_id,
      (b) => b.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [customs],
  )
  const byPort = useMemo(
    () => breakdownBy(
      customs,
      (b) => b.port ?? null,
      (b) => b.port ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [customs],
  )

  return (
    <InsightShell
      title="B/L 통관중"
      subtitle="status=customs 면장 확인 필요 — 24개월 추이 + 제조사/항만 분해"
      unit="건"
      tone="warn"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="통관 합계"
      totalValue={customs.length.toLocaleString()}
      trend={trend}
      trendValueLabel="통관 진입"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '항만 상위 10', rows: byPort, unit: '건' },
      ]}
    />
  )
}
