// L/C 전체 (건) 드릴다운 — 모든 L/C (status 무관). 상태별 + 은행별 분해.

import { useMemo } from 'react'
import { useLCList } from '@/hooks/useProcurement'
import { LC_STATUS_LABEL, type LCStatus } from '@/types/procurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function ProcurementLcTotalInsight() {
  const { data, loading } = useLCList()

  const trend = useMemo(
    () => trend24(data, (l) => l.open_date ?? null),
    [data],
  )

  const byStatus = useMemo(
    () => breakdownBy(
      data,
      (l) => l.status,
      (l) => LC_STATUS_LABEL[l.status as LCStatus] ?? l.status,
      () => 1,
    ),
    [data],
  )
  const byBank = useMemo(
    () => breakdownBy(
      data,
      (l) => l.bank_id,
      (l) => l.bank_name ?? '미지정',
      () => 1,
    ).slice(0, 10),
    [data],
  )

  return (
    <InsightShell
      title="L/C 전체"
      subtitle="status 무관 모든 L/C — 24개월 개설 추이 + 상태/은행 분해"
      unit="건"
      tone="solar"
      backTo="/procurement?tab=lc"
      backLabel="L/C 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={data.length.toLocaleString()}
      trend={trend}
      trendValueLabel="L/C 개설"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '은행 상위 10', rows: byBank, unit: '건' },
      ]}
    />
  )
}
