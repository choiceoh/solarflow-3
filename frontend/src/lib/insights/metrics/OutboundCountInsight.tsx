// 출고 전체 (건수) 드릴다운 — OrdersPage outbound 탭 KPI '출고 전체' 의 상세 분해.

import { useMemo } from 'react'
import { useOutboundListAll } from '@/hooks/useOutbound'
import { USAGE_CATEGORY_LABEL } from '@/types/outbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function OutboundCountInsight() {
  const { data, loading } = useOutboundListAll()

  const trend = useMemo(
    () => trend24(data, (o) => o.outbound_date),
    [data],
  )
  const byUsage = useMemo(
    () => breakdownBy(
      data,
      (o) => o.usage_category,
      (o) => USAGE_CATEGORY_LABEL[o.usage_category] ?? o.usage_category,
      () => 1,
    ),
    [data],
  )
  const byCustomer = useMemo(
    () => breakdownBy(
      data,
      (o) => o.customer_id ?? null,
      (o) => o.customer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      data,
      (o) => o.manufacturer_id ?? null,
      (o) => o.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="출고 전체"
      subtitle="월별 출고 건수와 용도·거래처·제조사별 분해"
      unit="건"
      tone="solar"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={data.length.toLocaleString()}
      trend={trend}
      trendValueLabel="출고 건수"
      breakdowns={[
        { label: '용도', rows: byUsage, unit: '건' },
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
