// 진행 수주 (건수) 드릴다운 — orders 탭 KPI '진행 수주' 의 24개월 추이 + 차원별 분해.
//
// 서버 집계 마이그(C-1 orders) — useOrderDashboard(status_scope=active) 로 active 만 분해.

import { useMemo } from 'react'
import { useOrderDashboard } from '@/hooks/useOrders'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OrdersActiveInsight() {
  const { dashboard, loading } = useOrderDashboard({ status_scope: 'active' })

  const totalActive = dashboard?.totals.active_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.active_count })),
    [dashboard],
  )

  const byStatus: BreakdownRow[] = useMemo(
    () => (dashboard?.by_status ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byCategory: BreakdownRow[] = useMemo(
    () => (dashboard?.by_category ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byCustomer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_customer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
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
      totalValue={totalActive.toLocaleString()}
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
