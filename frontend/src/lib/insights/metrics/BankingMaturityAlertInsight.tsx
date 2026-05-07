// 만기 알림 (건) 드릴다운 — 30일 이내 만기 LC. 미래 데이터라 trend 는 비우고 분포 + 은행/긴급도로.
//
// 서버 집계 (banking_dashboard RPC) — 'maturity' 키에 by_urgency / by_bank 포함.

import { useMemo } from 'react'
import { useBankingDashboard } from '@/hooks/useBanking'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function BankingMaturityAlertInsight() {
  const { dashboard, loading } = useBankingDashboard()
  const maturity = dashboard?.maturity
  const totalCount = maturity?.total_count ?? 0

  const byUrgency: BreakdownRow[] = useMemo(
    () => (maturity?.by_urgency ?? []).map((u) => ({
      key: u.key,
      label: u.label,
      value: u.count,
      share: u.share,
      count: u.count,
    })),
    [maturity],
  )

  const byBank: BreakdownRow[] = useMemo(
    () => (maturity?.by_bank_top10 ?? []).map((b) => ({
      key: b.key,
      label: b.label,
      value: b.amount_usd_sum,
      share: b.share,
      count: b.count,
    })),
    [maturity],
  )

  const byBankCount: BreakdownRow[] = useMemo(
    () => (maturity?.by_bank_top10 ?? []).map((b) => ({
      key: b.key,
      label: b.label,
      value: b.count,
      share: b.share,
      count: b.count,
    })),
    [maturity],
  )

  return (
    <InsightShell
      title="L/C 만기 알림"
      subtitle="30일 이내 만기 도래 L/C — 긴급도(7/14/30일) + 은행별 금액·건수 분해"
      unit="건"
      tone={totalCount > 0 ? 'info' : 'pos'}
      backTo="/banking?tab=maturity"
      backLabel="만기 알림으로 돌아가기"
      loading={loading}
      totalLabel="알림 합계"
      totalValue={totalCount.toLocaleString()}
      trend={[]}
      trendValueLabel="만기 건수"
      breakdowns={[
        { label: '긴급도', rows: byUrgency, unit: '건' },
        { label: '은행 (금액 합계)', rows: byBank, unit: 'M$', formatValue: fmtUsdM },
        { label: '은행 (건수)', rows: byBankCount, unit: '건' },
      ]}
    />
  )
}
