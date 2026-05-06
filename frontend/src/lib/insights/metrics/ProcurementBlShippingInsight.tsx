// B/L 선적/입항 (건) 드릴다운 — status=shipping|arrived 해상 운송 구간.

import { useMemo } from 'react'
import { useBLList } from '@/hooks/useInbound'
import type { BLShipment } from '@/types/inbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const blDate = (b: BLShipment) => b.actual_arrival ?? b.eta ?? b.etd ?? null

export function ProcurementBlShippingInsight() {
  const { data, loading } = useBLList()

  const shipping = useMemo(
    () => data.filter((b) => b.status === 'shipping' || b.status === 'arrived'),
    [data],
  )

  const trend = useMemo(
    () => trend24(shipping, blDate),
    [shipping],
  )

  const byManufacturer = useMemo(
    () => breakdownBy(
      shipping,
      (b) => b.manufacturer_id,
      (b) => b.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [shipping],
  )
  const byPort = useMemo(
    () => breakdownBy(
      shipping,
      (b) => b.port ?? null,
      (b) => b.port ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [shipping],
  )
  const byForwarder = useMemo(
    () => breakdownBy(
      shipping,
      (b) => b.forwarder ?? null,
      (b) => b.forwarder ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [shipping],
  )

  return (
    <InsightShell
      title="B/L 선적/입항"
      subtitle="status=shipping|arrived 해상 운송 구간 — 24개월 추이 + 제조사/항만/포워더 분해"
      unit="건"
      tone="info"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="진행 합계"
      totalValue={shipping.length.toLocaleString()}
      trend={trend}
      trendValueLabel="선적/입항"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '항만 상위 10', rows: byPort, unit: '건' },
        { label: '포워더 상위 10', rows: byForwarder, unit: '건' },
      ]}
    />
  )
}
