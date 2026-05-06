// 총 한도 (M$) 드릴다운 — 은행별 / 법인별 한도. 한도는 스냅샷이라 24mo 추이는 변경 이력 기반.

import { useMemo } from 'react'
import { useAllBankLimitGroups, useLimitChangeList } from '@/hooks/useBanking'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function BankingTotalLimitInsight() {
  const { groups, loading: groupsLoading } = useAllBankLimitGroups()
  const { data: changes, loading: changesLoading } = useLimitChangeList()

  // 한도 변경 이력 기반 트렌드 — 월별 한도 증감 (new_limit - previous_limit) 합.
  const trend = useMemo(
    () => trend24(changes, (c) => c.change_date, (c) => c.new_limit - c.previous_limit),
    [changes],
  )

  const allRows = groups.flatMap((g) => g.rows.map((r) => ({ ...r, company_id: g.company_id, company_name: g.company_name })))
  const totalLimit = allRows.reduce((s, r) => s + r.lc_limit_usd, 0)

  const byBank = useMemo(
    () => breakdownBy(
      allRows,
      (r) => r.bank_id ?? r.bank_name,
      (r) => r.bank_name,
      (r) => r.lc_limit_usd,
    ).slice(0, 10),
    [allRows],
  )
  const byCompany = useMemo(
    () => breakdownBy(
      allRows,
      (r) => r.company_id,
      (r) => r.company_name,
      (r) => r.lc_limit_usd,
    ),
    [allRows],
  )

  return (
    <InsightShell
      title="총 한도"
      subtitle="현재 승인한도 합계 (M$) · 24개월 한도 변경 이력 + 은행/법인별 분해"
      unit="M$"
      tone="ink"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={groupsLoading || changesLoading}
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
