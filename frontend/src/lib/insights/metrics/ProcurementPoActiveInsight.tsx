// 진행 P/O (건수) 드릴다운 — ProcurementPage PO 탭 KPI '진행 P/O'.

import { useMemo } from 'react'
import { usePOList } from '@/hooks/useProcurement'
import { CONTRACT_TYPE_LABEL, type ContractType } from '@/types/procurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function ProcurementPoActiveInsight() {
  const { data, loading } = usePOList()

  // 진행 = completed/cancelled 제외.
  const active = useMemo(
    () => data.filter((p) => p.status !== 'completed' && p.status !== 'cancelled'),
    [data],
  )

  const trend = useMemo(
    () => trend24(active, (p) => p.contract_date ?? null),
    [active],
  )

  const byManufacturer = useMemo(
    () => breakdownBy(
      active,
      (p) => p.manufacturer_id,
      (p) => p.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [active],
  )
  const byContractType = useMemo(
    () => breakdownBy(
      active,
      (p) => p.contract_type,
      (p) => CONTRACT_TYPE_LABEL[p.contract_type as ContractType] ?? p.contract_type,
      () => 1,
    ),
    [active],
  )
  const byMw = useMemo(
    () => breakdownBy(
      active,
      (p) => p.manufacturer_id,
      (p) => p.manufacturer_name ?? '미지정',
      (p) => p.total_mw ?? 0,
    ).slice(0, 10),
    [active],
  )

  return (
    <InsightShell
      title="진행 P/O"
      subtitle="completed/cancelled 제외 PO — 24개월 신규 발생 + 제조사/계약유형 분해"
      unit="건"
      tone="solar"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="진행 합계"
      totalValue={active.length.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 PO"
      breakdowns={[
        { label: '계약 유형', rows: byContractType, unit: '건' },
        { label: '제조사 상위 10 (건수)', rows: byManufacturer, unit: '건' },
        { label: '제조사 상위 10 (MW)', rows: byMw, unit: 'MW', formatValue: (v) => v.toFixed(1) },
      ]}
    />
  )
}
