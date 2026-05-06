// 진행 P/O (건수) 드릴다운 — ProcurementPage PO 탭 KPI '진행 P/O'.
//
// 서버 집계 마이그(C-1 procurement) — usePODashboard(status_scope=active).

import { useMemo } from 'react'
import { usePODashboard } from '@/hooks/useProcurement'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementPoActiveInsight() {
  const { dashboard, loading } = usePODashboard({ status_scope: 'active' })

  const totalActive = dashboard?.totals.active_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.active_count })),
    [dashboard],
  )

  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byContractType: BreakdownRow[] = useMemo(
    () => (dashboard?.by_contract_type ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byMw: BreakdownRow[] = useMemo(() => {
    const rows = (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.total_mw, share: r.share, count: r.count,
    }))
    return [...rows].sort((a, b) => b.value - a.value).slice(0, 10)
  }, [dashboard])

  return (
    <InsightShell
      title="진행 P/O"
      subtitle="completed/cancelled 제외 PO — 24개월 신규 발생 + 제조사/계약유형 분해"
      unit="건"
      tone="solar"
      backTo="/procurement"
      backLabel="구매로 돌아가기"
      loading={loading}
      totalLabel="진행 합계"
      totalValue={totalActive.toLocaleString()}
      trend={trend}
      trendValueLabel="신규 PO"
      breakdowns={[
        { label: '계약 유형', rows: byContractType, unit: '건' },
        { label: '제조사 상위 10 (건수)', rows: byManufacturer, unit: '건' },
        { label: '제조사 상위 10 (MW)', rows: byMw, unit: 'MW', formatValue: (v) => v.toFixed(1) },
      ]}
    />
  )
}
