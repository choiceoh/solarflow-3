// 입금 합계 (억) 드릴다운 — receipts 탭 KPI '입금 합계'.

import { useMemo } from 'react'
import { useReceiptList } from '@/hooks/useReceipts'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtEok = (v: number) => (v / 100_000_000).toFixed(v >= 10_000_000_000 ? 1 : 2)
const fmtEokTick = (v: number) => (v / 100_000_000).toFixed(0)

export function ReceiptsTotalInsight() {
  const { data, loading } = useReceiptList()

  const trend = useMemo(
    () => trend24(data, (r) => r.receipt_date, (r) => r.amount ?? 0),
    [data],
  )

  const totalSum = data.reduce((sum, r) => sum + (r.amount ?? 0), 0)

  const byCustomer = useMemo(
    () => breakdownBy(
      data,
      (r) => r.customer_id,
      (r) => r.customer_name ?? '미지정',
      (r) => r.amount ?? 0,
    ).slice(0, 10),
    [data],
  )
  const byMatchStatus = useMemo(() => {
    const grouped = data.map((r) => {
      const matched = r.matched_total ?? 0
      const remaining = r.remaining ?? 0
      let status: 'matched' | 'partial' | 'unmatched'
      if (matched > 0 && remaining <= 0) status = 'matched'
      else if (matched > 0 && remaining > 0) status = 'partial'
      else status = 'unmatched'
      return { ...r, _status: status }
    })
    const labels: Record<string, string> = {
      matched: '완전 매칭',
      partial: '부분 매칭',
      unmatched: '미매칭',
    }
    return breakdownBy(
      grouped,
      (r) => r._status,
      (r) => labels[r._status] ?? r._status,
      (r) => r.amount ?? 0,
    )
  }, [data])

  return (
    <InsightShell
      title="입금 합계"
      subtitle="24개월 월별 입금 추이 (단위 억) · 거래처 / 매칭상태별 분해"
      unit="억"
      tone="solar"
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={fmtEok(totalSum)}
      trend={trend}
      trendValueLabel="입금"
      formatTrend={fmtEokTick}
      breakdowns={[
        { label: '매칭상태', rows: byMatchStatus, unit: '억', formatValue: fmtEok },
        { label: '거래처 상위 10', rows: byCustomer, unit: '억', formatValue: fmtEok },
      ]}
    />
  )
}
