// 만기 30일 (건) 드릴다운 — maturity_date 가 30일 이내 + 미정산 LC.
// 미래 데이터라 trend 비움. 긴급도/은행 분해.

import { useMemo } from 'react'
import { useLCList } from '@/hooks/useProcurement'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementLcMaturityInsight() {
  const { data, loading } = useLCList()

  // 30일 이내 만기 + 미정산 LC.
  const soon = useMemo(() => {
    const now = Date.now()
    const horizon = 30 * 24 * 60 * 60 * 1000
    return data.filter((l) => {
      if (l.status === 'settled' || l.repaid) return false
      if (!l.maturity_date) return false
      const t = new Date(l.maturity_date).getTime()
      if (!Number.isFinite(t)) return false
      return t - now <= horizon && t - now >= -horizon  // 만기 지난 것도 포함 (overdue)
    })
  }, [data])

  const byBankCount = useMemo(
    () => breakdownBy(
      soon,
      (l) => l.bank_id,
      (l) => l.bank_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [soon],
  )
  const byBankAmount = useMemo(
    () => breakdownBy(
      soon,
      (l) => l.bank_id,
      (l) => l.bank_name ?? '미지정',
      (l) => l.amount_usd ?? 0,
    ).slice(0, 10),
    [soon],
  )

  // 긴급도 (남은 일수 기준).
  const byUrgency = useMemo(() => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    let overdue = 0, urgent = 0, soon14 = 0, later = 0
    for (const l of soon) {
      const t = new Date(l.maturity_date!).getTime()
      const diffDays = (t - now) / day
      if (diffDays < 0) overdue += 1
      else if (diffDays <= 7) urgent += 1
      else if (diffDays <= 14) soon14 += 1
      else later += 1
    }
    const total = overdue + urgent + soon14 + later
    const rows = [
      { key: 'overdue', label: '연체', value: overdue, count: overdue },
      { key: 'urgent', label: '긴급 (7일 이내)', value: urgent, count: urgent },
      { key: 'soon', label: '주의 (8~14일)', value: soon14, count: soon14 },
      { key: 'later', label: '여유 (15~30일)', value: later, count: later },
    ]
    return rows.map((r) => ({ ...r, share: total > 0 ? r.value / total : 0 }))
  }, [soon])

  return (
    <InsightShell
      title="L/C 만기 30일"
      subtitle="maturity_date 30일 이내 (연체 포함) · 미정산 L/C — 긴급도 + 은행 분해"
      unit="건"
      tone={soon.length > 0 ? 'info' : 'pos'}
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="만기 합계"
      totalValue={soon.length.toLocaleString()}
      trend={[]}
      trendValueLabel="만기 건수"
      breakdowns={[
        { label: '긴급도', rows: byUrgency, unit: '건' },
        { label: '은행 (건수)', rows: byBankCount, unit: '건' },
        { label: '은행 (금액)', rows: byBankAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
