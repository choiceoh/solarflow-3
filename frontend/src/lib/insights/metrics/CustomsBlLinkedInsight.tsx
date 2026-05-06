// B/L 연결 (건) 드릴다운 — bl_id 가 있는 부대비용의 월별 + B/L별 분해.

import { useMemo } from 'react'
import { useExpenseList } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsBlLinkedInsight() {
  const { data, loading } = useExpenseList()

  const linked = useMemo(() => data.filter((e) => e.bl_id), [data])

  const trend = useMemo(
    () => trend24(linked, (e) => e.month ?? null),
    [linked],
  )

  const byBl = useMemo(
    () => breakdownBy(
      linked,
      (e) => e.bl_id ?? null,
      (e) => e.bl_number ?? '미지정',
      (e) => e.total ?? e.amount ?? 0,
    ).slice(0, 10),
    [linked],
  )
  const byType = useMemo(
    () => breakdownBy(
      linked,
      (e) => e.expense_type,
      (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] ?? e.expense_type,
      () => 1,
    ),
    [linked],
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
      totalValue={linked.length.toLocaleString()}
      trend={trend}
      trendValueLabel="연결 건수"
      breakdowns={[
        { label: 'B/L 상위 10 (비용 합계)', rows: byBl, unit: '억', formatValue: fmtEok },
        { label: '비용 유형 (건수)', rows: byType, unit: '건' },
      ]}
    />
  )
}
