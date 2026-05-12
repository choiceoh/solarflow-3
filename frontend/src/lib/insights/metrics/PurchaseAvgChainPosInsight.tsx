// 체인당 PO 수 (평균) 드릴다운.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtFixed2 = (n: number) => n.toFixed(2)

export function PurchaseAvgChainPosInsight() {
  const { dashboard, loading } = usePurchaseDashboard()

  const chainCount = dashboard?.totals.chain_count ?? 0
  const variantCount = dashboard?.totals.variant_count ?? 0
  // 전체 PO = chains + variants. (chain 의 head + variants 라 chain_count + variant_count 가 PO 합계.)
  const totalPos = chainCount + variantCount
  const avg = chainCount > 0 ? totalPos / chainCount : 0

  const byManufacturer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? [])
        .map((r) => ({
          key: r.key,
          label: r.label,
          value: r.chain_count > 0 ? (r.chain_count + r.variant_count) / r.chain_count : 0,
          share: 0,
          count: r.chain_count,
        }))
        .sort((a, b) => b.value - a.value),
    [dashboard],
  )

  return (
    <InsightShell
      title="체인당 PO 평균"
      subtitle={`전체 ${chainCount.toLocaleString()} 체인 · ${totalPos.toLocaleString()} PO · 평균 ${fmtFixed2(avg)} PO/체인`}
      unit="PO"
      tone="ink"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="평균/체인"
      totalValue={fmtFixed2(avg)}
      trend={[]}
      trendValueLabel="평균"
      breakdowns={[
        { label: '제조사 평균 (상위 10)', rows: byManufacturer, unit: 'PO', formatValue: fmtFixed2 },
      ]}
    />
  )
}
