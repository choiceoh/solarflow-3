// L/C 연결 (건) 드릴다운 — PO 탭 KPI 'L/C 연결' (= LC 가 개설된 PO 수).

import { useMemo } from 'react'
import { useLCList } from '@/hooks/useProcurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtUsdM = (v: number) => (v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)

export function ProcurementLcLinkedInsight() {
  const { data, loading } = useLCList()

  // 'L/C 연결' = 활성 LC (cancelled 제외) 의 PO 연결.
  const active = useMemo(
    () => data.filter((l) => l.status !== 'cancelled'),
    [data],
  )

  const trend = useMemo(
    () => trend24(active, (l) => l.open_date ?? null),
    [active],
  )

  const byBank = useMemo(
    () => breakdownBy(
      active,
      (l) => l.bank_id,
      (l) => l.bank_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [active],
  )
  const byBankAmount = useMemo(
    () => breakdownBy(
      active,
      (l) => l.bank_id,
      (l) => l.bank_name ?? '미지정',
      (l) => l.amount_usd ?? 0,
    ).slice(0, 10),
    [active],
  )

  return (
    <InsightShell
      title="L/C 연결"
      subtitle="활성 L/C (cancelled 제외) 24개월 개설 추이 + 은행별 건수/금액"
      unit="건"
      tone="info"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="활성 합계"
      totalValue={active.length.toLocaleString()}
      trend={trend}
      trendValueLabel="L/C 개설"
      breakdowns={[
        { label: '은행 (건수)', rows: byBank, unit: '건' },
        { label: '은행 (금액 합계)', rows: byBankAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
