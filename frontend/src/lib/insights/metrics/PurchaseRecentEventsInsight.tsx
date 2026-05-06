// 최근 이벤트 (건) 드릴다운 — PO/PH/LC/BL/TT 발생 이벤트의 월별 + 종류별 분해.

import { useMemo } from 'react'
import { usePOList, usePriceHistoryList, useLCList, useTTList } from '@/hooks/useProcurement'
import { useBLList } from '@/hooks/useInbound'
import { breakdownBy, trend24 } from '@/lib/insights/aggregations'
import InsightShell from '@/components/insights/InsightShell'

interface EventRow {
  kind: 'po' | 'variant' | 'price' | 'lc_open' | 'lc_settle' | 'bl' | 'tt'
  date: string | null
}

const KIND_LABEL: Record<EventRow['kind'], string> = {
  po: 'PO 생성',
  variant: '변경계약',
  price: '단가 변동',
  lc_open: 'LC 개설',
  lc_settle: 'LC 결제',
  bl: 'B/L 등록',
  tt: 'T/T 송금',
}

export function PurchaseRecentEventsInsight() {
  const { data: pos, loading: posLoading } = usePOList()
  const { data: phs, loading: phsLoading } = usePriceHistoryList()
  const { data: lcs, loading: lcsLoading } = useLCList()
  const { data: bls, loading: blsLoading } = useBLList()
  const { data: tts, loading: ttsLoading } = useTTList()

  const events = useMemo<EventRow[]>(() => {
    const rows: EventRow[] = []
    for (const po of pos) {
      rows.push({ kind: po.parent_po_id ? 'variant' : 'po', date: po.contract_date ?? null })
    }
    for (const ph of phs) {
      rows.push({ kind: 'price', date: ph.change_date })
    }
    for (const lc of lcs) {
      if (lc.open_date) rows.push({ kind: 'lc_open', date: lc.open_date })
      if (lc.settlement_date) rows.push({ kind: 'lc_settle', date: lc.settlement_date })
    }
    for (const bl of bls) {
      rows.push({ kind: 'bl', date: bl.actual_arrival ?? bl.eta ?? bl.etd ?? null })
    }
    for (const tt of tts) {
      rows.push({ kind: 'tt', date: tt.remit_date ?? null })
    }
    return rows
  }, [pos, phs, lcs, bls, tts])

  const trend = useMemo(
    () => trend24(events, (e) => e.date),
    [events],
  )

  const byKind = useMemo(
    () => breakdownBy(
      events,
      (e) => e.kind,
      (e) => KIND_LABEL[e.kind],
      () => 1,
    ),
    [events],
  )

  const loading = posLoading || phsLoading || lcsLoading || blsLoading || ttsLoading

  return (
    <InsightShell
      title="최근 이벤트"
      subtitle="구매 라이프사이클 전체 이벤트 (PO·변경계약·단가·LC·B/L·T/T) — 24개월 추이 + 종류 분해"
      unit="건"
      tone="ink"
      backTo="/purchase-history"
      backLabel="구매 이력으로 돌아가기"
      loading={loading}
      totalLabel="이벤트 합계"
      totalValue={events.length.toLocaleString()}
      trend={trend}
      trendValueLabel="이벤트"
      breakdowns={[
        { label: '이벤트 종류', rows: byKind, unit: '건' },
      ]}
    />
  )
}
