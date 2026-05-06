// B/L 해외직수입 (건) 드릴다운 — inbound_type=import. OCR 자동입력 대상.
//
// 서버 집계 마이그(C-1 procurement) — useBLDashboard(status_scope=import).

import { useMemo } from 'react'
import { useBLDashboard } from '@/hooks/useInbound'
import InsightShell from '@/components/insights/InsightShell'
import type { TrendPoint, BreakdownRow } from '@/lib/insights/aggregations'

export function ProcurementBlImportInsight() {
  const { dashboard, loading } = useBLDashboard({ status_scope: 'import' })

  const totalImport = dashboard?.totals.import_count ?? 0

  const trend: TrendPoint[] = useMemo(
    () => (dashboard?.trend24 ?? []).map((p) => ({ month: p.month, value: p.import_count })),
    [dashboard],
  )

  const byStatus: BreakdownRow[] = useMemo(
    () => (dashboard?.by_status ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byManufacturer: BreakdownRow[] = useMemo(
    () => (dashboard?.by_manufacturer_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )
  const byPort: BreakdownRow[] = useMemo(
    () => (dashboard?.by_port_top10 ?? []).map((r) => ({
      key: r.key, label: r.label, value: r.count, share: r.share, count: r.count,
    })),
    [dashboard],
  )

  return (
    <InsightShell
      title="B/L 해외직수입"
      subtitle="inbound_type=import — OCR 자동입력 대상. 24개월 추이 + 상태/제조사/항만 분해"
      unit="건"
      tone="pos"
      backTo="/procurement?tab=bl"
      backLabel="B/L 로 돌아가기"
      loading={loading}
      totalLabel="누계"
      totalValue={totalImport.toLocaleString()}
      trend={trend}
      trendValueLabel="해외직수입"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '제조사 상위 10', rows: byManufacturer, unit: '건' },
        { label: '항만 상위 10', rows: byPort, unit: '건' },
      ]}
    />
  )
}
