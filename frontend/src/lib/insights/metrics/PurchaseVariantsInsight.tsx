// 변경계약 (건) 드릴다운 — parent_po_id != null 인 PO. 제조사별 + 원계약별 분해.

import { useMemo } from 'react'
import { usePOList } from '@/hooks/useProcurement'
import { buildChains } from '@/lib/purchaseHistory'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function PurchaseVariantsInsight() {
  const { data: pos, loading } = usePOList()

  // 변경계약 = chain.pos[1..] (head 제외).
  const variants = useMemo(() => {
    const chains = buildChains(pos)
    return chains.flatMap((c) => c.pos.slice(1).map((p) => ({ ...p, _head_po_number: c.head.po_number ?? c.head.po_id, _head_po_id: c.head.po_id, _manufacturer_name: c.manufacturer_name ?? '미지정' })))
  }, [pos])

  const trend = useMemo(
    () => trend24(variants, (p) => p.contract_date ?? null),
    [variants],
  )

  const byManufacturer = useMemo(
    () => breakdownBy(
      variants,
      (p) => p._manufacturer_name,
      (p) => p._manufacturer_name,
      () => 1,
    ).slice(0, 10),
    [variants],
  )
  const byHeadPo = useMemo(
    () => breakdownBy(
      variants,
      (p) => p._head_po_id,
      (p) => p._head_po_number,
      () => 1,
    ).slice(0, 10),
    [variants],
  )

  return (
    <InsightShell
      title="변경계약"
      subtitle="원계약(head)이 아닌 추가 PO — 24개월 추이 + 제조사/원계약별 분해"
      unit="건"
      tone="warn"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="변경 합계"
      totalValue={variants.length.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 변경"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '원계약별 변경 수 상위 10', rows: byHeadPo, unit: '건' },
      ]}
    />
  )
}
