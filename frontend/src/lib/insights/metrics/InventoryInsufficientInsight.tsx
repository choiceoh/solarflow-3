// 부족 예상 품목 드릴다운 — 6개월 forecast 의 insufficient 월 또는
// 미예정 수요(unscheduled.sale_kw/construction_kw)가 있는 SKU를 본다.

import { useMemo } from 'react'
import { useForecast } from '@/hooks/useForecast'
import type { BreakdownRow } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)

interface InsufficientRow {
  product_id: string
  product_name: string
  manufacturer_name: string
  spec_wp: number
  insufficient_months: number
  unscheduled_sale_kw: number
  unscheduled_construction_kw: number
  total_shortage_kw: number
}

export function InventoryInsufficientInsight() {
  const { data, loading } = useForecast()
  const products = data?.products ?? []

  const insufficientRows = useMemo<InsufficientRow[]>(() => {
    const rows: InsufficientRow[] = []
    for (const p of products) {
      const insufficientMonths = p.months.filter((m) => m.insufficient).length
      const usk = p.unscheduled.sale_kw
      const uck = p.unscheduled.construction_kw
      if (insufficientMonths === 0 && usk === 0 && uck === 0) continue
      // 부족 가중치 = insufficient 월의 음수 available_kw 합 + unscheduled
      const insufficientKw = p.months
        .filter((m) => m.insufficient)
        .reduce((sum, m) => sum + Math.max(0, -m.available_kw), 0)
      rows.push({
        product_id: p.product_id,
        product_name: p.product_name,
        manufacturer_name: p.manufacturer_name,
        spec_wp: p.spec_wp,
        insufficient_months: insufficientMonths,
        unscheduled_sale_kw: usk,
        unscheduled_construction_kw: uck,
        total_shortage_kw: insufficientKw + usk + uck,
      })
    }
    return rows.sort((a, b) => b.total_shortage_kw - a.total_shortage_kw)
  }, [products])

  const totalShortageKw = insufficientRows.reduce((sum, r) => sum + r.total_shortage_kw, 0)

  const byManufacturer = useMemo<BreakdownRow[]>(() => {
    const map = new Map<string, { value: number; count: number }>()
    for (const r of insufficientRows) {
      const cur = map.get(r.manufacturer_name) ?? { value: 0, count: 0 }
      cur.value += r.total_shortage_kw
      cur.count += 1
      map.set(r.manufacturer_name, cur)
    }
    const rows: BreakdownRow[] = []
    for (const [key, g] of map) {
      rows.push({
        key,
        label: key,
        value: g.value,
        share: totalShortageKw > 0 ? g.value / totalShortageKw : 0,
        count: g.count,
      })
    }
    rows.sort((a, b) => b.value - a.value)
    return rows.slice(0, 10)
  }, [insufficientRows, totalShortageKw])

  const byProduct = useMemo<BreakdownRow[]>(
    () =>
      insufficientRows.slice(0, 10).map((r) => ({
        key: r.product_id,
        label: `${r.product_name} (${r.manufacturer_name})`,
        value: r.total_shortage_kw,
        share: totalShortageKw > 0 ? r.total_shortage_kw / totalShortageKw : 0,
        count: r.insufficient_months,
      })),
    [insufficientRows, totalShortageKw],
  )

  const byReason = useMemo<BreakdownRow[]>(() => {
    const insufficient = insufficientRows.reduce(
      (s, r) => s + Math.max(0, r.total_shortage_kw - r.unscheduled_sale_kw - r.unscheduled_construction_kw),
      0,
    )
    const sale = insufficientRows.reduce((s, r) => s + r.unscheduled_sale_kw, 0)
    const construction = insufficientRows.reduce((s, r) => s + r.unscheduled_construction_kw, 0)
    const total = insufficient + sale + construction
    const mk = (key: string, label: string, value: number, count: number): BreakdownRow => ({
      key,
      label,
      value,
      share: total > 0 ? value / total : 0,
      count,
    })
    return [
      mk('insufficient', '월별 잔량 음수', insufficient, insufficientRows.length),
      mk('unscheduled_sale', '미예정 수주', sale, 0),
      mk('unscheduled_construction', '미예정 공사', construction, 0),
    ].filter((row) => row.value > 0)
  }, [insufficientRows])

  return (
    <InsightShell
      title="부족 예상 품목"
      subtitle="6개월 forecast 의 insufficient 월 + 미예정 수요 합 (MW) · 제조사/제품/사유 분해"
      unit="MW"
      tone="warn"
      backTo="/inventory"
      backLabel="재고로 돌아가기"
      loading={loading}
      totalLabel="총 부족 추정"
      totalValue={fmtMW(totalShortageKw)}
      trend={[]}
      trendValueLabel="부족"
      breakdowns={[
        { label: '사유 분해', rows: byReason, unit: 'MW', formatValue: fmtMW },
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'MW', formatValue: fmtMW },
        { label: '제품 상위 10', rows: byProduct, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
