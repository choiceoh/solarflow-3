import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyQueryUrl, fetchCalc } from '@/lib/companyUtils';
import type { PurchaseOrder, POLineItem, LCRecord, TTRemittance } from '@/types/procurement';
import type { LCDemandByPO, LCDemandMonthly, LCLimitTimeline } from '@/types/banking';

interface LCDemandData {
  pos: PurchaseOrder[];
  poTotals: Record<string, number>;
  tts: TTRemittance[];
  lcs: LCRecord[];
  timeline: LCLimitTimeline | null;
}

function mergeTimeline(rs: LCLimitTimeline[]): LCLimitTimeline {
  const projMap = new Map<string, number>();
  for (const r of rs) for (const p of r.monthly_projection || []) projMap.set(p.month, (projMap.get(p.month) || 0) + p.projected_available);
  return {
    bank_summaries: rs.flatMap((r) => r.bank_summaries || []),
    timeline_events: rs.flatMap((r) => r.timeline_events || []),
    monthly_projection: Array.from(projMap.entries()).map(([month, projected_available]) => ({ month, projected_available })),
  };
}

// LC 수요 예측 — D-061 패턴: 프론트에서 Go API 조합
export function useLCDemand() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const q = useQuery<LCDemandData, Error>({
    queryKey: ['lc-demand', selectedCompanyId],
    queryFn: async () => {
      // 1. PO/TT/LC 병렬 조회
      const [poData, ttData, lcData] = await Promise.all([
        fetchWithAuth<PurchaseOrder[]>(companyQueryUrl('/api/v1/pos', selectedCompanyId)),
        fetchWithAuth<TTRemittance[]>(companyQueryUrl('/api/v1/tts', selectedCompanyId)),
        fetchWithAuth<LCRecord[]>(companyQueryUrl('/api/v1/lcs', selectedCompanyId)),
      ]);
      const activePOs = poData.filter((p) => p.status === 'contracted' || p.status === 'in_progress');

      // 2. 활성 PO의 라인아이템 병렬 조회 — Go API에 batch endpoint 없어 N개 병렬 호출
      // (React Query가 각 PO 라인을 별도 캐시 — 재방문 시 즉시 표시)
      const lineResults = await Promise.all(
        activePOs.map((po) =>
          fetchWithAuth<POLineItem[]>(`/api/v1/pos/${po.po_id}/lines`)
            .then((lines) => ({
              poId: po.po_id,
              total: lines.reduce((sum, line) => sum + (line.total_amount_usd || 0), 0),
            }))
            .catch(() => ({ poId: po.po_id, total: 0 }))
        )
      );
      const totals: Record<string, number> = {};
      for (const r of lineResults) totals[r.poId] = r.total;

      // 3. Rust lc-limit-timeline (실패해도 다른 데이터는 표시)
      let timeline: LCLimitTimeline | null = null;
      try {
        timeline = await fetchCalc<LCLimitTimeline>(
          selectedCompanyId, '/api/v1/calc/lc-limit-timeline', { months_ahead: 3 }, mergeTimeline,
        );
      } catch {
        timeline = null;
      }

      return { pos: activePOs, poTotals: totals, tts: ttData, lcs: lcData, timeline };
    },
    enabled: !!selectedCompanyId,
  });

  const pos = useMemo(() => q.data?.pos ?? [], [q.data]);
  const poTotals = useMemo(() => q.data?.poTotals ?? {}, [q.data]);
  const tts = useMemo(() => q.data?.tts ?? [], [q.data]);
  const lcs = useMemo(() => q.data?.lcs ?? [], [q.data]);
  const timeline = q.data?.timeline ?? null;

  // PO별 LC 수요 계산
  const demandByPO: LCDemandByPO[] = useMemo(() => {
    return pos.map((po) => {
      const ttPaid = tts
        .filter((t) => t.po_id === po.po_id && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount_usd, 0);

      const lcOpened = lcs
        .filter((l) => l.po_id === po.po_id && (l.status === 'opened' || l.status === 'docs_received'))
        .reduce((sum, l) => sum + l.amount_usd, 0);

      const poTotal = poTotals[po.po_id] || 0;
      const lcNeeded = Math.max(0, poTotal - ttPaid - lcOpened);

      let lcDueDate: string | undefined;
      let urgency: 'immediate' | 'soon' | 'normal' = 'normal';
      if (po.contract_date) {
        const cd = new Date(po.contract_date);
        cd.setDate(cd.getDate() + 30);
        lcDueDate = cd.toISOString().slice(0, 10);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilDue = Math.floor((cd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilDue < 0) urgency = 'immediate';
        else if (daysUntilDue <= 30) urgency = 'soon';
        else urgency = 'normal';
      }

      return {
        po_id: po.po_id,
        po_number: po.po_number,
        manufacturer_name: po.manufacturer_name,
        po_total_usd: poTotal,
        tt_paid_usd: ttPaid,
        lc_opened_usd: lcOpened,
        lc_needed_usd: lcNeeded,
        contract_date: po.contract_date,
        lc_due_date: lcDueDate,
        urgency,
      };
    }).filter((d) => d.lc_needed_usd > 0 || d.lc_opened_usd > 0 || d.tt_paid_usd > 0);
  }, [pos, poTotals, tts, lcs]);

  const totalLCNeeded = demandByPO.reduce((s, d) => s + d.lc_needed_usd, 0);

  const totalAvailable = timeline?.bank_summaries
    ? timeline.bank_summaries.reduce((s, b) => s + b.available, 0)
    : 0;

  const monthlyForecast: LCDemandMonthly[] = useMemo(() => {
    if (!timeline?.monthly_projection) return [];
    return timeline.monthly_projection.map((mp) => {
      const demand = demandByPO
        .filter((d) => d.lc_due_date && d.lc_due_date.startsWith(mp.month))
        .reduce((s, d) => s + d.lc_needed_usd, 0);

      const shortage = mp.projected_available - demand;
      let status: 'sufficient' | 'caution' | 'shortage' = 'sufficient';
      if (shortage < 0) status = 'shortage';
      else if (mp.projected_available > 0 && shortage / mp.projected_available < 0.2) status = 'caution';

      return {
        month: mp.month,
        lc_demand_usd: demand,
        limit_recovery_usd: 0,
        projected_available_usd: mp.projected_available,
        shortage_usd: shortage,
        status,
      };
    });
  }, [timeline, demandByPO]);

  return {
    demandByPO,
    monthlyForecast,
    totalLCNeeded,
    totalAvailable,
    shortage: totalAvailable - totalLCNeeded,
    loading: q.isLoading,
    error: q.error?.message ?? null,
    reload: async () => { await q.refetch(); },
  };
}
