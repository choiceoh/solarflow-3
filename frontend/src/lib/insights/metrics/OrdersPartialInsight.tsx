// 분할출고 (status=partial) 드릴다운 — 잔량 관리 대상 수주.

import { useMemo } from 'react'
import { useOrderListAll } from '@/hooks/useOrders'
import { MANAGEMENT_CATEGORY_LABEL } from '@/types/orders'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function OrdersPartialInsight() {
  const { data, loading } = useOrderListAll()

  const partial = useMemo(() => data.filter((o) => o.status === 'partial'), [data])

  const trend = useMemo(
    () => trend24(partial, (o) => o.order_date),
    [partial],
  )
  const byCustomer = useMemo(
    () => breakdownBy(
      partial,
      (o) => o.customer_id,
      (o) => o.customer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [partial],
  )
  const byCategory = useMemo(
    () => breakdownBy(
      partial,
      (o) => o.management_category,
      (o) => MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category,
      () => 1,
    ),
    [partial],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      partial,
      (o) => o.manufacturer_name ?? null,
      (o) => o.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [partial],
  )

  return (
    <InsightShell
      title="분할출고"
      subtitle="status=partial · 잔량 관리 대상 수주의 월별 신규 발생 추이"
      unit="건"
      tone="warn"
      backTo="/orders"
      backLabel="수주 / 수금으로 돌아가기"
      loading={loading}
      totalLabel="분할 합계"
      totalValue={partial.length.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 분할"
      breakdowns={[
        { label: '관리구분', rows: byCategory, unit: '건' },
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
