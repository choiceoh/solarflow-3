// B/L 미연결 비용 (Expense without bl_id) 드릴다운.

import { useMemo } from 'react'
import { useExpenseList } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtCount = (n: number) => String(Math.round(n))
const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsUnlinkedExpenseInsight() {
  const { data: expenses, loading } = useExpenseList()
  const unlinked = useMemo(() => expenses.filter((e) => !e.bl_id), [expenses])

  const trend = useMemo(
    () => trend24(unlinked, (e) => e.month ?? null, (e) => e.total ?? e.amount ?? 0),
    [unlinked],
  )

  const byType = useMemo(
    () =>
      breakdownBy(
        unlinked,
        (e) => e.expense_type,
        (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] ?? e.expense_type,
        (e) => e.total ?? e.amount ?? 0,
      ),
    [unlinked],
  )
  const byVendor = useMemo(
    () =>
      breakdownBy(
        unlinked,
        (e) => e.vendor ?? null,
        (e) => e.vendor ?? '미지정',
        (e) => e.total ?? e.amount ?? 0,
      ).slice(0, 10),
    [unlinked],
  )

  const totalAmount = unlinked.reduce((sum, e) => sum + (e.total ?? e.amount ?? 0), 0)

  return (
    <InsightShell
      title="B/L 미연결 비용"
      subtitle={`bl_id 가 비어있는 부대비용 ${fmtCount(unlinked.length)}건 · 합계 ${fmtEok(totalAmount)}억. 비용 유형·거래처 분해`}
      unit="건"
      tone="warn"
      backTo="/customs?tab=expenses"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="미연결"
      totalValue={fmtCount(unlinked.length)}
      trend={trend}
      trendValueLabel="미연결 비용 (월별 금액)"
      formatTrend={fmtEok}
      breakdowns={[
        { label: '비용 유형 (금액)', rows: byType, unit: '억', formatValue: fmtEok },
        { label: '거래처 상위 10 (금액)', rows: byVendor, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
