// 사용중 (M$) 드릴다운 — 은행별 / 법인별 실행금액 + 활성 LC 개설 추이.

import { useMemo } from 'react'
import { useAllBankLimitGroups } from '@/hooks/useBanking'
import { useLCList } from '@/hooks/useProcurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)
const fmtUsdMTick = (v: number) => `${(v / 1_000_000).toFixed(0)}`

export function BankingUsedInsight() {
  const { groups, loading: groupsLoading } = useAllBankLimitGroups()
  const { data: lcs, loading: lcsLoading } = useLCList()

  // 활성 LC (status != settled, !repaid) 의 open_date 월별 합계.
  const activeLcs = useMemo(
    () => lcs.filter((l) => l.status !== 'settled' && !l.repaid),
    [lcs],
  )
  const trend = useMemo(
    () => trend24(activeLcs, (l) => l.open_date ?? null, (l) => l.amount_usd ?? 0),
    [activeLcs],
  )

  const allRows = groups.flatMap((g) => g.rows.map((r) => ({ ...r, company_id: g.company_id, company_name: g.company_name })))
  const totalUsed = allRows.reduce((s, r) => s + r.used, 0)

  const byBank = useMemo(
    () => breakdownBy(
      allRows.filter((r) => r.used > 0),
      (r) => r.bank_id ?? r.bank_name,
      (r) => r.bank_name,
      (r) => r.used,
    ).slice(0, 10),
    [allRows],
  )
  const byCompany = useMemo(
    () => breakdownBy(
      allRows.filter((r) => r.used > 0),
      (r) => r.company_id,
      (r) => r.company_name,
      (r) => r.used,
    ),
    [allRows],
  )

  return (
    <InsightShell
      title="사용중 한도"
      subtitle="현재 실행금액 합계 (M$) · 24개월 LC 개설 추이 + 은행/법인별 분해"
      unit="M$"
      tone="warn"
      backTo="/banking"
      backLabel="L/C 한도 현황으로 돌아가기"
      loading={groupsLoading || lcsLoading}
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
