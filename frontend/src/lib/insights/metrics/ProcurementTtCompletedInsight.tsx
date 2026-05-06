// T/T 완료 금액 (M$) 드릴다운 — status=completed amount_usd 합.

import { useMemo } from 'react'
import { useTTList } from '@/hooks/useProcurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function ProcurementTtCompletedInsight() {
  const { data, loading } = useTTList()

  const completed = useMemo(() => data.filter((t) => t.status === 'completed'), [data])

  const trend = useMemo(
    () => trend24(completed, (t) => t.remit_date ?? null, (t) => t.amount_usd ?? 0),
    [completed],
  )
  const totalCompleted = completed.reduce((sum, t) => sum + (t.amount_usd ?? 0), 0)

  const byManufacturer = useMemo(
    () => breakdownBy(
      completed,
      (t) => t.manufacturer_name ?? null,
      (t) => t.manufacturer_name ?? '미지정',
      (t) => t.amount_usd ?? 0,
    ).slice(0, 10),
    [completed],
  )
  const byBank = useMemo(
    () => breakdownBy(
      completed,
      (t) => t.bank_name ?? null,
      (t) => t.bank_name ?? '미지정',
      (t) => t.amount_usd ?? 0,
    ).slice(0, 10),
    [completed],
  )
  const byPurpose = useMemo(
    () => breakdownBy(
      completed,
      (t) => t.purpose ?? null,
      (t) => t.purpose ?? '용도 미지정',
      (t) => t.amount_usd ?? 0,
    ).slice(0, 10),
    [completed],
  )

  return (
    <InsightShell
      title="T/T 완료 금액"
      subtitle="status=completed 송금 금액 (M$) · 24개월 추이 + 제조사/은행/용도 분해"
      unit="M$"
      tone="pos"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtUsdM(totalCompleted)}
      trend={trend}
      trendValueLabel="완료 송금"
      formatTrend={fmtUsdMTick}
      breakdowns={[
        { label: '제조사 상위 10', rows: byManufacturer, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
        { label: '용도 상위 10', rows: byPurpose, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
