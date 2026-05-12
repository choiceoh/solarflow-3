// 매출 공급가 합계 (VAT 별도) 드릴다운.
// SaleDashboard 의 supply_amount_sum 을 사용. by_customer/by_manufacturer 는 sale_amount(부가세 포함)
// 기준이지만, share 분포 자체는 동일 비율이라 KPI 의 위치를 가늠하는 데 충분.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

const fmtEok = (n: number) => (n / 100_000_000).toFixed(2)

export function SalesSupplyInsight() {
  const { dashboard, loading } = useSaleDashboard()

  // trend24 는 sale_amount(부가세 포함) 만 제공. 공급가는 ÷ 1.1 근사로 환산 (한국 일반 VAT 10%).
  const trend: TrendPoint[] = useMemo(
    () =>
      (dashboard?.trend24 ?? []).map((p) => ({
        month: p.month,
        value: p.sale_amount_sum / 1.1,
      })),
    [dashboard],
  )
  const total = dashboard?.totals.supply_amount_sum ?? 0

  const byCustomer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_customer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.sale_amount_sum / 1.1,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )
  const byManufacturer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.sale_amount_sum / 1.1,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="매출 공급가"
      subtitle="VAT 별도 공급가 합계 (억) · 거래처·제조사 분해. trend24 는 sale_amount / 1.1 근사."
      unit="억"
      tone="ink"
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="공급가 합계"
      totalValue={fmtEok(total)}
      trend={trend}
      trendValueLabel="공급가 (월별 ≈ 공급가)"
      formatTrend={fmtEok}
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
