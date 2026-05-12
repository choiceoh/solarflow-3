// 감사 로그 (purchase_orders entity, 최근 1년) 드릴다운.

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchWithAuth } from '@/lib/api'
import { sanitizeAuditLogs, type SafeAuditLog } from '@/lib/purchaseHistory'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

export function PurchaseAuditLogsInsight() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [audits, setAudits] = useState<SafeAuditLog[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedCompanyId) return
    const from = new Date()
    from.setFullYear(from.getFullYear() - 1)
    const fromIso = from.toISOString().slice(0, 10)
    const controller = new AbortController()
    setLoading(true)
    fetchWithAuth<unknown>(
      `/api/v1/audit-logs?entity_type=purchase_orders&from=${fromIso}&limit=1000`,
      { signal: controller.signal },
    )
      .then((raw) => setAudits(sanitizeAuditLogs(raw)))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setAudits([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [selectedCompanyId])

  const trend = useMemo(() => trend24(audits, (a) => a.created_at), [audits])

  const byActor = useMemo(
    () =>
      breakdownBy(
        audits,
        (a) => a.user_email ?? a.user_id ?? null,
        (a) => a.user_email ?? a.user_id ?? '미지정',
        () => 1,
      ).slice(0, 10),
    [audits],
  )
  const byAction = useMemo(
    () => breakdownBy(audits, (a) => a.action, (a) => a.action, () => 1),
    [audits],
  )

  return (
    <InsightShell
      title="감사 로그"
      subtitle={`최근 1년 purchase_orders 감사 ${audits.length.toLocaleString()}건 (limit 1000) · 행위자·동작 분해`}
      unit="건"
      tone="ink"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="감사 누계"
      totalValue={audits.length.toLocaleString()}
      trend={trend}
      trendValueLabel="감사"
      breakdowns={[
        { label: '동작', rows: byAction, unit: '건' },
        { label: '행위자 상위 10', rows: byActor, unit: '건' },
      ]}
    />
  )
}
