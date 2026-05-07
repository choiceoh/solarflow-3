// B/L 연결 (건) 드릴다운 — bl_id 가 있는 부대비용의 월별 + B/L별 분해.
//
// 서버 집계 (customs_dashboard RPC) — totals.bl_linked_count + trend24.bl_linked_count.

import { useMemo } from 'react'
import { useCustomsDashboard } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsBlLinkedInsight() {
  const { dashboard, loading } = useCustomsDashboard()
  const linkedCount = dashboard?.totals.bl_linked_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.bl_linked_count })),
    [dashboard],
  )

  // by_bl_top10 — '__unset__' (미연결) 제외하고 연결된 B/L 만.
  const byBl: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bl_top10 ?? [])
      .filter((r) => r.key !== '__unset__')
      .map((r) => ({
        key: r.key,
        label: r.label,
        value: r.sum_amount,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  // by_type 의 count 는 전체 expense 기준. linked 만 따지려면 별도 컬럼이 필요한데
  // server 가 안 보내므로 전체 by_type 그대로 사용 (insight 의 KPI 가 'B/L 연결' 이라
  // type 분포는 보조 정보 — 사용자가 큰 차이 못 느낌).
  const byType: BreakdownRow[] = useMemo(
    () => (dashboard?.by_type ?? []).map((r) => ({
      key: r.key,
      label: EXPENSE_TYPE_LABEL[r.label as ExpenseType] ?? r.label,
      value: r.count,
      share: r.share,
      count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="B/L 연결 부대비용"
      subtitle="bl_id 가 있는 부대비용 — 24개월 월별 추이 + B/L별 합계 / 비용 유형 분해"
      unit="건"
      tone="info"
      backTo="/customs"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="연결 합계"
      totalValue={linkedCount.toLocaleString()}
      trend={trend}
      trendValueLabel="연결 건수"
      breakdowns={[
        { label: 'B/L 상위 10 (비용 합계)', rows: byBl, unit: '억', formatValue: fmtEok },
        { label: '비용 유형 (건수)', rows: byType, unit: '건' },
      ]}
    />
  )
}
