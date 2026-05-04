// 전월 출고 용량 (MW) 드릴다운 — 24개월 트렌드 + 차원별 분해.
// "전월" 자체는 단일 값이지만, 드릴다운 화면은 더 큰 컨텍스트 (24개월 추이 + 거래처/제조사) 를 보여준다.

import { useMemo } from 'react'
import { useOutboundListAll } from '@/hooks/useOutbound'
import { USAGE_CATEGORY_LABEL } from '@/types/outbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtMW = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)
const fmtMWTick = (kw: number) => `${(kw / 1000).toFixed(0)}`

export function OutboundKwInsight() {
  const { data, loading } = useOutboundListAll()

  const trend = useMemo(
    () => trend24(data, (o) => o.outbound_date, (o) => o.capacity_kw ?? 0),
    [data],
  )

  // 전월 기간만 필터링해서 breakdown — 화면 의미와 일치.
  const prevMonthItems = useMemo(() => {
    const today = new Date()
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const tag = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    return data.filter((o) => (o.outbound_date ?? '').slice(0, 7) === tag)
  }, [data])

  const totalPrevKw = prevMonthItems.reduce((sum, o) => sum + (o.capacity_kw ?? 0), 0)

  const byUsage = useMemo(
    () => breakdownBy(
      prevMonthItems,
      (o) => o.usage_category,
      (o) => USAGE_CATEGORY_LABEL[o.usage_category] ?? o.usage_category,
      (o) => o.capacity_kw ?? 0,
    ),
    [prevMonthItems],
  )
  const byCustomer = useMemo(
    () => breakdownBy(
      prevMonthItems,
      (o) => o.customer_id ?? null,
      (o) => o.customer_name ?? '미지정',
      (o) => o.capacity_kw ?? 0,
    ).slice(0, 10),
    [prevMonthItems],
  )
  const byManufacturer = useMemo(
    () => breakdownBy(
      prevMonthItems,
      (o) => o.manufacturer_id ?? null,
      (o) => o.manufacturer_name ?? '미지정',
      (o) => o.capacity_kw ?? 0,
    ).slice(0, 10),
    [prevMonthItems],
  )

  return (
    <InsightShell
      title="전월 출고 용량"
      subtitle="24개월 추이 (단위 MW) · 전월 출고분의 용도·거래처·제조사 분해"
      unit="MW"
      tone="ink"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="전월 합계"
      totalValue={fmtMW(totalPrevKw)}
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
