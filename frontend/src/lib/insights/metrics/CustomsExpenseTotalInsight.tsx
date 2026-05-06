// 부대비용 합계 (억) 드릴다운 — CustomsPage 부대비용 탭 KPI '부대비용'.

import { useMemo } from 'react'
import { useExpenseList } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function CustomsExpenseTotalInsight() {
  const { data, loading } = useExpenseList()

  const trend = useMemo(
    () => trend24(data, (e) => e.month ?? null, (e) => e.total ?? e.amount ?? 0),
    [data],
  )
  const totalSum = data.reduce((sum, e) => sum + (e.total ?? e.amount ?? 0), 0)

  const byType = useMemo(
    () => breakdownBy(
      data,
      (e) => e.expense_type,
      (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] ?? e.expense_type,
      (e) => e.total ?? e.amount ?? 0,
    ),
    [data],
  )
  const byBl = useMemo(
    () => breakdownBy(
      data,
      (e) => e.bl_id ?? null,
      (e) => e.bl_number ?? '미연결',
      (e) => e.total ?? e.amount ?? 0,
    ).slice(0, 10),
    [data],
  )
  const byVendor = useMemo(
    () => breakdownBy(
      data,
      (e) => e.vendor ?? null,
      (e) => e.vendor ?? '미지정',
      (e) => e.total ?? e.amount ?? 0,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="부대비용"
      subtitle="24개월 월별 부대비용 추이 (단위 억) · 비용 유형/B/L/거래처 분해"
      unit="억"
      tone="solar"
      backTo="/customs"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSum)}
      trend={trend}
      trendValueLabel="부대비용"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '비용 유형', rows: byType, unit: '억', formatValue: fmtEok },
        { label: 'B/L 상위 10', rows: byBl, unit: '억', formatValue: fmtEok },
        { label: '거래처 상위 10', rows: byVendor, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
