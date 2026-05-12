// 미착 비중 (가용 중 미착 비율) 드릴다운 — 제조사·제품별 incoming/total 분해.
// 핵심 질문: '실재고는 비었는데 미착품으로만 채워진 SKU' 가 어디인지 확인.

import { useMemo } from 'react'
import { useInventory } from '@/hooks/useInventory'
import type { BreakdownRow } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtPct = (p: number) => p.toFixed(1)

export function InventoryIncomingShareInsight() {
  const { data, loading } = useInventory()
  const items = (data?.items ?? []).filter((it) => it.total_secured_kw > 0)

  const totalSecuredKw = items.reduce((sum, it) => sum + it.total_secured_kw, 0)
  const totalIncomingKw = items.reduce((sum, it) => sum + it.available_incoming_kw, 0)
  const overallShare = totalSecuredKw > 0 ? (totalIncomingKw / totalSecuredKw) * 100 : 0

  // 제조사별: 가용 합산 → 미착 / 총 가용 비율.
  const byManufacturer = useMemo<BreakdownRow[]>(() => {
    const map = new Map<string, { incoming: number; total: number; count: number }>()
    for (const it of items) {
      const cur = map.get(it.manufacturer_name) ?? { incoming: 0, total: 0, count: 0 }
      cur.incoming += it.available_incoming_kw
      cur.total += it.total_secured_kw
      cur.count += 1
      map.set(it.manufacturer_name, cur)
    }
    const rows: BreakdownRow[] = []
    for (const [key, g] of map) {
      const pct = g.total > 0 ? (g.incoming / g.total) * 100 : 0
      rows.push({ key, label: key, value: pct, share: 0, count: g.count })
    }
    rows.sort((a, b) => b.value - a.value)
    return rows.slice(0, 10)
  }, [items])

  // 제품별: 미착 비중이 높은 (= 실재고 부족, 미착 의존) SKU.
  const byProduct = useMemo<BreakdownRow[]>(() => {
    const rows: BreakdownRow[] = items
      .filter((it) => it.total_secured_kw > 0)
      .map((it) => {
        const pct = (it.available_incoming_kw / it.total_secured_kw) * 100
        return {
          key: it.product_id,
          label: `${it.product_name} (${it.manufacturer_name})`,
          value: pct,
          share: 0,
          count: 1,
        }
      })
    rows.sort((a, b) => b.value - a.value)
    return rows.slice(0, 10)
  }, [items])

  return (
    <InsightShell
      title="미착 비중"
      subtitle="가용 중 미착품 비율(%) · 제조사/제품 별 분해 (높을수록 실재고 부족)"
      unit="%"
      tone="info"
      backTo="/inventory"
      backLabel="재고로 돌아가기"
      loading={loading}
      totalLabel="전체 미착 비중"
      totalValue={fmtPct(overallShare)}
      trend={[]}
      trendValueLabel="미착 비중"
      breakdowns={[
        { label: '제조사 (높은 순)', rows: byManufacturer, unit: '%', formatValue: fmtPct },
        { label: '제품 (미착 의존 상위 10)', rows: byProduct, unit: '%', formatValue: fmtPct },
      ]}
    />
  )
}
