// 미착품 (incoming_kw) 드릴다운 — 운송 중 재고. latest_lc_open 기준 24개월 추이.

import { useMemo } from 'react'
import { useInventory } from '@/hooks/useInventory'
import type { InventoryItem } from '@/types/inventory'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)
const fmtMWTick = (kw: number) => `${(kw / 1000).toFixed(0)}`

export function InventoryIncomingInsight() {
  const { data, loading } = useInventory()
  const items = data?.items ?? []

  const incoming = useMemo(
    () => items.filter((it) => it.incoming_kw > 0 || it.available_incoming_kw > 0),
    [items],
  )

  // latest_lc_open 기준 트렌드 — 미착품의 LC 개설 시점 분포.
  const trend = useMemo(
    () => trend24(incoming, (it) => it.latest_lc_open ?? null, (it) => it.incoming_kw),
    [incoming],
  )
  const totalIncomingKw = incoming.reduce((sum, it) => sum + it.incoming_kw, 0)

  const byManufacturer = useMemo(
    () => breakdownBy(
      incoming,
      (it) => it.manufacturer_name,
      (it) => it.manufacturer_name,
      (it) => it.incoming_kw,
    ).slice(0, 10),
    [incoming],
  )
  const byProduct = useMemo(
    () => breakdownBy(
      incoming,
      (it) => it.product_id,
      (it) => `${it.product_name} (${it.manufacturer_name})`,
      (it) => it.incoming_kw,
    ).slice(0, 10),
    [incoming],
  )
  // 미착품 가용/예약 분해.
  const byAvailability = useMemo(() => {
    const reserved = incoming.reduce((s: number, it: InventoryItem) => s + it.incoming_reserved_kw, 0)
    const available = incoming.reduce((s: number, it: InventoryItem) => s + it.available_incoming_kw, 0)
    const total = reserved + available
    return [
      { key: 'available', label: '미착 가용 (예약 차감 후)', value: available, share: total > 0 ? available / total : 0, count: 0 },
      { key: 'reserved', label: '미착 예약', value: reserved, share: total > 0 ? reserved / total : 0, count: 0 },
    ]
  }, [incoming])

  return (
    <InsightShell
      title="미착품"
      subtitle="운송 중 재고 (incoming_kw) · LC 개설 시점 24개월 추이 + 제조사/제품/예약 분해"
      unit="MW"
      tone="info"
      backTo="/inventory?tab=incoming"
      backLabel="미착품으로 돌아가기"
      loading={loading}
      totalLabel="현재 미착품"
      totalValue={fmtMW(totalIncomingKw)}
      trend={trend}
      trendValueLabel="LC 개설액"
      formatTrend={fmtMWTick}
      breakdowns={[
        { label: '미착품 구성', rows: byAvailability, unit: 'MW', formatValue: fmtMW },
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
