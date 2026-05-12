// 수입 용량 (declarations capacity_kw 합계) 드릴다운.

import { useMemo } from 'react'
import { useDeclarationList } from '@/hooks/useCustoms'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtKw = (kw: number) => kw.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
const fmtMw = (kw: number) => (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)

export function CustomsCapacityInsight() {
  const { data: declarations, loading } = useDeclarationList()

  const trend = useMemo(
    () => trend24(declarations, (d) => d.declaration_date, (d) => d.capacity_kw ?? 0),
    [declarations],
  )
  const totalKw = declarations.reduce((sum, d) => sum + (d.capacity_kw ?? 0), 0)

  const byBl = useMemo(
    () =>
      breakdownBy(
        declarations,
        (d) => d.bl_id,
        (d) => d.bl_number ?? d.bl_id.slice(0, 8),
        (d) => d.capacity_kw ?? 0,
      ).slice(0, 10),
    [declarations],
  )
  const bySupplier = useMemo(
    () =>
      breakdownBy(
        declarations,
        (d) => d.supplier_name_kr ?? d.supplier_name_en ?? null,
        (d) => d.supplier_name_kr ?? d.supplier_name_en ?? '미지정',
        (d) => d.capacity_kw ?? 0,
      ).slice(0, 10),
    [declarations],
  )

  return (
    <InsightShell
      title="수입 용량"
      subtitle={`면장 capacity_kw 합계 ${fmtKw(totalKw)} kW (${fmtMw(totalKw)} MW) · B/L·공급사 분해`}
      unit="kW"
      tone="info"
      backTo="/customs"
      backLabel="면장으로 돌아가기"
      loading={loading}
      totalLabel="용량 합계"
      totalValue={fmtKw(totalKw)}
      trend={trend}
      trendValueLabel="수입 용량 (월별 kW)"
      formatTrend={fmtKw}
      breakdowns={[
        { label: 'B/L 상위 10', rows: byBl, unit: 'kW', formatValue: fmtKw },
        { label: '공급사 상위 10', rows: bySupplier, unit: 'kW', formatValue: fmtKw },
      ]}
    />
  )
}
