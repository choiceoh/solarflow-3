// 개설 금액 (M$) 드릴다운 — L/C amount_usd 합계.

import { useMemo } from 'react'
import { useLCList } from '@/hooks/useProcurement'
import { LC_STATUS_LABEL, type LCStatus } from '@/types/procurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function ProcurementLcAmountInsight() {
  const { data, loading } = useLCList()

  const trend = useMemo(
    () => trend24(data, (l) => l.open_date ?? null, (l) => l.amount_usd ?? 0),
    [data],
  )
  const totalAmount = data.reduce((sum, l) => sum + (l.amount_usd ?? 0), 0)

  const byStatus = useMemo(
    () => breakdownBy(
      data,
      (l) => l.status,
      (l) => LC_STATUS_LABEL[l.status as LCStatus] ?? l.status,
      (l) => l.amount_usd ?? 0,
    ),
    [data],
  )
  const byBank = useMemo(
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
      title="L/C 개설 금액"
      subtitle="amount_usd 합계 (M$) · 24개월 추이 + 상태/은행 분해"
      unit="M$"
      tone="warn"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtUsdM(totalAmount)}
      trend={trend}
      trendValueLabel="개설 금액"
      formatTrend={fmtUsdMTick}
      breakdowns={[
        { label: '상태', rows: byStatus, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
