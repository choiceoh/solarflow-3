// 총 한도 (M$) 드릴다운 — 은행별 / 법인별 한도. 한도는 스냅샷이라 24mo 추이는 변경 이력 기반.
//
// 서버 집계 (banking_dashboard RPC) — useBankingDashboard 한 번에 4개 insight 데이터 모두 수신.

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow, TrendPoint } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function BankingTotalLimitInsight() {
  const { dashboard, loading } = useBankingDashboard()

  const totalLimit = dashboard?.totals.total_limit_usd ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.limit_delta_usd })),
    [dashboard],
  )

  const byBank: BreakdownRow[] = useMemo(() => {
    const rows = dashboard?.by_bank ?? []
    const total = rows.reduce((s, r) => s + r.lc_limit_usd, 0)
    return [...rows]
      .sort((a, b) => b.lc_limit_usd - a.lc_limit_usd)
      .slice(0, 10)
      .map((r) => ({
        key: r.bank_id ?? r.bank_name,
        label: r.bank_name,
        value: r.lc_limit_usd,
        share: total > 0 ? r.lc_limit_usd / total : 0,
        count: 1,
      }))
  }, [dashboard])

  const byCompany: BreakdownRow[] = useMemo(
    () => (dashboard?.by_company ?? []).map((c) => ({
      key: c.key,
      label: c.label,
      value: c.limit_usd,
      share: totalLimit > 0 ? c.limit_usd / totalLimit : 0,
      count: c.bank_count,
    })),
    [dashboard, totalLimit],
  )

  return (
    <InsightShell
      title="총 한도"
      subtitle="현재 승인한도 합계 (M$) · 24개월 한도 변경 이력 + 은행/법인별 분해"
      unit="M$"
      tone="ink"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={loading}
      totalLabel="현재 한도"
      totalValue={fmtUsdM(totalLimit)}
      trend={trend}
      trendValueLabel="한도 증감"
      formatTrend={fmtUsdMTick}
      breakdowns={[
        { label: '법인별 한도', rows: byCompany, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
