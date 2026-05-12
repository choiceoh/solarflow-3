// 한도 변경 이력 (limit_changes) 드릴다운.

import { useMemo } from 'react'
import { useLimitChangeList } from '@/hooks/useBanking'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (n: number) => (n / 1_000_000).toFixed(2)

export function BankingLimitChangesInsight() {
  const { data: changes, loading } = useLimitChangeList()

  const trend = useMemo(() => trend24(changes, (c) => c.change_date), [changes])

  const byBankCount = useMemo(
    () =>
      breakdownBy(
        changes,
        (c) => c.bank_id,
        (c) => c.bank_name ?? c.bank_id.slice(0, 8),
        () => 1,
      ).slice(0, 10),
    [changes],
  )

  const byDelta = useMemo(
    () =>
      breakdownBy(
        changes,
        (c) => c.limit_change_id,
        (c) => `${c.change_date} · ${c.bank_name ?? '미지정'}`,
        (c) => c.new_limit - c.previous_limit,
      ).slice(0, 10),
    [changes],
  )

  return (
    <InsightShell
      title="한도 변경 이력"
      subtitle="승인한도 변경 기록 · 은행별 변경 횟수 + 변경량 상위"
      unit="건"
      tone="ink"
      backTo="/banking?tab=changes"
      backLabel="한도 변경 이력으로 돌아가기"
      loading={loading}
      totalLabel="변경 누계"
      totalValue={changes.length.toLocaleString()}
      trend={trend}
      trendValueLabel="변경"
      breakdowns={[
        { label: '은행 변경 횟수 상위 10', rows: byBankCount, unit: '건' },
        { label: '변경량 상위 10 (증감 M$)', rows: byDelta, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
