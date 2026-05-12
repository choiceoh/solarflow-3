// 활성 품목 (가용 KW > 0 인 SKU) 드릴다운 — 제조사/규격/장기재고 상태 별 품목 수.
// breakdown value 는 '품목 수' 로 보고, MW 단위 sum 분해는 InventoryTotalSecured 가 담당.

import { useMemo } from 'react'
import { useInventory } from '@/hooks/useInventory'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const LONG_TERM_LABEL: Record<'normal' | 'warning' | 'critical', string> = {
  normal: '정상',
  warning: '주의',
  critical: '위험',
}

export function InventoryProductCountInsight() {
  const { data, loading } = useInventory()
  const items = (data?.items ?? []).filter((it) => it.total_secured_kw > 0)

  const byManufacturer = useMemo(
    () =>
      breakdownBy(
        items,
        (it) => it.manufacturer_name,
        (it) => it.manufacturer_name,
        () => 1,
      ).slice(0, 10),
    [items],
  )
  const byWp = useMemo(
    () =>
      breakdownBy(
        items,
        (it) => String(it.spec_wp ?? 0),
        (it) => (it.spec_wp ? `${it.spec_wp}Wp` : '미지정'),
        () => 1,
      ).slice(0, 12),
    [items],
  )
  const byLongTerm = useMemo(
    () =>
      breakdownBy(
        items,
        (it) => it.long_term_status,
        (it) => LONG_TERM_LABEL[it.long_term_status] ?? it.long_term_status,
        () => 1,
      ),
    [items],
  )

  return (
    <InsightShell
      title="활성 품목"
      subtitle="가용 재고 보유 SKU · 제조사/규격/장기재고 상태 분해"
      unit="개"
      tone="ink"
      backTo="/inventory"
      backLabel="재고로 돌아가기"
      loading={loading}
      totalLabel="활성 SKU"
      totalValue={items.length.toLocaleString('ko-KR')}
      trend={[]}
      trendValueLabel="품목 수"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '개' },
        { label: '규격(Wp) 상위 12', rows: byWp, unit: '개' },
        { label: '장기재고 상태', rows: byLongTerm, unit: '개' },
      ]}
    />
  )
}
