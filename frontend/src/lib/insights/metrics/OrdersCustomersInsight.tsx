// 거래처 (활성 고객 수) 드릴다운 — orders 탭 KPI '거래처' 의 월별 distinct 추이 + 차원별 분해.

import { useMemo } from 'react'
import { useOrderListAll } from '@/hooks/useOrders'
import { MANAGEMENT_CATEGORY_LABEL } from '@/types/orders'
import { breakdownBy, trend24Distinct } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function OrdersCustomersInsight() {
  const { data, loading } = useOrderListAll()

  // distinct customer count: 월별 / 누계 모두 distinct 키 기반.
  const trend = useMemo(
    () => trend24Distinct(data, (o) => o.order_date, (o) => o.customer_id),
    [data],
  )
  const totalDistinct = useMemo(
    () => new Set(data.map((o) => o.customer_id).filter(Boolean)).size,
    [data],
  )

  // 거래처 자체가 차원이라 byCustomer 는 무의미 → 거래처별 발주 건수 (rank).
  const byCustomerCount = useMemo(
    () => breakdownBy(
      data,
      (o) => o.customer_id,
      (o) => o.customer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )
  const byCategory = useMemo(
    () => breakdownBy(
      data,
      (o) => o.management_category,
      (o) => MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category,
      () => 1,
    ),
    [data],
  )

  return (
    <InsightShell
      title="거래처"
      subtitle="월별 발주한 distinct 거래처 수 추이 + 거래처별 발주 건수 / 관리구분 분해"
      unit="곳"
      tone="info"
      backTo="/orders"
      backLabel="수주 / 수금으로 돌아가기"
      loading={loading}
      totalLabel="누적 거래처"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 거래처"
      breakdowns={[
        { label: '거래처 상위 10 (발주 건)', rows: byCustomerCount, unit: '건' },
        { label: '관리구분 (발주 건)', rows: byCategory, unit: '건' },
      ]}
    />
  )
}
