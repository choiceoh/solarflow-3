// 평균 비용 (억) 드릴다운 — 건당 평균 + 유형별/B/L별/거래처별 평균.

import { useMemo } from 'react'
import { useExpenseList } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import { breakdownAvg, trend24Average } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function CustomsAvgExpenseInsight() {
  const { data, loading } = useExpenseList()

  const trend = useMemo(
    () => trend24Average(data, (e) => e.month ?? null, (e) => e.total ?? e.amount ?? 0),
    [data],
  )
  const overallAvg = data.length > 0
    ? data.reduce((sum, e) => sum + (e.total ?? e.amount ?? 0), 0) / data.length
    : 0

  const byType = useMemo(
    () => breakdownAvg(
      data,
      (e) => e.expense_type,
      (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] ?? e.expense_type,
      (e) => e.total ?? e.amount ?? 0,
    ),
    [data],
  )
  const byBl = useMemo(
    () => breakdownAvg(
      data,
      (e) => e.bl_id ?? null,
      (e) => e.bl_number ?? '미연결',
      (e) => e.total ?? e.amount ?? 0,
      3,
    ).slice(0, 10),
    [data],
  )
  const byVendor = useMemo(
    () => breakdownAvg(
      data,
      (e) => e.vendor ?? null,
      (e) => e.vendor ?? '미지정',
      (e) => e.total ?? e.amount ?? 0,
      3,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="평균 부대비용"
      subtitle="건당 평균 (억) · 24개월 월별 평균 + 유형/B/L/거래처별 평균 (3건↑)"
      unit="억"
      tone="ink"
      backTo="/customs"
      backLabel="부대비용으로 돌아가기"
      loading={loading}
      totalLabel="전체 평균"
      totalValue={fmtEok(overallAvg)}
      trend={trend}
      trendValueLabel="평균 비용"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '비용 유형 평균', rows: byType, unit: '억', formatValue: fmtEok },
        { label: 'B/L 평균 상위 10 (3건↑)', rows: byBl, unit: '억', formatValue: fmtEok },
        { label: '거래처 평균 상위 10 (3건↑)', rows: byVendor, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
