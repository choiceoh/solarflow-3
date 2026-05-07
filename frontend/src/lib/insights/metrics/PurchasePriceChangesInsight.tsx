// 단가 변동 (건) 드릴다운 — PriceHistory 등록. 제조사/제품/변경 사유별 분해.
//
// 서버 집계 (purchase_dashboard RPC).

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

export function PurchasePriceChangesInsight() {
  const { dashboard, loading } = usePurchaseDashboard()
  const totalChanges = dashboard?.totals.price_change_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.price_change_count })),
    [dashboard],
  )

  const byManufacturer: BreakdownRow[] = useMemo(
    () => [...(dashboard?.by_manufacturer_top10 ?? [])]
      .filter((r) => r.price_change_count > 0)
      .sort((a, b) => b.price_change_count - a.price_change_count)
      .slice(0, 10)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.price_change_count,
        share: totalChanges > 0 ? r.price_change_count / totalChanges : 0,
        count: r.price_change_count,
      })),
    [dashboard, totalChanges],
  )

  const byProduct: BreakdownRow[] = useMemo(
    () => (dashboard?.by_product_top10 ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.count,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  const byReason: BreakdownRow[] = useMemo(
    () => (dashboard?.by_reason_top10 ?? []).map((r) => ({
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
      title="단가 변동"
      subtitle="PriceHistory 등록 건 — 24개월 월별 추이 + 제조사/제품/사유별 분해"
      unit="건"
      tone="info"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="변동 합계"
      totalValue={totalChanges.toLocaleString()}
      trend={trend}
      trendValueLabel="단가 변동"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '제품 상위 10', rows: byProduct, unit: '건' },
        { label: '변경 사유 상위 10', rows: byReason, unit: '건' },
      ]}
    />
  )
}
