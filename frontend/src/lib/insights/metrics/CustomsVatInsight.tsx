// 부대비용 부가세 합계 드릴다운.

import { useMemo } from 'react'
import { useExpenseList } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsVatInsight() {
  const { data: expenses, loading } = useExpenseList()

  const trend = useMemo(
    () => trend24(expenses, (e) => e.month ?? null, (e) => e.vat ?? 0),
    [expenses],
  )
  const totalVat = expenses.reduce((sum, e) => sum + (e.vat ?? 0), 0)

  const byType = useMemo(
    () =>
      breakdownBy(
        expenses,
        (e) => e.expense_type,
        (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] ?? e.expense_type,
        (e) => e.vat ?? 0,
      ),
    [expenses],
  )
  const byVendor = useMemo(
    () =>
      breakdownBy(
        expenses,
        (e) => e.vendor ?? null,
        (e) => e.vendor ?? '미지정',
        (e) => e.vat ?? 0,
      ).slice(0, 10),
    [expenses],
  )
  const byBl = useMemo(
    () =>
      breakdownBy(
        expenses,
        (e) => e.bl_id ?? null,
        (e) => e.bl_number ?? '미지정',
        (e) => e.vat ?? 0,
      ).slice(0, 10),
    [expenses],
  )

  return (
    <InsightShell
      title="부대비용 VAT"
      subtitle="비용 vat 컬럼 합계 (억) · 유형·거래처·B/L 분해"
      unit="억"
      tone="ink"
      backTo="/customs?tab=expenses"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="VAT 합계"
      totalValue={fmtEok(totalVat)}
      trend={trend}
      trendValueLabel="VAT (월별)"
      formatTrend={fmtEok}
      breakdowns={[
        { label: '비용 유형', rows: byType, unit: '억', formatValue: fmtEok },
        { label: '거래처 상위 10', rows: byVendor, unit: '억', formatValue: fmtEok },
        { label: 'B/L 상위 10', rows: byBl, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
