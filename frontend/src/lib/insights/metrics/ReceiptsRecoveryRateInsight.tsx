// 회수율 (%) 드릴다운 — (입금 - 미정산) / 입금 * 100 = matched / total.

import { useMemo } from 'react'
import { useReceiptList } from '@/hooks/useReceipts'
import type { Receipt } from '@/types/orders'
import { trend24 } from '@/lib/insights/aggregations'
import type { BreakdownRow } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtPct = (v: number) => v.toFixed(1)

interface CustomerAgg {
  key: string
  label: string
  total: number
  matched: number
  count: number
}

function customerRecovery(items: readonly Receipt[]): BreakdownRow[] {
  const map = new Map<string, CustomerAgg>()
  let totalCount = 0
  for (const r of items) {
    const key = r.customer_id || '__unset__'
    const cur = map.get(key) ?? { key, label: r.customer_name ?? '미지정', total: 0, matched: 0, count: 0 }
    const amount = r.amount ?? 0
    const remaining = r.remaining ?? 0
    cur.total += amount
    cur.matched += Math.max(amount - remaining, 0)
    cur.count += 1
    map.set(key, cur)
    totalCount += 1
  }
  const rows: BreakdownRow[] = []
  for (const [key, g] of map) {
    if (g.count < 3) continue  // 표본 3건 미만은 노이즈
    const rate = g.total > 0 ? (g.matched / g.total) * 100 : 0
    rows.push({
      key,
      label: g.label,
      value: rate,
      share: totalCount > 0 ? g.count / totalCount : 0,
      count: g.count,
    })
  }
  rows.sort((a, b) => a.value - b.value)  // 회수율 낮은 거래처가 먼저 (위험)
  return rows
}

export function ReceiptsRecoveryRateInsight() {
  const { data, loading } = useReceiptList()

  // 월별 회수율 = sum(amount - remaining) / sum(amount)
  const trend = useMemo(() => {
    const totals = trend24(data, (r) => r.receipt_date, (r) => r.amount ?? 0)
    const matched = trend24(data, (r) => r.receipt_date, (r) => Math.max((r.amount ?? 0) - (r.remaining ?? 0), 0))
    return totals.map((p, i) => ({
      month: p.month,
      value: p.value > 0 ? Math.round(((matched[i]?.value ?? 0) / p.value) * 1000) / 10 : 0,
    }))
  }, [data])

  const totalAmount = data.reduce((sum, r) => sum + (r.amount ?? 0), 0)
  const totalRemaining = data.reduce((sum, r) => sum + (r.remaining ?? 0), 0)
  const totalRate = totalAmount > 0
    ? Math.round(((totalAmount - totalRemaining) / totalAmount) * 1000) / 10
    : 0

  const byCustomer = useMemo(() => customerRecovery(data).slice(0, 10), [data])

  const tone: 'pos' | 'info' | 'warn' = totalRate >= 90 ? 'pos' : totalRate >= 70 ? 'info' : 'warn'

  return (
    <InsightShell
      title="회수율"
      subtitle="(입금액 - 미정산) / 입금액 — 24개월 월별 + 거래처 회수율 (3건 이상, 위험순)"
      unit="%"
      tone={tone}
      backTo="/orders?tab=receipts"
      backLabel="수금 관리로 돌아가기"
      loading={loading}
      totalLabel="전체 회수율"
      totalValue={fmtPct(totalRate)}
      trend={trend}
      trendValueLabel="회수율"
      formatTrend={fmtPct}
      breakdowns={[
        { label: '거래처 (회수율 낮은순)', rows: byCustomer, unit: '%', formatValue: fmtPct },
      ]}
    />
  )
}
