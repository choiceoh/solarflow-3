// 계산서 연결률 드릴다운 — 매출 대상 출고 중 sale 레코드가 연결된 비율.
// 트렌드: 월별 연결률 (%) · 분해: 거래처/제조사/용도 별 연결률.
//
// 서버 집계 마이그(C-1) 후: useOutboundDashboard 의 sale_conversion 필드 사용.

import { useMemo } from 'react'
import { useOutboundDashboard } from '@/hooks/useOutbound'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtPct = (v: number) => v.toFixed(1)

export function SaleConversionInsight() {
  const { dashboard, loading } = useOutboundDashboard({ period: 'lifetime' })

  const sc = dashboard?.sale_conversion

  // 월별 연결률 = (그 달 linked) / (그 달 eligible) * 100
  const trend: TrendPoint[] = useMemo(() => {
    if (!sc) return []
    return sc.monthly.map((p) => ({
      month: p.month,
      value: p.eligible_count > 0
        ? Math.round((p.linked_count / p.eligible_count) * 1000) / 10
        : 0,
    }))
  }, [sc])

  const totalRate = sc && sc.eligible_count > 0
    ? Math.round((sc.linked_count / sc.eligible_count) * 1000) / 10
    : 0

  // 매출 대상이 적은 차원은 노이즈 — 3건 이상만 보여준다 (이전 동작 유지).
  const toBreakdownRows = (rows: { key: string; label: string; eligible_count: number; linked_count: number; rate: number }[] | undefined): BreakdownRow[] =>
    (rows ?? [])
      .filter((r) => r.eligible_count >= 3)
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.rate,
        // share = 이 차원이 전체 매출대상에서 차지하는 가중치 — 비율(%) 메트릭이라 별도 의미.
        share: sc && sc.eligible_count > 0 ? r.eligible_count / sc.eligible_count : 0,
        count: r.eligible_count,
      }))

  const byCustomer = useMemo(() => toBreakdownRows(sc?.by_customer_top10), [sc])
  const byManufacturer = useMemo(() => toBreakdownRows(sc?.by_manufacturer_top10), [sc])
  const byUsage = useMemo(() => toBreakdownRows(sc?.by_usage), [sc])

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
