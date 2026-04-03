import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc, companyQueryUrl } from '@/lib/companyUtils';
import type { LimitChange, LCLimitTimeline, LCMaturityAlert, LCFeeCalc } from '@/types/banking';

// 한도 변경 이력 조회 (CRUD — "all"이면 company_id 생략)
export function useLimitChangeList() {
  const [data, setData] = useState<LimitChange[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      setData(await fetchWithAuth<LimitChange[]>(companyQueryUrl('/api/v1/limit-changes', selectedCompanyId)));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
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

// Rust: LC 한도 타임라인
export function useLCLimitTimeline(monthsAhead: number = 3) {
  const [data, setData] = useState<LCLimitTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCalc<LCLimitTimeline>(
        selectedCompanyId, '/api/v1/calc/lc-limit-timeline', { months_ahead: monthsAhead }, mergeTimeline,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LC 한도 타임라인 조회 실패');
      setData(null);
    }
    setLoading(false);
  }, [selectedCompanyId, monthsAhead]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

function mergeMaturity(rs: LCMaturityAlert[]): LCMaturityAlert {
  return { alerts: rs.flatMap((r) => r.alerts || []) };
}

// Rust: LC 만기 알림
export function useLCMaturityAlert(daysAhead: number = 30) {
  const [data, setData] = useState<LCMaturityAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCalc<LCMaturityAlert>(
        selectedCompanyId, '/api/v1/calc/lc-maturity-alert', { days_ahead: daysAhead }, mergeMaturity,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'LC 만기 알림 조회 실패');
      setData(null);
    }
    setLoading(false);
  }, [selectedCompanyId, daysAhead]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// Rust: LC 수수료 계산
export function useLCFeeCalc() {
  const [data, setData] = useState<LCFeeCalc | null>(null);
  const [loading, setLoading] = useState(false);

  const calc = useCallback(async (lcId: string) => {
    setLoading(true);
    try {
      const result = await fetchWithAuth<LCFeeCalc>('/api/v1/calc/lc-fee', {
        method: 'POST',
        body: JSON.stringify({ lc_id: lcId }),
      });
      setData(result);
    } catch { setData(null); }
    setLoading(false);
  }, []);

  return { data, loading, calc };
}
