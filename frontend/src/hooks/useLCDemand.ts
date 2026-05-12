import { useMemo } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyQueryUrl, fetchCalc } from '@/lib/companyUtils';
import { useDetailQuery } from '@/lib/queryHelpers';
import type { PurchaseOrder, POLineItem, LCRecord, TTRemittance } from '@/types/procurement';
import type { LCDemandByPO, LCDemandMonthly, LCLimitTimeline } from '@/types/banking';

interface LCDemandSnapshot {
  pos: PurchaseOrder[];
  poTotals: Record<string, number>;
  tts: TTRemittance[];
  lcs: LCRecord[];
  timeline: LCLimitTimeline | null;
}

const EMPTY_SNAPSHOT: LCDemandSnapshot = { pos: [], poTotals: {}, tts: [], lcs: [], timeline: null };

// LC 수요 예측 — D-061 패턴: 프론트에서 Go API 조합
export function useLCDemand() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const q = useDetailQuery<LCDemandSnapshot>(
    ['lc-demand', selectedCompanyId],
    async () => {
      const [poData, ttData, lcData] = await Promise.all([
        fetchWithAuth<PurchaseOrder[]>(companyQueryUrl('/api/v1/pos', selectedCompanyId!)),
        fetchWithAuth<TTRemittance[]>(companyQueryUrl('/api/v1/tts', selectedCompanyId!)),
        fetchWithAuth<LCRecord[]>(companyQueryUrl('/api/v1/lcs', selectedCompanyId!)),
      ]);
      const activePOs = poData.filter((p) => p.status === 'contracted' || p.status === 'in_progress');

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

      let timeline: LCLimitTimeline | null = null;
      try {
        timeline = await fetchCalc<LCLimitTimeline>(
          selectedCompanyId!, '/api/v1/calc/lc-limit-timeline', { months_ahead: 3 },
        );
      } catch { /* timeline 실패 시 null */ }

      return { pos: activePOs, poTotals: totals, tts: ttData, lcs: lcData, timeline };
    },
    { enabled: !!selectedCompanyId },
  );

  const snapshot = q.data ?? EMPTY_SNAPSHOT;

  // PO별 LC 수요 계산
  const demandByPO: LCDemandByPO[] = useMemo(() => {
    return snapshot.pos.map((po) => {
      const ttPaid = snapshot.tts
        .filter((t) => t.po_id === po.po_id && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount_usd, 0);

      const lcOpened = snapshot.lcs
        .filter((l) => l.po_id === po.po_id && (l.status === 'opened' || l.status === 'docs_received'))
        .reduce((sum, l) => sum + l.amount_usd, 0);

      const poTotal = snapshot.poTotals[po.po_id] || 0;
      const lcNeeded = Math.max(0, poTotal - ttPaid - lcOpened);

      // lc_due_date = contract_date + 30일
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
  }, [snapshot]);

  const totalLCNeeded = demandByPO.reduce((s, d) => s + d.lc_needed_usd, 0);
  const totalAvailable = snapshot.timeline?.bank_summaries
    ? snapshot.timeline.bank_summaries.reduce((s, b) => s + b.available, 0)
    : 0;

  const monthlyForecast: LCDemandMonthly[] = useMemo(() => {
    if (!snapshot.timeline?.monthly_projection) return [];
    return snapshot.timeline.monthly_projection.map((mp) => {
      const demand = demandByPO
        .filter((d) => d.lc_due_date?.startsWith(mp.month))
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
  }, [snapshot.timeline, demandByPO]);

  return {
    demandByPO,
    monthlyForecast,
    totalLCNeeded,
    totalAvailable,
    shortage: totalAvailable - totalLCNeeded,
    loading: q.loading,
    error: q.error,
    reload: q.reload,
  };
}
