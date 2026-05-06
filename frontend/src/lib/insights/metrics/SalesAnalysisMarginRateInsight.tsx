// 이익률 (%) 드릴다운 — /api/v1/calc/margin-analysis 의 items 기반.
// SalesAnalysisPage 의 KPI '이익률'. trend 는 margin 엔드포인트가 월별을 안 주므로 빈 배열.
// 실제 분해는 제조사·제품별 마진율.

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchCalc } from '@/lib/companyUtils'
import type { BreakdownRow } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

interface MarginItem {
  manufacturer_name: string
  product_code: string
  product_name: string
  spec_wp: number
  total_revenue_krw: number
  total_cost_krw?: number | null
  total_margin_krw?: number | null
  margin_rate?: number | null
  sale_count: number
}

interface MarginAnalysisResponse {
  items: MarginItem[]
  summary: {
    total_revenue_krw: number
    total_cost_krw: number
    total_margin_krw: number
    overall_margin_rate: number
    cost_basis: string
  }
}

const fmtPct = (v: number) => v.toFixed(1)

export function SalesAnalysisMarginRateInsight() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [data, setData] = useState<MarginAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedCompanyId) return
    let cancelled = false
    setLoading(true)
    fetchCalc<MarginAnalysisResponse>(selectedCompanyId, '/api/v1/calc/margin-analysis', {})
      .then((res) => { if (!cancelled) setData(res) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedCompanyId])

  const items = data?.items ?? []
  const totalRate = data?.summary.overall_margin_rate ?? 0

  // 제조사별 가중 평균 마진율 = sum(margin_krw) / sum(revenue_krw) * 100.
  const byManufacturer = useMemo<BreakdownRow[]>(() => {
    const map = new Map<string, { revenue: number; margin: number; count: number }>()
    for (const it of items) {
      const cur = map.get(it.manufacturer_name) ?? { revenue: 0, margin: 0, count: 0 }
      cur.revenue += it.total_revenue_krw
      cur.margin += it.total_margin_krw ?? 0
      cur.count += it.sale_count
      map.set(it.manufacturer_name, cur)
    }
    return Array.from(map.entries())
      .map(([k, g]) => ({
        key: k,
        label: k,
        value: g.revenue > 0 ? (g.margin / g.revenue) * 100 : 0,
        share: g.count,  // 표본 크기 — 표시는 비율로 변환
        count: g.count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [items])

  // 제품 마진율 상위 10 (원가가 있는 것만).
  const byProductTop = useMemo<BreakdownRow[]>(() =>
    items
      .filter((it) => it.margin_rate != null)
      .sort((a, b) => (b.margin_rate ?? 0) - (a.margin_rate ?? 0))
      .slice(0, 10)
      .map((it) => ({
        key: `${it.manufacturer_name}|${it.product_code}|${it.spec_wp}`,
        label: `${it.product_name} (${it.manufacturer_name})`,
        value: it.margin_rate ?? 0,
        share: 0,
        count: it.sale_count,
      })),
    [items],
  )

  // 제품 마진율 하위 10 — 마이너스 가능성 (적자 위험).
  const byProductBottom = useMemo<BreakdownRow[]>(() =>
    items
      .filter((it) => it.margin_rate != null)
      .sort((a, b) => (a.margin_rate ?? 0) - (b.margin_rate ?? 0))
      .slice(0, 10)
      .map((it) => ({
        key: `${it.manufacturer_name}|${it.product_code}|${it.spec_wp}`,
        label: `${it.product_name} (${it.manufacturer_name})`,
        value: it.margin_rate ?? 0,
        share: 0,
        count: it.sale_count,
      })),
    [items],
  )

  const tone: 'pos' | 'info' | 'warn' = totalRate >= 15 ? 'pos' : totalRate >= 5 ? 'info' : 'warn'

  return (
    <InsightShell
      title="이익률"
      subtitle="(매출 - 원가) / 매출 · 제조사·제품별 가중 평균. 원가 미보유 항목은 분해에서 제외."
      unit="%"
      tone={tone}
      backTo="/sales-analysis"
      backLabel="매출 분석으로 돌아가기"
      loading={loading}
      totalLabel="전체 이익률"
      totalValue={fmtPct(totalRate)}
      trend={[]}
      trendValueLabel="이익률"
      breakdowns={[
        { label: '제조사 (높은순)', rows: byManufacturer, unit: '%', formatValue: fmtPct },
        { label: '제품 상위 10 (높은순)', rows: byProductTop, unit: '%', formatValue: fmtPct },
        { label: '제품 하위 10 (위험)', rows: byProductBottom, unit: '%', formatValue: fmtPct },
      ]}
    />
  )
}
