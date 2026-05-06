// L/C 은행 (곳) 드릴다운 — distinct bank 수 + 은행별 LC 건수/금액.

import { useMemo } from 'react'
import { useLCList } from '@/hooks/useProcurement'
import { breakdownBy, trend24Distinct } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementLcBanksInsight() {
  const { data, loading } = useLCList()

  const trend = useMemo(
    () => trend24Distinct(data, (l) => l.open_date ?? null, (l) => l.bank_id),
    [data],
  )
  const totalDistinct = useMemo(
    () => new Set(data.map((l) => l.bank_id)).size,
    [data],
  )

  const byBankCount = useMemo(
    () => breakdownBy(
      data,
      (l) => l.bank_id,
      (l) => l.bank_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )
  const byBankAmount = useMemo(
    () => breakdownBy(
      data,
      (l) => l.bank_id,
      (l) => l.bank_name ?? '미지정',
      (l) => l.amount_usd ?? 0,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="L/C 은행"
      subtitle="월별 L/C 개설 distinct 은행 수 추이 + 은행별 건수/금액"
      unit="곳"
      tone="ink"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="누적 은행"
      totalValue={totalDistinct.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 은행"
      breakdowns={[
        { label: '은행 (건수)', rows: byBankCount, unit: '건' },
        { label: '은행 (금액)', rows: byBankAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
