// 계약 체인 (건) 드릴다운 — head PO 만 카운트. 제조사별 + 변경 포함 여부 분해.

import { useMemo } from 'react'
import { usePOList } from '@/hooks/useProcurement'
import { buildChains } from '@/lib/purchaseHistory'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function PurchaseChainsInsight() {
  const { data: pos, loading } = usePOList()

  const chains = useMemo(() => buildChains(pos), [pos])

  // head PO contract_date 월별.
  const trend = useMemo(
    () => trend24(chains, (c) => c.head.contract_date ?? null),
    [chains],
  )

  const byManufacturer = useMemo(
    () => breakdownBy(
      chains,
      (c) => c.manufacturer_id,
      (c) => c.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [chains],
  )

  // 변경 포함 vs 단일 체인.
  const byVariantStatus = useMemo(() => {
    const withVariants = chains.filter((c) => c.pos.length > 1).length
    const single = chains.length - withVariants
    const total = chains.length
    return [
      { key: 'with_variants', label: '변경계약 포함', value: withVariants, share: total > 0 ? withVariants / total : 0, count: withVariants },
      { key: 'single', label: '단일 체인', value: single, share: total > 0 ? single / total : 0, count: single },
    ]
  }, [chains])

  return (
    <InsightShell
      title="계약 체인"
      subtitle="head PO 기준 계약 체인 수 — 24개월 신규 체인 추이 + 제조사/변경 포함 분해"
      unit="건"
      tone="solar"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="체인 합계"
      totalValue={chains.length.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 체인"
      breakdowns={[
        { label: '체인 구성', rows: byVariantStatus, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
