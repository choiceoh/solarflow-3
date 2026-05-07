// 가용 한도 (M$) 드릴다운 — 추가 개설 가능액. 스냅샷 메트릭이라 trend 는 비움.
//
// 서버 집계 (banking_dashboard RPC).

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function BankingAvailableInsight() {
  const { dashboard, loading } = useBankingDashboard()

  const totalAvail = dashboard?.totals.total_available_usd ?? 0

  const byBank: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_bank ?? []).filter((r) => r.available > 0)
    const total = rows.reduce((s, r) => s + r.available, 0)
    return [...rows]
      .sort((a, b) => b.available - a.available)
      .slice(0, 10)
      .map((r) => ({
        key: r.bank_id ?? r.bank_name,
        label: r.bank_name,
        value: r.available,
        share: total > 0 ? r.available / total : 0,
        count: 1,
      }))
  }, [dashboard])

  const byCompany: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_company ?? []).filter((c) => c.available_usd > 0)
    const total = rows.reduce((s, r) => s + r.available_usd, 0)
    return rows.map((c) => ({
      key: c.key,
      label: c.label,
      value: c.available_usd,
      share: total > 0 ? c.available_usd / total : 0,
      count: c.bank_count,
    }))
  }, [dashboard])

  // 사용률 위험순 — usage_rate 높은 은행이 잔여 한도 부족 위험.
  const byUsageRate: BreakdownRow[] = useMemo(() => {
    return [...(dashboard?.by_bank ?? [])]
      .filter((r) => r.lc_limit_usd > 0)
      .sort((a, b) => b.usage_rate - a.usage_rate)
      .slice(0, 10)
      .map((r) => ({
        key: `${r.company_id}:${r.bank_id ?? r.bank_name}`,
        label: `${r.bank_name} (${r.company_name})`,
        value: r.usage_rate,
        share: r.lc_limit_usd > 0 ? r.used / r.lc_limit_usd : 0,
        count: 1,
      }))
  }, [dashboard])

  return (
    <InsightShell
      title="가용 한도"
      subtitle="추가 LC 개설 가능액 (M$) · 은행/법인별 + 사용률 위험순"
      unit="M$"
      tone="solar"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={loading}
      totalLabel="현재 가용"
      totalValue={fmtUsdM(totalAvail)}
      trend={[]}
      trendValueLabel="가용"
      breakdowns={[
        { label: '법인별 가용', rows: byCompany, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 상위 10', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
        { label: '사용률 위험순 (상위 10)', rows: byUsageRate, unit: '%', formatValue: (v) => v.toFixed(1) },
      ]}
    />
  )
}
