// 계산서 발행률 (%) 드릴다운 — tax_invoice_date 가 있는 매출 비율.
// SalesAnalysisPage 의 KPI '계산서 발행률'.

import { useMemo } from 'react'
import { useSaleListAll } from '@/hooks/useOutbound'
import type { SaleListItem } from '@/types/outbound'
import type { BreakdownRow } from '@/lib/insights/aggregations'
import { trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtPct = (v: number) => v.toFixed(1)
const taxDate = (s: SaleListItem) => s.tax_invoice_date ?? s.sale?.tax_invoice_date ?? null
const baseDate = (s: SaleListItem) => s.outbound_date ?? s.order_date ?? null

interface Group {
  key: string
  label: string
  total: number
  issued: number
}

function groupRate(
  items: readonly SaleListItem[],
  getKey: (s: SaleListItem) => string | null | undefined,
  getLabel: (s: SaleListItem) => string,
  minCount = 3,
): BreakdownRow[] {
  const map = new Map<string, Group>()
  let totalCount = 0
  for (const s of items) {
    const key = getKey(s) || '__unset__'
    const cur = map.get(key) ?? { key, label: getLabel(s), total: 0, issued: 0 }
    cur.total += 1
    if (taxDate(s)) cur.issued += 1
    map.set(key, cur)
    totalCount += 1
  }
  const rows: BreakdownRow[] = []
  for (const [key, g] of map) {
    if (g.total < minCount) continue
    const rate = g.total > 0 ? (g.issued / g.total) * 100 : 0
    rows.push({
      key,
      label: g.label,
      value: rate,
      share: totalCount > 0 ? g.total / totalCount : 0,
      count: g.total,
    })
  }
  return rows.sort((a, b) => a.value - b.value)  // 발행률 낮은 순 (위험 거래처)
}

export function SalesAnalysisIssueRateInsight() {
  const { data, loading } = useSaleListAll()

  const trend = useMemo(() => {
    const totals = trend24(data, baseDate)
    const issued = trend24(data, baseDate, (s) => (taxDate(s) ? 1 : 0))
    return totals.map((p, i) => ({
      month: p.month,
      value: p.value > 0 ? Math.round(((issued[i]?.value ?? 0) / p.value) * 1000) / 10 : 0,
    }))
  }, [data])

  const totalCount = data.length
  const issuedCount = data.filter(taxDate).length
  const totalRate = totalCount > 0 ? Math.round((issuedCount / totalCount) * 1000) / 10 : 0

  const byCustomer = useMemo(
    () => groupRate(data, (s) => s.customer_id, (s) => s.customer_name ?? '미지정').slice(0, 10),
    [data],
  )
  const byManufacturer = useMemo(
    () => groupRate(data, (s) => s.manufacturer_id ?? null, (s) => s.manufacturer_name ?? '미지정').slice(0, 10),
    [data],
  )

  const tone: 'pos' | 'info' | 'warn' = totalRate >= 90 ? 'pos' : totalRate >= 70 ? 'info' : 'warn'

  return (
    <InsightShell
      title="계산서 발행률"
      subtitle="tax_invoice_date 가 있는 매출 비율 · 24개월 월별 + 거래처/제조사 발행률 (3건↑, 낮은순)"
      unit="%"
      tone={tone}
      backTo="/sales-analysis"
      backLabel="매출 분석으로 돌아가기"
      loading={loading}
      totalLabel="전체 발행률"
      totalValue={fmtPct(totalRate)}
      trend={trend}
      trendValueLabel="발행률"
      formatTrend={fmtPct}
      breakdowns={[
        { label: '거래처 (낮은순)', rows: byCustomer, unit: '%', formatValue: fmtPct },
        { label: '제조사 (낮은순)', rows: byManufacturer, unit: '%', formatValue: fmtPct },
      ]}
    />
  )
}
