// 한도 사용률 드릴다운 — 전체 used/limit % + 은행/법인별 분포.

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtPct = (n: number) => n.toFixed(1)

export function BankingUsageRateInsight() {
  const { dashboard, loading } = useBankingDashboard()

  const totalLimit = dashboard?.totals.total_limit_usd ?? 0
  const totalUsed = dashboard?.totals.total_used_usd ?? 0
  const rate = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0

  const byBank: BreakdownRow[] = useMemo(() => {
    const rows = dashboard?.by_bank ?? []
    return [...rows]
      .filter((r) => r.lc_limit_usd > 0)
      .sort((a, b) => b.usage_rate - a.usage_rate)
      .slice(0, 10)
      .map((r) => ({
        key: r.bank_id ?? r.bank_name,
        label: r.bank_name,
        value: r.usage_rate,
        share: 0,
        count: 1,
      }))
  }, [dashboard])

  const byCompany: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_company ?? [])
        .filter((c) => c.limit_usd > 0)
        .map((c) => ({
          key: c.key,
          label: c.label,
          value: c.limit_usd > 0 ? (c.used_usd / c.limit_usd) * 100 : 0,
          share: 0,
          count: c.bank_count,
        }))
        .sort((a, b) => b.value - a.value),
    [dashboard],
  )

  return (
    <InsightShell
      title="한도 사용률"
      subtitle={`사용 ${(totalUsed / 1_000_000).toFixed(1)} M$ / 한도 ${(totalLimit / 1_000_000).toFixed(1)} M$ · 은행·법인 사용률 분해`}
      unit="%"
      tone="info"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={loading}
      totalLabel="사용률"
      totalValue={fmtPct(rate)}
      trend={[]}
      trendValueLabel="사용률"
      breakdowns={[
        { label: '은행 사용률 상위 10', rows: byBank, unit: '%', formatValue: fmtPct },
        { label: '법인별 사용률', rows: byCompany, unit: '%', formatValue: fmtPct },
      ]}
    />
  )
}
