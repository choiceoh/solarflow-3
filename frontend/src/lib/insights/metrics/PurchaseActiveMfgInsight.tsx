// 활성 제조사 (체인 보유) 드릴다운.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

export function PurchaseActiveMfgInsight() {
  const { dashboard, loading } = usePurchaseDashboard()

  const total = (dashboard?.by_manufacturer_top10 ?? []).length

  const byChainCount: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.chain_count,
        share: 0,
        count: r.chain_count,
      })),
    [dashboard],
  )
  const byVariantCount: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: `${r.key}-var`,
        label: r.label,
        value: r.variant_count,
        share: 0,
        count: r.variant_count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="활성 제조사"
      subtitle="구매 체인 보유 제조사 상위 10 · 체인 수 / 변경계약 수 분해"
      unit="곳"
      tone="ink"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="표시 제조사"
      totalValue={total.toLocaleString()}
      trend={[]}
      trendValueLabel="제조사"
      breakdowns={[
        { label: '제조사 체인 수', rows: byChainCount, unit: '건' },
        { label: '제조사 변경계약 수', rows: byVariantCount, unit: '건' },
      ]}
    />
  )
}
