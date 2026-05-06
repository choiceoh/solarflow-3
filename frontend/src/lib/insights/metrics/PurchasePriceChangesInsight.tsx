// 단가 변동 (건) 드릴다운 — PriceHistory 등록. 제조사/제품/변경 사유별 분해.

import { useMemo } from 'react'
import { usePriceHistoryList } from '@/hooks/useProcurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function PurchasePriceChangesInsight() {
  const { data, loading } = usePriceHistoryList()

  const trend = useMemo(
    () => trend24(data, (p) => p.change_date),
    [data],
  )

  const byManufacturer = useMemo(
    () => breakdownBy(
      data,
      (p) => p.manufacturer_id,
      (p) => p.manufacturer_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )
  const byProduct = useMemo(
    () => breakdownBy(
      data,
      (p) => p.product_id,
      (p) => p.product_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )
  const byReason = useMemo(
    () => breakdownBy(
      data,
      (p) => p.reason ?? null,
      (p) => p.reason ?? '사유 미입력',
      () => 1,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="단가 변동"
      subtitle="PriceHistory 등록 건 — 24개월 월별 추이 + 제조사/제품/사유별 분해"
      unit="건"
      tone="info"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="변동 합계"
      totalValue={data.length.toLocaleString()}
      trend={trend}
      trendValueLabel="단가 변동"
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '제품 상위 10', rows: byProduct, unit: '건' },
        { label: '변경 사유 상위 10', rows: byReason, unit: '건' },
      ]}
    />
  )
}
