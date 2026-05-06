// 매출 합계 (억) 드릴다운 — sales 탭 KPI '매출 합계'.
//
// 서버 집계 마이그(C-1 sales follow-up) — useSaleDashboard 사용.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function SalesTotalInsight() {
  const { dashboard, loading } = useSaleDashboard()

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.sale_amount_sum })),
    [dashboard],
  )

  const totalSum = dashboard?.totals.sale_amount_sum ?? 0

  const byCustomer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_customer_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.sale_amount_sum,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )
  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.sale_amount_sum,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="매출 합계"
      subtitle="24개월 월별 매출 추이 (단위 억) · 거래처/제조사 Top10 분해"
      unit="억"
      tone="solar"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSum)}
      trend={trend}
      trendValueLabel="매출"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
