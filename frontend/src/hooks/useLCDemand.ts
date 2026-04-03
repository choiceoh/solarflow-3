import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyQueryUrl, fetchCalc } from '@/lib/companyUtils';
import type { PurchaseOrder, POLineItem, LCRecord, TTRemittance } from '@/types/procurement';
import type { LCDemandByPO, LCDemandMonthly, LCLimitTimeline } from '@/types/banking';

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
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [poTotals, setPoTotals] = useState<Record<string, number>>({});
  const [tts, setTts] = useState<TTRemittance[]>([]);
  const [lcs, setLcs] = useState<LCRecord[]>([]);
  const [timeline, setTimeline] = useState<LCLimitTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedCompanyId) {
      setPos([]); setPoTotals({}); setTts([]); setLcs([]); setTimeline(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. PO/TT/LC 병렬 조회 (CRUD — "all"이면 company_id 생략)
      const [poData, ttData, lcData] = await Promise.all([
        fetchWithAuth<PurchaseOrder[]>(companyQueryUrl('/api/v1/pos', selectedCompanyId)),
        fetchWithAuth<TTRemittance[]>(companyQueryUrl('/api/v1/tts', selectedCompanyId)),
        fetchWithAuth<LCRecord[]>(companyQueryUrl('/api/v1/lcs', selectedCompanyId)),
      ]);
      const activePOs = poData.filter((p) => p.status === 'contracted' || p.status === 'shipping');
      setPos(activePOs);
      setTts(ttData);
      setLcs(lcData);

      // 2. 각 PO의 라인아이템 병렬 조회 → total_amount_usd 합산
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
      for (const r of lineResults) {
        totals[r.poId] = r.total;
      }
      setPoTotals(totals);

      // 3. Rust lc-limit-timeline (D-060: "all"이면 법인별 호출 후 merge)
      try {
        const tl = await fetchCalc<LCLimitTimeline>(
          selectedCompanyId, '/api/v1/calc/lc-limit-timeline', { months_ahead: 3 }, mergeTimeline,
        );
        setTimeline(tl);
      } catch {
        setTimeline(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LC 수요 데이터 조회 실패');
    }
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { load(); }, [load]);

  // PO별 LC 수요 계산
  const demandByPO: LCDemandByPO[] = useMemo(() => {
    return pos.map((po) => {
      // TT: 해당 PO의 completed 합산
      const ttPaid = tts
        .filter((t) => t.po_id === po.po_id && t.status === 'completed')
        .reduce((sum, t) => sum + t.amount_usd, 0);

      // LC: 해당 PO의 opened/docs_received 합산
      const lcOpened = lcs
        .filter((l) => l.po_id === po.po_id && (l.status === 'opened' || l.status === 'docs_received'))
        .reduce((sum, l) => sum + l.amount_usd, 0);

      // PO 총액: 라인아이템 total_amount_usd 합산
      const poTotal = poTotals[po.po_id] || 0;

      // LC 미개설 = PO총액 - TT입금(completed) - LC개설(opened/docs_received)
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
  }, [pos, poTotals, tts, lcs]);

  // 총 LC 미개설
  const totalLCNeeded = demandByPO.reduce((s, d) => s + d.lc_needed_usd, 0);

  // 가용한도 (타임라인에서)
  const totalAvailable = timeline?.bank_summaries
    ? timeline.bank_summaries.reduce((s, b) => s + b.available, 0)
    : 0;

  // 3개월 예측
  const monthlyForecast: LCDemandMonthly[] = useMemo(() => {
    if (!timeline?.monthly_projection) return [];
    return timeline.monthly_projection.map((mp) => {
      // 해당 월에 lc_due_date가 있는 PO의 lc_needed 합산
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
    loading,
    error,
    reload: load,
  };
}
