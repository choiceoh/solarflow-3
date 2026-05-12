// 임박 한도 (usage >= 80%) 드릴다운.

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtPct = (n: number) => n.toFixed(1)
const fmtUsdM = (n: number) => (n / 1_000_000).toFixed(2)

export function BankingTightLimitInsight() {
  const { dashboard, loading } = useBankingDashboard()

  const tight = useMemo(
    () =>
      (dashboard?.by_bank ?? []).filter((r) => r.lc_limit_usd > 0 && r.usage_rate >= 80),
    [dashboard],
  )

  const byBankUsage: BreakdownRow[] = useMemo(
    () =>
      [...tight]
        .sort((a, b) => b.usage_rate - a.usage_rate)
        .slice(0, 10)
        .map((r) => ({
          key: r.bank_id ?? r.bank_name,
          label: `${r.bank_name} · ${r.company_name}`,
          value: r.usage_rate,
          share: 0,
          count: 1,
        })),
    [tight],
  )

  const byBankUsed: BreakdownRow[] = useMemo(
    () =>
      [...tight]
        .sort((a, b) => b.used - a.used)
        .slice(0, 10)
        .map((r) => ({
          key: `${r.bank_id ?? r.bank_name}-amt`,
          label: `${r.bank_name} · ${r.company_name}`,
          value: r.used,
          share: 0,
          count: 1,
        })),
    [tight],
  )

  return (
    <InsightShell
      title="임박 한도"
      subtitle="사용률 80% 이상 은행 행 — 사용률·실행금액 분포"
      unit="곳"
      tone="warn"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={loading}
      totalLabel="임박"
      totalValue={tight.length.toLocaleString()}
      trend={[]}
      trendValueLabel="임박"
      breakdowns={[
        { label: '사용률 상위 10', rows: byBankUsage, unit: '%', formatValue: fmtPct },
        { label: '실행금액 상위 10', rows: byBankUsed, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
