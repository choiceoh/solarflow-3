// 활성 출고 (status=active) 드릴다운 — 처리 중 출고를 용도/거래처/제조사 별로 본다.

import { useMemo } from 'react'
import { useOutboundDashboard } from '@/hooks/useOutbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function OutboundActiveInsight() {
  const { dashboard, loading } = useOutboundDashboard({ status: 'active', period: 'lifetime' })

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.count })),
    [dashboard],
  )
  const total = dashboard?.totals.count ?? 0

  const byUsage: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_usage ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )
  const byCustomer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_customer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )
  const byManufacturer: BreakdownRow[] = useMemo(
    () =>
      (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        value: r.count,
        share: r.share,
        count: r.count,
      })),
    [dashboard],
  )

  return (
    <InsightShell
      title="활성 출고"
      subtitle="status=active 출고의 월별 추세 · 용도·거래처·제조사 분해"
      unit="건"
      tone="info"
      backTo="/orders?tab=outbound"
      backLabel="출고 / 판매로 돌아가기"
      loading={loading}
      totalLabel="활성"
      totalValue={total.toLocaleString()}
      trend={trend}
      trendValueLabel="활성 출고"
      breakdowns={[
        { label: '용도', rows: byUsage, unit: '건' },
        { label: '거래처 상위 10', rows: byCustomer, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
      ]}
    />
  )
}
