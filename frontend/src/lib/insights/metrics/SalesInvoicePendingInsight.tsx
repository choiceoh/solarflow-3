// 계산서 미발행 (건) 드릴다운 — tax_invoice_date 가 없는 매출.
//
// 서버 집계 마이그(C-1 sales follow-up) — useSaleDashboard 사용.
// trend 는 dashboard.pending_trend24 (outbound_date 기반), breakdown 은 invoice_pending_count desc.

import { useMemo } from 'react'
import { useSaleDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function SalesInvoicePendingInsight() {
  const { dashboard, loading } = useSaleDashboard()

  const totalPending = dashboard?.totals.invoice_pending_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.pending_trend24 ?? []).map((p) => ({ month: p.month, value: p.pending_count })),
    [dashboard],
  )

  // by_*_top10 은 sale_amount 기준 정렬이라 pending_count 기준으로 재정렬.
  const byCustomer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_customer_top10 ?? [])
      .filter((r) => r.invoice_pending_count > 0)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.invoice_pending_count,
        share: r.share,
        count: r.count,
      }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  const byManufacturer: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_manufacturer_top10 ?? [])
      .filter((r) => r.invoice_pending_count > 0)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.invoice_pending_count,
        share: r.share,
        count: r.count,
      }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  return (
    <InsightShell
      title="계산서 미발행"
      subtitle="tax_invoice_date 가 비어있는 매출 — 출고월 기준 24개월 추이"
      unit="건"
      tone={totalPending > 0 ? 'warn' : 'pos'}
      backTo="/orders?tab=sales"
      backLabel="판매 · 세금계산서로 돌아가기"
      loading={loading}
      totalLabel="미발행 합계"
      totalValue={totalPending.toLocaleString()}
      trend={trend}
      trendValueLabel="미발행 건수"
      breakdowns={[
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
