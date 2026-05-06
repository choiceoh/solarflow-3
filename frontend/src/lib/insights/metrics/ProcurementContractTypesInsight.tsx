// 계약 유형 (종) 드릴다운 — distinct contract_type 수 + 유형별 PO/MW 분포.

import { useMemo } from 'react'
import { usePOList } from '@/hooks/useProcurement'
import { CONTRACT_TYPE_LABEL, type ContractType } from '@/types/procurement'
import { breakdownBy, trend24Distinct } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function ProcurementContractTypesInsight() {
  const { data, loading } = usePOList()

  const trend = useMemo(
    () => trend24Distinct(data, (p) => p.contract_date ?? null, (p) => p.contract_type),
    [data],
  )
  const totalDistinct = useMemo(
    () => new Set(data.map((p) => p.contract_type)).size,
    [data],
  )

  const byTypeCount = useMemo(
    () => breakdownBy(
      data,
      (p) => p.contract_type,
      (p) => CONTRACT_TYPE_LABEL[p.contract_type as ContractType] ?? p.contract_type,
      () => 1,
    ),
    [data],
  )
  const byTypeMw = useMemo(
    () => breakdownBy(
      data,
      (p) => p.contract_type,
      (p) => CONTRACT_TYPE_LABEL[p.contract_type as ContractType] ?? p.contract_type,
      (p) => p.total_mw ?? 0,
    ),
    [data],
  )

  return (
    <InsightShell
      title="계약 유형"
      subtitle="distinct contract_type 추이 + 유형별 PO 건수/MW (spot/frame/annual 등)"
      unit="종"
      tone="pos"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="누적 유형"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 유형"
      breakdowns={[
        { label: '유형별 PO 건수', rows: byTypeCount, unit: '건' },
        { label: '유형별 MW', rows: byTypeMw, unit: 'MW', formatValue: (v) => v.toFixed(1) },
      ]}
    />
  )
}
