// 분할출고 (status=partial) 드릴다운 — 잔량 관리 대상 수주.
//
// 서버 집계 마이그(C-1 orders) — useOrderDashboard(status_scope=partial) 로 partial 만 분해.

import { useMemo } from 'react'
import { useOrderDashboard } from '@/hooks/useOrders'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OrdersPartialInsight() {
  const { dashboard, loading } = useOrderDashboard({ status_scope: 'partial' })

  const totalPartial = dashboard?.totals.partial_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.partial_count })),
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
  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
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
      totalValue={totalPartial.toLocaleString()}
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
