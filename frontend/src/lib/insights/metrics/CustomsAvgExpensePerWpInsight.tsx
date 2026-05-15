// Wp당 평균 부대비용 — 외부 KPI 타일 (CustomsPage '평균 비용') 과 동일 정의로 드릴다운.
// 분자=부대비용 합계, 분모=면장 합계 용량(Wp). B/L별·면장별·비용 유형별 Wp 단가 분해.

import { useMemo } from 'react'
import { useExpenseList, useDeclarationList } from '@/hooks/useCustoms'
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtWp = (v: number) => v.toFixed(2)
const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsAvgExpensePerWpInsight() {
  const { data: expenses, loading: expLoading } = useExpenseList()
  const { data: declarations, loading: declLoading } = useDeclarationList()

  const totalExpense = expenses.reduce(
    (sum, e) => sum + (e.total ?? e.amount ?? 0),
    0,
  )
  const totalCapacityWp = declarations.reduce(
    (sum, d) => sum + (d.capacity_kw ?? 0) * 1000,
    0,
  )
  const avgPerWp = totalCapacityWp > 0 ? totalExpense / totalCapacityWp : 0

  // B/L 단위: 그 B/L 의 비용 합계 / 그 B/L 의 면장 용량 합계.
  const byBl: BreakdownRow[] = useMemo(() => {
    const blExpense = new Map<string, number>()
    for (const e of expenses) {
      if (!e.bl_id) continue
      blExpense.set(e.bl_id, (blExpense.get(e.bl_id) ?? 0) + (e.total ?? e.amount ?? 0))
    }
    const blCap = new Map<string, { wp: number; label: string }>()
    for (const d of declarations) {
      if (!d.bl_id) continue
      const wp = (d.capacity_kw ?? 0) * 1000
      const cur = blCap.get(d.bl_id) ?? {
        wp: 0,
        label: d.bl_number ?? d.bl_id.slice(0, 8),
      }
      cur.wp += wp
      blCap.set(d.bl_id, cur)
    }
    const rows: BreakdownRow[] = []
    let total = 0
    for (const [blId, { wp, label }] of blCap) {
      if (wp <= 0) continue
      const cost = blExpense.get(blId) ?? 0
      const v = cost / wp
      rows.push({ key: blId, label, value: v, share: 0, count: 1 })
      total += v
    }
    for (const r of rows) r.share = total > 0 ? r.value / total : 0
    rows.sort((a, b) => b.value - a.value)
    return rows.slice(0, 10)
  }, [expenses, declarations])

  // 면장 단위: B/L 비용을 그 B/L 의 면장 수로 균등 분배한 cost / 면장 용량(Wp). 1차 근사.
  const byDecl: BreakdownRow[] = useMemo(() => {
    const blExpense = new Map<string, number>()
    for (const e of expenses) {
      if (!e.bl_id) continue
      blExpense.set(e.bl_id, (blExpense.get(e.bl_id) ?? 0) + (e.total ?? e.amount ?? 0))
    }
    const blDeclCount = new Map<string, number>()
    for (const d of declarations) {
      if (!d.bl_id) continue
      blDeclCount.set(d.bl_id, (blDeclCount.get(d.bl_id) ?? 0) + 1)
    }
    const rows: BreakdownRow[] = []
    let total = 0
    for (const d of declarations) {
      const wp = (d.capacity_kw ?? 0) * 1000
      if (wp <= 0 || !d.bl_id) continue
      const blTotal = blExpense.get(d.bl_id) ?? 0
      const cnt = blDeclCount.get(d.bl_id) ?? 1
      const v = blTotal / cnt / wp
      rows.push({
        key: d.declaration_id,
        label: d.declaration_number ?? d.declaration_id.slice(0, 8),
        value: v,
        share: 0,
        count: 1,
      })
      total += v
    }
    for (const r of rows) r.share = total > 0 ? r.value / total : 0
    rows.sort((a, b) => b.value - a.value)
    return rows.slice(0, 10)
  }, [expenses, declarations])

  // 비용 유형별 Wp 기여 — 유형 비용 합 / 전체 용량. 합산하면 헤더 평균과 일치.
  const byType: BreakdownRow[] = useMemo(() => {
    if (totalCapacityWp <= 0) return []
    const typeSum = new Map<string, number>()
    for (const e of expenses) {
      const cur = typeSum.get(e.expense_type) ?? 0
      typeSum.set(e.expense_type, cur + (e.total ?? e.amount ?? 0))
    }
    const rows: BreakdownRow[] = []
    let total = 0
    for (const [type, sum] of typeSum) {
      const v = sum / totalCapacityWp
      rows.push({
        key: type,
        label: EXPENSE_TYPE_LABEL[type as ExpenseType] ?? type,
        value: v,
        share: 0,
        count: 1,
      })
      total += v
    }
    for (const r of rows) r.share = total > 0 ? r.value / total : 0
    rows.sort((a, b) => b.value - a.value)
    return rows
  }, [expenses, totalCapacityWp])

  return (
    <InsightShell
      title="Wp당 평균 부대비용"
      subtitle={`비용 ${fmtEok(totalExpense)}억 / 용량 ${totalCapacityWp.toLocaleString('ko-KR')} Wp = ${avgPerWp.toFixed(2)} 원/Wp (B/L 균등 분배 근사)`}
      unit="원/Wp"
      tone="ink"
      backTo="/customs"
      backLabel="면장으로 돌아가기"
      loading={expLoading || declLoading}
      totalLabel="평균/Wp"
      totalValue={avgPerWp.toFixed(2)}
      trend={[]}
      trendValueLabel="원/Wp"
      breakdowns={[
        { label: 'B/L Wp 단가 상위 10', rows: byBl, unit: '원/Wp', formatValue: fmtWp },
        { label: '면장 Wp 단가 상위 10', rows: byDecl, unit: '원/Wp', formatValue: fmtWp },
        { label: '유형 Wp 기여', rows: byType, unit: '원/Wp', formatValue: fmtWp },
      ]}
    />
  )
}
