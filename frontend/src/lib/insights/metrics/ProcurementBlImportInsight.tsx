// B/L 해외직수입 (건) 드릴다운 — inbound_type=import. OCR 자동입력 대상.

import { useMemo } from 'react'
import { useBLList } from '@/hooks/useInbound'
import { BL_STATUS_LABEL, type BLStatus } from '@/types/inbound'
import type { BLShipment } from '@/types/inbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const blDate = (b: BLShipment) => b.actual_arrival ?? b.eta ?? b.etd ?? null

export function ProcurementBlImportInsight() {
  const { data, loading } = useBLList()

  const imports = useMemo(() => data.filter((b) => b.inbound_type === 'import'), [data])

  const trend = useMemo(
    () => trend24(imports, blDate),
    [imports],
  )

  const byStatus = useMemo(
    () => breakdownBy(
      imports,
      (b) => b.status,
      (b) => BL_STATUS_LABEL[b.status as BLStatus] ?? b.status,
      () => 1,
    ),
    [imports],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      imports,
      (b) => b.manufacturer_id,
      (b) => b.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [imports],
  )
  const byPort = useMemo(
    () => breakdownBy(
      imports,
      (b) => b.port ?? null,
      (b) => b.port ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [imports],
  )

  return (
    <InsightShell
      title="B/L 해외직수입"
      subtitle="inbound_type=import — OCR 자동입력 대상. 24개월 추이 + 상태/제조사/항만 분해"
      unit="건"
      tone="pos"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={imports.length.toLocaleString()}
      trend={trend}
      trendValueLabel="해외직수입"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '항만 상위 10', rows: byPort, unit: '건' },
      ]}
    />
  )
}
