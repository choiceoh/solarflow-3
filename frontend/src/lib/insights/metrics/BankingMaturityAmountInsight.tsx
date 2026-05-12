// 만기 30일 이내 금액 (M$) 드릴다운.

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (n: number) => (n / 1_000_000).toFixed(2)

export function BankingMaturityAmountInsight() {
  const { dashboard, loading } = useBankingDashboard()

  const maturity = dashboard?.maturity
  const totalAmount = (maturity?.by_urgency ?? []).reduce((s, r) => s + r.amount_usd_sum, 0)

  const byUrgency: BreakdownRow[] = useMemo(
    () =>
      (maturity?.by_urgency ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.amount_usd_sum,
        share: r.share,
        count: r.count,
      })),
    [maturity],
  )
  const byBank: BreakdownRow[] = useMemo(
    () =>
      (maturity?.by_bank_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.amount_usd_sum,
        share: r.share,
        count: r.count,
      })),
    [maturity],
  )

  return (
    <InsightShell
      title="만기 30일 금액"
      subtitle={`30일 이내 만기 L/C 합계 ${fmtUsdM(totalAmount)} M$ · 긴급도·은행 분해`}
      unit="M$"
      tone="info"
      backTo="/banking?tab=maturity"
      backLabel="만기 알림으로 돌아가기"
      loading={loading}
      totalLabel="만기 금액"
      totalValue={fmtUsdM(totalAmount)}
      trend={[]}
      trendValueLabel="만기"
      breakdowns={[
        { label: '긴급도', rows: byUrgency, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
