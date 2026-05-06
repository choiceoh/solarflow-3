// 진행 수주 (건수) 드릴다운 — orders 탭 KPI '진행 수주' 의 24개월 추이 + 차원별 분해.

import { useMemo } from 'react'
import { useOrderListAll } from '@/hooks/useOrders'
import { ORDER_STATUS_LABEL, MANAGEMENT_CATEGORY_LABEL } from '@/types/orders'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function OrdersActiveInsight() {
  const { data, loading } = useOrderListAll()

  // 진행 = 미완료/미취소.
  const active = useMemo(
    () => data.filter((o) => o.status !== 'completed' && o.status !== 'cancelled'),
    [data],
  )

  const trend = useMemo(
    () => trend24(active, (o) => o.order_date),
    [active],
  )
  const byCustomer = useMemo(
    () => breakdownBy(
      active,
      (o) => o.customer_id,
      (o) => o.customer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [active],
  )
  const byStatus = useMemo(
    () => breakdownBy(
      active,
      (o) => o.status,
      (o) => ORDER_STATUS_LABEL[o.status] ?? o.status,
      () => 1,
    ),
    [active],
  )
  const byCategory = useMemo(
    () => breakdownBy(
      active,
      (o) => o.management_category,
      (o) => MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category,
      () => 1,
    ),
    [active],
  )

  return (
    <InsightShell
      title="진행 수주"
      subtitle="미완료/미취소 수주의 월별 신규 발생 추이 + 거래처/상태/관리구분 분해"
      unit="건"
      tone="solar"
      backTo="/orders"
      backLabel="수주 / 수금으로 돌아가기"
      loading={loading}
      totalLabel="진행 합계"
      totalValue={active.length.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 수주"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '관리구분', rows: byCategory, unit: '건' },
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
      ]}
    />
  )
}
