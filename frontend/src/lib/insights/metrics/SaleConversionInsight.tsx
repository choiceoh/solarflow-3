// 계산서 연결률 드릴다운 — 매출 대상 출고 중 sale 레코드가 연결된 비율.
// 트렌드: 월별 연결률 (%) · 분해: 거래처/제조사/용도 별 연결률.

import { useMemo } from 'react'
import { useOutboundListAll } from '@/hooks/useOutbound'
import { USAGE_CATEGORY_LABEL } from '@/types/outbound'
import type { Outbound } from '@/types/outbound'
import { trend24 } from '@/lib/insights/aggregations'
import type { BreakdownRow } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const isSaleEligible = (o: Outbound) => o.usage_category === 'sale' || o.usage_category === 'sale_spare'
const fmtPct = (v: number) => v.toFixed(1)

interface ConversionGroup {
  key: string
  label: string
  total: number
  linked: number
}

function groupConversion(
  items: readonly Outbound[],
  getKey: (o: Outbound) => string | null | undefined,
  getLabel: (o: Outbound) => string,
): BreakdownRow[] {
  const map = new Map<string, ConversionGroup>()
  let totalEligible = 0
  for (const o of items) {
    const key = getKey(o) || '__unset__'
    const cur = map.get(key) ?? { key, label: getLabel(o), total: 0, linked: 0 }
    cur.total += 1
    if (o.sale) cur.linked += 1
    map.set(key, cur)
    totalEligible += 1
  }
  const rows: BreakdownRow[] = []
  for (const [key, g] of map) {
    const rate = g.total > 0 ? (g.linked / g.total) * 100 : 0
    rows.push({
      key,
      label: g.label,
      value: rate,
      // share = 이 차원이 전체 매출대상에서 차지하는 가중치 — 비율(%) 메트릭이라 별도 의미.
      share: totalEligible > 0 ? g.total / totalEligible : 0,
      count: g.total,
    })
  }
  // 매출 대상이 적은 차원은 노이즈 — 3건 이상만 보여준다.
  return rows.filter((r) => r.count >= 3).sort((a, b) => b.value - a.value)
}

export function SaleConversionInsight() {
  const { data, loading } = useOutboundListAll()

  const eligible = useMemo(() => data.filter(isSaleEligible), [data])
  const linked = useMemo(() => eligible.filter((o) => o.sale), [eligible])

  // 월별 연결률 = (그 달 linked) / (그 달 eligible) * 100
  const trend = useMemo(() => {
    const tot = trend24(eligible, (o) => o.outbound_date)
    const lnk = trend24(linked, (o) => o.outbound_date)
    return tot.map((p, i) => ({
      month: p.month,
      value: p.value > 0 ? Math.round(((lnk[i]?.value ?? 0) / p.value) * 1000) / 10 : 0,
    }))
  }, [eligible, linked])

  const totalRate = eligible.length > 0
    ? Math.round((linked.length / eligible.length) * 1000) / 10
    : 0

  const byCustomer = useMemo(
    () => groupConversion(
      eligible,
      (o) => o.customer_id ?? null,
      (o) => o.customer_name ?? '미지정',
    ).slice(0, 10),
    [eligible],
  )
  const byManufacturer = useMemo(
    () => groupConversion(
      eligible,
      (o) => o.manufacturer_id ?? null,
      (o) => o.manufacturer_name ?? '미지정',
    ).slice(0, 10),
    [eligible],
  )
  const byUsage = useMemo(
    () => groupConversion(
      eligible,
      (o) => o.usage_category,
      (o) => USAGE_CATEGORY_LABEL[o.usage_category] ?? o.usage_category,
    ),
    [eligible],
  )

  const tone: 'pos' | 'info' | 'warn' = totalRate >= 90 ? 'pos' : totalRate >= 60 ? 'info' : 'warn'

  return (
    <InsightShell
      title="계산서 연결률"
      subtitle="매출 대상 출고 중 sale 레코드가 연결된 비율 (24개월 월별 + 차원별 분해, 3건 이상만)"
      unit="%"
      tone={tone}
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="전체 연결률"
      totalValue={fmtPct(totalRate)}
      trend={trend}
      trendValueLabel="연결률"
      formatTrend={fmtPct}
      breakdowns={[
        { label: '용도', rows: byUsage, unit: '%', formatValue: fmtPct },
        { label: '거래처 상위 10', rows: byCustomer, unit: '%', formatValue: fmtPct },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '%', formatValue: fmtPct },
      ]}
    />
  )
}
