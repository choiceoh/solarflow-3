// 금년 출고 용량 (MW) 드릴다운 — 금년 누계 기준 분해 + 24개월 추이.

import { useMemo } from 'react'
import { useOutboundListAll } from '@/hooks/useOutbound'
import { USAGE_CATEGORY_LABEL } from '@/types/outbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)
const fmtMWTick = (kw: number) => `${(kw / 1000).toFixed(0)}`

export function OutboundKwYearInsight() {
  const { data, loading } = useOutboundListAll()

  const trend = useMemo(
    () => trend24(data, (o) => o.outbound_date, (o) => o.capacity_kw ?? 0),
    [data],
  )

  const yearItems = useMemo(() => {
    const yr = String(new Date().getFullYear())
    return data.filter((o) => (o.outbound_date ?? '').slice(0, 4) === yr)
  }, [data])

  const totalYearKw = yearItems.reduce((sum, o) => sum + (o.capacity_kw ?? 0), 0)

  const byUsage = useMemo(
    () => breakdownBy(
      yearItems,
      (o) => o.usage_category,
      (o) => USAGE_CATEGORY_LABEL[o.usage_category] ?? o.usage_category,
      (o) => o.capacity_kw ?? 0,
    ),
    [yearItems],
  )
  const byCustomer = useMemo(
    () => breakdownBy(
      yearItems,
      (o) => o.customer_id ?? null,
      (o) => o.customer_name ?? '미지정',
      (o) => o.capacity_kw ?? 0,
    ).slice(0, 10),
    [yearItems],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      yearItems,
      (o) => o.manufacturer_id ?? null,
      (o) => o.manufacturer_name ?? '미지정',
      (o) => o.capacity_kw ?? 0,
    ).slice(0, 10),
    [yearItems],
  )

  return (
    <InsightShell
      title="금년 출고 용량"
      subtitle={`${new Date().getFullYear()}년 누계 (단위 MW) · 24개월 추이 + 용도/거래처/제조사 분해`}
      unit="MW"
      tone="pos"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="금년 누계"
      totalValue={fmtMW(totalYearKw)}
      trend={trend}
      trendValueLabel="출고 용량 (kW)"
      formatTrend={fmtMWTick}
      breakdowns={[
        { label: '용도', rows: byUsage, unit: 'MW', formatValue: fmtMW },
        { label: '거래처 상위 10', rows: byCustomer, unit: 'MW', formatValue: fmtMW },
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'MW', formatValue: fmtMW },
      ]}
    />
  )
}
