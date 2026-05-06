// 만기 30일 (건) 드릴다운 — maturity_date 가 30일 이내 + 미정산 LC.
// 미래 데이터라 trend 비움. 긴급도/은행 분해.
//
// 서버 집계 마이그(C-1 procurement) — useLCDashboard(status_scope=maturity_soon).
// urgency 분류는 백엔드가 overdue/urgent/soon14/later 4 buckets 로 미리 계산.

import { useMemo } from 'react'
import { useLCDashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { BreakdownRow } from '@/lib/insights/aggregations'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementLcMaturityInsight() {
  const { dashboard, loading } = useLCDashboard({ status_scope: 'maturity_soon' })

  const totalSoon = dashboard?.totals.maturity_soon_count ?? 0

  const byUrgency: BreakdownRow[] = useMemo(
    () => (dashboard?.by_urgency ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byBankCount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byBankAmount: BreakdownRow[] = useMemo(
    () => (dashboard?.by_bank_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.amount_usd_sum, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="L/C 만기 30일"
      subtitle="maturity_date 30일 이내 (연체 포함) · 미정산 L/C — 긴급도 + 은행 분해"
      unit="건"
      tone={totalSoon > 0 ? 'info' : 'pos'}
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="만기 합계"
      totalValue={totalSoon.toLocaleString()}
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
