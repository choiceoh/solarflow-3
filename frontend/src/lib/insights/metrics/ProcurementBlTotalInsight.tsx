// B/L 전체 (건) 드릴다운 — 모든 B/L. 상태/제조사/입고유형 분해.

import { useMemo } from 'react'
import { useBLList } from '@/hooks/useInbound'
import { BL_STATUS_LABEL, INBOUND_TYPE_LABEL, type BLStatus, type InboundType } from '@/types/inbound'
import type { BLShipment } from '@/types/inbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const blDate = (b: BLShipment) => b.actual_arrival ?? b.eta ?? b.etd ?? null

export function ProcurementBlTotalInsight() {
  const { data, loading } = useBLList()

  const trend = useMemo(
    () => trend24(data, blDate),
    [data],
  )

  const byStatus = useMemo(
    () => breakdownBy(
      data,
      (b) => b.status,
      (b) => BL_STATUS_LABEL[b.status as BLStatus] ?? b.status,
      () => 1,
    ),
    [data],
  )
  const byInboundType = useMemo(
    () => breakdownBy(
      data,
      (b) => b.inbound_type,
      (b) => INBOUND_TYPE_LABEL[b.inbound_type as InboundType] ?? b.inbound_type,
      () => 1,
    ),
    [data],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      data,
      (b) => b.manufacturer_id,
      (b) => b.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="B/L 전체"
      subtitle="모든 B/L — 24개월 추이 (actual_arrival/eta/etd 우선순위) + 상태/입고유형/제조사 분해"
      unit="건"
      tone="solar"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={data.length.toLocaleString()}
      trend={trend}
      trendValueLabel="B/L 등록"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '입고 유형', rows: byInboundType, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
