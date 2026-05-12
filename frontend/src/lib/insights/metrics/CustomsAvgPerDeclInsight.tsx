// 면장당 평균 부대비용 — 모든 비용 합계 / 면장 건수.
// 면장에 매칭된 비용을 면장 단위로 집계 후, 면장별 합계 분포 + 평균 표시.

import { useMemo } from 'react'
import { useExpenseList, useDeclarationList } from '@/hooks/useCustoms'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)

export function CustomsAvgPerDeclInsight() {
  const { data: expenses, loading: expLoading } = useExpenseList()
  const { data: declarations, loading: declLoading } = useDeclarationList()

  const totalExpense = expenses.reduce((sum, e) => sum + (e.total ?? e.amount ?? 0), 0)
  const declCount = declarations.length
  const avg = declCount > 0 ? totalExpense / declCount : 0

  // 면장 → 부대비용 매핑 (bl_id 공통). 비용 분배 추정치라 1차 근사.
  const byDecl = useMemo(() => {
    const blToCost = new Map<string, number>()
    for (const e of expenses) {
      if (!e.bl_id) continue
      const cur = blToCost.get(e.bl_id) ?? 0
      blToCost.set(e.bl_id, cur + (e.total ?? e.amount ?? 0))
    }
    // 동일 BL 의 비용은 그 BL 의 면장 수로 균등 분배 (단순 근사).
    const blDeclCount = new Map<string, number>()
    for (const d of declarations) {
      if (!d.bl_id) continue
      blDeclCount.set(d.bl_id, (blDeclCount.get(d.bl_id) ?? 0) + 1)
    }
    const rows = declarations.map((d) => {
      const blTotal = blToCost.get(d.bl_id) ?? 0
      const cnt = blDeclCount.get(d.bl_id) ?? 1
      return {
        key: d.declaration_id,
        label: d.declaration_number ?? d.declaration_id.slice(0, 8),
        capacity_kw: d.capacity_kw ?? 0,
        cost: blTotal / cnt,
      }
    })
    return breakdownBy(
      rows,
      (r) => r.key,
      (r) => r.label,
      (r) => r.cost,
    ).slice(0, 10)
  }, [expenses, declarations])

  return (
    <InsightShell
      title="면장당 평균"
      subtitle={`전체 비용 ${fmtEok(totalExpense)}억 / 면장 ${declCount.toLocaleString()}건 = ${fmtEok(avg)}억/면장. 면장별 분포 (B/L 균등 분배 근사)`}
      unit="억"
      tone="ink"
      backTo="/customs"
      backLabel="면장으로 돌아가기"
      loading={expLoading || declLoading}
      totalLabel="평균/면장"
      totalValue={fmtEok(avg)}
      trend={[]}
      trendValueLabel="평균"
      breakdowns={[
        { label: '면장별 비용 상위 10', rows: byDecl, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
