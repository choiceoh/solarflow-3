// 만기 알림 (건) 드릴다운 — 30일 이내 만기 LC. 미래 데이터라 trend 는 비우고 분포 + 은행/긴급도로.

import { useMemo } from 'react'
import { useLCMaturityAlert } from '@/hooks/useBanking'
import { breakdownBy } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function BankingMaturityAlertInsight() {
  const { data, loading } = useLCMaturityAlert(30)
  const alerts = data?.alerts ?? []

  const byBank = useMemo(
    () => breakdownBy(
      alerts,
      (a) => a.bank_name,
      (a) => a.bank_name,
      (a) => a.amount_usd,
    ).slice(0, 10),
    [alerts],
  )
  const byBankCount = useMemo(
    () => breakdownBy(
      alerts,
      (a) => a.bank_name,
      (a) => a.bank_name,
      () => 1,
    ).slice(0, 10),
    [alerts],
  )
  // 긴급 (7일 이내) 분리.
  const byUrgency = useMemo(() => {
    const urgent = alerts.filter((a) => a.days_remaining <= 7).length
    const soon = alerts.filter((a) => a.days_remaining > 7 && a.days_remaining <= 14).length
    const later = alerts.filter((a) => a.days_remaining > 14).length
    const total = urgent + soon + later
    const rows = [
      { key: 'urgent', label: '긴급 (7일 이내)', value: urgent, count: urgent },
      { key: 'soon', label: '주의 (8~14일)', value: soon, count: soon },
      { key: 'later', label: '여유 (15~30일)', value: later, count: later },
    ]
    return rows.map((r) => ({ ...r, share: total > 0 ? r.value / total : 0 }))
  }, [alerts])

  return (
    <InsightShell
      title="L/C 만기 알림"
      subtitle="30일 이내 만기 도래 L/C — 긴급도(7/14/30일) + 은행별 금액·건수 분해"
      unit="건"
      tone={alerts.length > 0 ? 'info' : 'pos'}
      backTo="/banking?tab=maturity"
      backLabel="만기 알림으로 돌아가기"
      loading={loading}
      totalLabel="알림 합계"
      totalValue={alerts.length.toLocaleString()}
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
