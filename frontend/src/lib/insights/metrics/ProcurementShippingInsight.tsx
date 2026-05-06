// 운송중 P/O (건) 드릴다운 — status=shipping|in_progress.

import { useMemo } from 'react'
import { usePOList } from '@/hooks/useProcurement'
import { CONTRACT_TYPE_LABEL, type ContractType } from '@/types/procurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function ProcurementShippingInsight() {
  const { data, loading } = usePOList()

  const shipping = useMemo(
    () => data.filter((p) => p.status === 'shipping' || p.status === 'in_progress'),
    [data],
  )

  const trend = useMemo(
    () => trend24(shipping, (p) => p.contract_date ?? null),
    [shipping],
  )

  const byManufacturer = useMemo(
    () => breakdownBy(
      shipping,
      (p) => p.manufacturer_id,
      (p) => p.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [shipping],
  )
  const byContractType = useMemo(
    () => breakdownBy(
      shipping,
      (p) => p.contract_type,
      (p) => CONTRACT_TYPE_LABEL[p.contract_type as ContractType] ?? p.contract_type,
      () => 1,
    ),
    [shipping],
  )
  const byMw = useMemo(
    () => breakdownBy(
      shipping,
      (p) => p.manufacturer_id,
      (p) => p.manufacturer_name ?? '미지정',
      (p) => p.total_mw ?? 0,
    ).slice(0, 10),
    [shipping],
  )

  return (
    <InsightShell
      title="운송중 P/O"
      subtitle="status=shipping|in_progress · 입고 전환 대기 중인 PO — 24개월 추이 + 분해"
      unit="건"
      tone="warn"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="운송 합계"
      totalValue={shipping.length.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 운송"
      breakdowns={[
        { label: '계약 유형', rows: byContractType, unit: '건' },
        { label: '제조사 상위 10 (건수)', rows: byManufacturer, unit: '건' },
        { label: '제조사 상위 10 (MW)', rows: byMw, unit: 'MW', formatValue: (v) => v.toFixed(1) },
      ]}
    />
  )
}
