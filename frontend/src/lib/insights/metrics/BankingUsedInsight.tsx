// 사용중 (M$) 드릴다운 — 은행별 / 법인별 실행금액 + 활성 LC 개설 추이.
//
// 서버 집계 (banking_dashboard RPC).

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function BankingUsedInsight() {
  const { dashboard, loading } = useBankingDashboard()

  const totalUsed = dashboard?.totals.total_used_usd ?? 0

  // LC 개설액 trend — banking_dashboard.trend24[i].lc_open_usd
  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.lc_open_usd })),
    [dashboard],
  )

  const byBank: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_bank ?? []).filter((r) => r.used > 0)
    const total = rows.reduce((s, r) => s + r.used, 0)
    return [...rows]
      .sort((a, b) => b.used - a.used)
      .slice(0, 10)
      .map((r) => ({
        key: r.bank_id ?? r.bank_name,
        label: r.bank_name,
        value: r.used,
        share: total > 0 ? r.used / total : 0,
        count: 1,
      }))
  }, [dashboard])

  const byCompany: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_company ?? []).filter((c) => c.used_usd > 0)
    const total = rows.reduce((s, r) => s + r.used_usd, 0)
    return rows.map((c) => ({
      key: c.key,
      label: c.label,
      value: c.used_usd,
      share: total > 0 ? c.used_usd / total : 0,
      count: c.bank_count,
    }))
  }, [dashboard])

  return (
    <InsightShell
      title="사용중 한도"
      subtitle="현재 실행금액 합계 (M$) · 24개월 LC 개설 추이 + 은행/법인별 분해"
      unit="M$"
      tone="warn"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={loading}
      totalLabel="현재 사용중"
      totalValue={fmtUsdM(totalUsed)}
      trend={trend}
      trendValueLabel="LC 개설액"
      formatTrend={fmtUsdMTick}
      breakdowns={[
        { label: '법인별 사용', rows: byCompany, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
