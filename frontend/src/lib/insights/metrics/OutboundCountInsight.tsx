// 출고 전체 (건수) 드릴다운 — OrdersPage outbound 탭 KPI '출고 전체' 의 상세 분해.
//
// 서버 집계 마이그(C-1) 후: useOutboundDashboard (period=lifetime) 로 trend + breakdown 수신.
// 이전엔 useOutboundListAll 로 전체 출고를 끌어와 client-side aggregation 했으나,
// 응답이 수 MB 라 wire/CPU 비용 컸음.

import { useMemo } from 'react'
import { useOutboundDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OutboundCountInsight() {
  const { dashboard, loading } = useOutboundDashboard({ period: 'lifetime' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )

  const total = dashboard?.totals.count ?? 0

  const byUsage: BreakdownRow[] = useMemo(
    () => (dashboard?.by_usage ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.count,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )
  const byCustomer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_customer_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.count,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )
  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.count,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
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
      totalValue={total.toLocaleString()}
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
