// 가용 한도 (M$) 드릴다운 — 추가 개설 가능액. 스냅샷 메트릭이라 trend 는 비움.

import { useMemo } from 'react'
import { useAllBankLimitGroups } from '@/hooks/useBanking'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function BankingAvailableInsight() {
  const { groups, loading } = useAllBankLimitGroups()

  const allRows = groups.flatMap((g) => g.rows.map((r) => ({ ...r, company_id: g.company_id, company_name: g.company_name })))
  const totalAvail = allRows.reduce((s, r) => s + r.available, 0)

  const byBank = useMemo(
    () => breakdownBy(
      allRows.filter((r) => r.available > 0),
      (r) => r.bank_id ?? r.bank_name,
      (r) => r.bank_name,
      (r) => r.available,
    ).slice(0, 10),
    [allRows],
  )
  const byCompany = useMemo(
    () => breakdownBy(
      allRows.filter((r) => r.available > 0),
      (r) => r.company_id,
      (r) => r.company_name,
      (r) => r.available,
    ),
    [allRows],
  )
  // 사용률 위험순 — 사용률 높은 은행이 가용 부족 (잔여 한도 부족 위험).
  const byUsageRate = useMemo(() => {
    return [...allRows]
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
  }, [allRows])

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
