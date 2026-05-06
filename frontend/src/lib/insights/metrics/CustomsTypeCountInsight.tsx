// 비용 유형 (종) 드릴다운 — distinct expense_type 추이 + 유형별 건수/합계.

import { useMemo } from 'react'
import { useExpenseList } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import { breakdownBy, trend24Distinct } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsTypeCountInsight() {
  const { data, loading } = useExpenseList()

  const trend = useMemo(
    () => trend24Distinct(data, (e) => e.month ?? null, (e) => e.expense_type),
    [data],
  )
  const totalDistinct = useMemo(
    () => new Set(data.map((e) => e.expense_type)).size,
    [data],
  )

  const byTypeAmount = useMemo(
    () => breakdownBy(
      data,
      (e) => e.expense_type,
      (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] ?? e.expense_type,
      (e) => e.total ?? e.amount ?? 0,
    ),
    [data],
  )
  const byTypeCount = useMemo(
    () => breakdownBy(
      data,
      (e) => e.expense_type,
      (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] ?? e.expense_type,
      () => 1,
    ),
    [data],
  )

  return (
    <InsightShell
      title="비용 유형"
      subtitle="월별 distinct 비용 유형 추이 + 유형별 합계 / 건수"
      unit="종"
      tone="warn"
      backTo="/customs"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="누적 유형"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 유형"
      breakdowns={[
        { label: '비용 유형 (합계)', rows: byTypeAmount, unit: '억', formatValue: fmtEok },
        { label: '비용 유형 (건수)', rows: byTypeCount, unit: '건' },
      ]}
    />
  )
}
