// 전체 PO 수 (chain + 변경계약) 드릴다운.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

export function PurchaseTotalPosInsight() {
  const { dashboard, loading } = usePurchaseDashboard()

  const chainCount = dashboard?.totals.chain_count ?? 0
  const variantCount = dashboard?.totals.variant_count ?? 0
  const total = chainCount + variantCount

  const byManufacturer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.chain_count + r.variant_count,
        share: 0,
        count: r.chain_count + r.variant_count,
      })),
    [dashboard],
  )

  const distribution: BreakdownRow[] = useMemo(
    () => [
      {
        key: 'head',
        label: '체인 head PO',
        value: chainCount,
        share: total > 0 ? chainCount / total : 0,
        count: chainCount,
      },
      {
        key: 'variant',
        label: '변경계약 PO',
        value: variantCount,
        share: total > 0 ? variantCount / total : 0,
        count: variantCount,
      },
    ],
    [chainCount, variantCount, total],
  )

  return (
    <InsightShell
      title="전체 PO"
      subtitle={`체인 head ${chainCount.toLocaleString()} + 변경계약 ${variantCount.toLocaleString()} · 제조사 분해`}
      unit="건"
      tone="ink"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={total.toLocaleString()}
      trend={[]}
      trendValueLabel="PO"
      breakdowns={[
        { label: '유형 분포', rows: distribution, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
