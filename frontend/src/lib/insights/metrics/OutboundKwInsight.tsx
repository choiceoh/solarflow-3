// 전월 출고 용량 (MW) 드릴다운 — 24개월 트렌드 + 전월 차원별 분해.
// "전월" 자체는 단일 값이지만, 드릴다운 화면은 더 큰 컨텍스트 (24개월 추이 + 거래처/제조사) 를 보여준다.
//
// 서버 집계 마이그(C-1) 후: useOutboundDashboard (period=prev_month) — breakdown 이 직전 달로 좁혀진다.

import { useMemo } from 'react'
import { useOutboundDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)
const fmtMWTick = (kw: number) => `${(kw / 1000).toFixed(0)}`

export function OutboundKwInsight() {
  const { dashboard, loading } = useOutboundDashboard({ period: 'prev_month' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.kw_sum })),
    [dashboard],
  )

  const totalPrevKw = useMemo(() => {
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
      title="전월 출고 용량"
      subtitle="24개월 추이 (단위 MW) · 전월 출고분의 용도·거래처·제조사 분해 · 거래처는 상품판매 출고만 집계"
      unit="MW"
      tone="ink"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="전월 합계"
      totalValue={fmtMW(totalPrevKw)}
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
