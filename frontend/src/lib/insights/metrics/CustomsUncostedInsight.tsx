// 원가 미산정 면장 — cost_unit_price_wp/cif_krw 둘 다 없는 declarations.

import { useMemo } from 'react'
import { useDeclarationList } from '@/hooks/useCustoms'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtCount = (n: number) => String(Math.round(n))

export function CustomsUncostedInsight() {
  const { data: declarations, loading } = useDeclarationList()
  const uncosted = useMemo(
    () => declarations.filter((d) => d.cost_unit_price_wp == null && d.cif_krw == null),
    [declarations],
  )

  const trend = useMemo(() => trend24(uncosted, (d) => d.declaration_date), [uncosted])

  const byBl = useMemo(
    () =>
      breakdownBy(
        uncosted,
        (d) => d.bl_id,
        (d) => d.bl_number ?? d.bl_id.slice(0, 8),
        () => 1,
      ).slice(0, 10),
    [uncosted],
  )
  const bySupplier = useMemo(
    () =>
      breakdownBy(
        uncosted,
        (d) => d.supplier_name_kr ?? d.supplier_name_en ?? null,
        (d) => d.supplier_name_kr ?? d.supplier_name_en ?? '미지정',
        () => 1,
      ).slice(0, 10),
    [uncosted],
  )
  const byMonth = useMemo(
    () =>
      breakdownBy(
        uncosted,
        (d) => (d.declaration_date ?? '').slice(0, 7) || null,
        (d) => (d.declaration_date ?? '미지정').slice(0, 7) || '미지정',
        () => 1,
      ).slice(0, 12),
    [uncosted],
  )

  return (
    <InsightShell
      title="원가 미산정 면장"
      subtitle="cost_unit_price_wp / cif_krw 모두 비어있는 면장 · B/L·공급사·월 분해"
      unit="건"
      tone="warn"
      backTo="/customs"
      backLabel="면장으로 돌아가기"
      loading={loading}
      totalLabel="미산정"
      totalValue={fmtCount(uncosted.length)}
      trend={trend}
      trendValueLabel="원가 미산정"
      breakdowns={[
        { label: 'B/L 상위 10', rows: byBl, unit: '건' },
        { label: '공급사 상위 10', rows: bySupplier, unit: '건' },
        { label: '월별 (최근 12)', rows: byMonth, unit: '건' },
      ]}
    />
  )
}
