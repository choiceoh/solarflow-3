// 금년 출고 용량 (MW) 드릴다운 — 금년 누계 기준 분해 + 24개월 추이.
//
// 서버 집계 마이그(C-1) 후: useOutboundDashboard (period=year) — breakdown 이 올해로 좁혀진다.

import { useMemo } from 'react'
import { useOutboundDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)
const fmtMWTick = (kw: number) => `${(kw / 1000).toFixed(0)}`

export function OutboundKwYearInsight() {
  const { dashboard, loading } = useOutboundDashboard({ period: 'year' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.kw_sum })),
    [dashboard],
  )

  const totalYearKw = useMemo(() => {
    return (dashboard?.by_usage ?? []).reduce((sum, r) => sum + r.kw_sum, 0)
  }, [dashboard])

  const byUsage: BreakdownRow[] = useMemo(
    () => (dashboard?.by_usage ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.kw_sum,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )
  const byCustomer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_customer_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.kw_sum,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )
  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.kw_sum,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="금년 출고 용량"
      subtitle={`${new Date().getFullYear()}년 누계 (단위 MW) · 24개월 추이 + 용도/거래처/제조사 분해 · 거래처는 상품판매 출고만 집계`}
      unit="MW"
      tone="pos"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="금년 누계"
      totalValue={fmtMW(totalYearKw)}
      trend={trend}
      trendValueLabel="출고 용량 (kW)"
      formatTrend={fmtMWTick}
      breakdowns={[
        { label: '용도', rows: byUsage, unit: 'MW', formatValue: fmtMW },
        { label: '거래처 상위 10 (상품판매)', rows: byCustomer, unit: 'MW', formatValue: fmtMW },
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
