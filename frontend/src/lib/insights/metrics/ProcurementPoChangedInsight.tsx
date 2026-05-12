// PO 변경계약 (parent_po_id 보유) 드릴다운.

import { useMemo } from 'react'
import { usePOList } from '@/hooks/useProcurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtCount = (n: number) => String(Math.round(n))
const fmtMw = (n: number) => n.toFixed(2)

export function ProcurementPoChangedInsight() {
  const { data: pos, loading } = usePOList()
  const changed = useMemo(() => pos.filter((p) => p.parent_po_id != null), [pos])

  const trend = useMemo(() => trend24(changed, (p) => p.contract_date), [changed])

  const byManufacturer = useMemo(
    () =>
      breakdownBy(
        changed,
        (p) => p.manufacturer_id,
        (p) => p.manufacturer_name ?? p.manufacturer_id,
        () => 1,
      ).slice(0, 10),
    [changed],
  )
  const byContractType = useMemo(
    () => breakdownBy(changed, (p) => p.contract_type, (p) => p.contract_type, () => 1),
    [changed],
  )
  const byMwTop = useMemo(
    () =>
      breakdownBy(
        changed,
        (p) => p.po_id,
        (p) => p.po_number ?? p.po_id.slice(0, 8),
        (p) => p.total_mw ?? 0,
      ).slice(0, 10),
    [changed],
  )

  return (
    <InsightShell
      title="변경계약 PO"
      subtitle="parent_po_id 가 있는 PO — 체인 내 추가 변경 건. 제조사·계약유형·용량 분해"
      unit="건"
      tone="warn"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="변경 PO"
      totalValue={fmtCount(changed.length)}
      trend={trend}
      trendValueLabel="변경계약"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '계약 유형', rows: byContractType, unit: '건' },
        { label: 'PO 용량 상위 10', rows: byMwTop, unit: 'MW', formatValue: fmtMw },
      ]}
    />
  )
}
