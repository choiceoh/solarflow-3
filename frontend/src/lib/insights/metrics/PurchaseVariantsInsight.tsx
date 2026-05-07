// 변경계약 (건) 드릴다운 — parent_po_id != null 인 PO. 제조사별 + 원계약별 분해.
//
// 서버 집계 (purchase_dashboard RPC) — totals.variant_count + trend24.variant_count + by_head_po_top10.

import { useMemo } from 'react'
import { usePurchaseDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

export function PurchaseVariantsInsight() {
  const { dashboard, loading } = usePurchaseDashboard()
  const totalVariants = dashboard?.totals.variant_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.variant_count })),
    [dashboard],
  )

  const byManufacturer: BreakdownRow[] = useMemo(
    () => [...(dashboard?.by_manufacturer_top10 ?? [])]
      .filter((r) => r.variant_count > 0)
      .sort((a, b) => b.variant_count - a.variant_count)
      .slice(0, 10)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.variant_count,
        share: totalVariants > 0 ? r.variant_count / totalVariants : 0,
        count: r.variant_count,
      })),
    [dashboard, totalVariants],
  )

  const byHeadPo: BreakdownRow[] = useMemo(
    () => (dashboard?.by_head_po_top10 ?? []).map((r) => ({
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
      title="변경계약"
      subtitle="원계약(head)이 아닌 추가 PO — 24개월 추이 + 제조사/원계약별 분해"
      unit="건"
      tone="warn"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="변경 합계"
      totalValue={totalVariants.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 변경"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '원계약별 변경 수 상위 10', rows: byHeadPo, unit: '건' },
      ]}
    />
  )
}
