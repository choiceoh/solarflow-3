// T/T PO 미연결 (Procurement) 드릴다운.
// po_id 가 비어있는 송금 또는 동일 PO 에 여러 송금이 있는 경우(follow-up) 를 표시.

import { useMemo } from 'react'
import { useTTList } from '@/hooks/useProcurement'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

const fmtCount = (n: number) => String(Math.round(n))
const fmtUsdM = (n: number) => (n / 1_000_000).toFixed(2)

export function ProcurementTtOrphanInsight() {
  const { data: tts, loading } = useTTList()

  // po_id 가 falsy 한 TT (orphan) + 동일 PO 에 추가 송금된 TT (follow-up) 를 모두 'unattributed' 로 묶음.
  const { unattributed, orphanCount, followupCount } = useMemo(() => {
    const orphans = tts.filter((t) => !t.po_id)
    const grouped = new Map<string, typeof tts>()
    for (const t of tts) {
      if (!t.po_id) continue
      const arr = grouped.get(t.po_id) ?? []
      arr.push(t)
      grouped.set(t.po_id, arr)
    }
    const followups: typeof tts = []
    for (const list of grouped.values()) {
      if (list.length <= 1) continue
      const sorted = [...list].sort((a, b) => (a.remit_date ?? '').localeCompare(b.remit_date ?? ''))
      followups.push(...sorted.slice(1))
    }
    return {
      unattributed: [...orphans, ...followups],
      orphanCount: orphans.length,
      followupCount: followups.length,
    }
  }, [tts])

  const trend = useMemo(() => trend24(unattributed, (t) => t.remit_date), [unattributed])

  const byStatus = useMemo(
    () => breakdownBy(unattributed, (t) => t.status, (t) => t.status, () => 1),
    [unattributed],
  )
  const byPurpose = useMemo(
    () =>
      breakdownBy(
        unattributed,
        (t) => t.purpose ?? null,
        (t) => t.purpose ?? '미지정',
        () => 1,
      ).slice(0, 10),
    [unattributed],
  )
  const byBank = useMemo(
    () =>
      breakdownBy(
        unattributed,
        (t) => t.bank_name ?? null,
        (t) => t.bank_name ?? '미지정',
        () => 1,
      ).slice(0, 10),
    [unattributed],
  )
  const byAmount = useMemo(
    () =>
      breakdownBy(
        unattributed,
        (t) => t.tt_id,
        (t) => `${t.remit_date ?? '미지정'} · ${t.bank_name ?? ''}`,
        (t) => t.amount_usd ?? 0,
      ).slice(0, 10),
    [unattributed],
  )

  return (
    <InsightShell
      title="T/T PO 미연결"
      subtitle={`PO 미연결 ${orphanCount}건 + 동일 PO 추가 송금 ${followupCount}건 = ${unattributed.length}건. 상태·목적·은행 분해`}
      unit="건"
      tone="warn"
      backTo="/procurement?tab=tt"
      backLabel="T/T 로 돌아가기"
      loading={loading}
      totalLabel="검토 대상"
      totalValue={fmtCount(unattributed.length)}
      trend={trend}
      trendValueLabel="검토 대상"
      breakdowns={[
        { label: '상태', rows: byStatus, unit: '건' },
        { label: '목적', rows: byPurpose, unit: '건' },
        { label: '은행', rows: byBank, unit: '건' },
        { label: '큰 금액 상위 10', rows: byAmount, unit: 'M$', formatValue: fmtUsdM },
      ]}
    />
  )
}
