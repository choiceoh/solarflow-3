// 관리 법인 수 드릴다운 — 한도 보유 법인들의 한도·사용·가용 분포.

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (n: number) => (n / 1_000_000).toFixed(2)

export function BankingCompanyCountInsight() {
  const { dashboard, loading } = useBankingDashboard()

  const total = dashboard?.totals.company_count ?? 0

  const byCompanyLimit: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_company ?? []).map((c) => ({
        key: c.key,
        label: c.label,
        value: c.limit_usd,
        share: 0,
        count: c.bank_count,
      })),
    [dashboard],
  )
  const byCompanyUsed: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_company ?? []).map((c) => ({
        key: `${c.key}-used`,
        label: c.label,
        value: c.used_usd,
        share: 0,
        count: c.bank_count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="관리 법인"
      subtitle="한도 보유 법인 수 · 법인별 한도/사용 분해"
      unit="곳"
      tone="ink"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={loading}
      totalLabel="법인 수"
      totalValue={total.toLocaleString()}
      trend={[]}
      trendValueLabel="법인"
      breakdowns={[
        { label: '법인별 한도', rows: byCompanyLimit, unit: 'M$', formatValue: fmtUsdM },
        { label: '법인별 사용', rows: byCompanyUsed, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
