// 계약 체인 (건) 드릴다운 — head PO 만 카운트. 제조사별 + 변경 포함 여부 분해.
//
// 서버 집계 (purchase_dashboard RPC) — totals.chain_count + trend24.chain_count + chains_breakdown.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

export function PurchaseChainsInsight() {
  const { dashboard, loading } = usePurchaseDashboard()
  const totalChains = dashboard?.totals.chain_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.chain_count })),
    [dashboard],
  )

  const byVariantStatus: BreakdownRow[] = useMemo(
    () => (dashboard?.chains_breakdown ?? []).map((r) => ({
      key: r.key,
      label: r.label,
      value: r.count,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  const byManufacturer: BreakdownRow[] = useMemo(
    () => [...(dashboard?.by_manufacturer_top10 ?? [])]
      .filter((r) => r.chain_count > 0)
      .sort((a, b) => b.chain_count - a.chain_count)
      .slice(0, 10)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.chain_count,
        share: totalChains > 0 ? r.chain_count / totalChains : 0,
        count: r.chain_count,
      })),
    [dashboard, totalChains],
  )

  return (
    <InsightShell
      title="계약 체인"
      subtitle="head PO 기준 계약 체인 수 — 24개월 신규 체인 추이 + 제조사/변경 포함 분해"
      unit="건"
      tone="solar"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="체인 합계"
      totalValue={totalChains.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 체인"
      breakdowns={[
        { label: '체인 구성', rows: byVariantStatus, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
