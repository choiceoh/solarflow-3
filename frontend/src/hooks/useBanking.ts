import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc, companyQueryUrl } from '@/lib/companyUtils';
import type { LimitChange, LCLimitTimeline, LCMaturityAlert, LCFeeCalc, BankLimitRow } from '@/types/banking';
import type { Bank } from '@/types/masters';
import type { LCRecord } from '@/types/procurement';
import type { Company } from '@/types/masters';

export interface BankLimitGroup {
  company_id: string;
  company_name: string;
  rows: BankLimitRow[];
}

/**
 * useAllBankLimitGroups — 모든 법인의 은행별 한도 현황을 Go API에서 직접 집계
 * 실행금액 = 미결제(status != settled) + 미상환(repaid != true) LC 합산
 * TODO: Rust 계산엔진 연동
 */
export function useAllBankLimitGroups() {
  const [groups, setGroups] = useState<BankLimitGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [banks, lcs, companies] = await Promise.all([
        fetchWithAuth<Bank[]>('/api/v1/banks').catch(() => [] as Bank[]),
        fetchWithAuth<LCRecord[]>('/api/v1/lcs').catch(() => [] as LCRecord[]),
        fetchWithAuth<Company[]>('/api/v1/companies').catch(() => [] as Company[]),
      ]);

      // 활성 LC만 집계 (결제완료·상환 제외)
      const activeLcs = (lcs ?? []).filter((l) => l.status !== 'settled' && !l.repaid);
      // bank_id별 실행금액
      const usedByBank: Record<string, number> = {};
      activeLcs.forEach((l) => {
        usedByBank[l.bank_id] = (usedByBank[l.bank_id] ?? 0) + (l.amount_usd ?? 0);
      });

      // 법인별로 그룹핑
      const companyMap = new Map((companies ?? []).map((c) => [c.company_id, c.company_name]));
      const groupMap: Record<string, BankLimitGroup> = {};
      // 법인 순서 고정
      (companies ?? []).forEach((c) => {
        groupMap[c.company_id] = { company_id: c.company_id, company_name: c.company_name, rows: [] };
      });

      (banks ?? []).filter((b) => b.is_active).forEach((b) => {
        const used = usedByBank[b.bank_id] ?? 0;
        const available = Math.max(0, b.lc_limit_usd - used);
        const usage_rate = b.lc_limit_usd > 0 ? (used / b.lc_limit_usd) * 100 : 0;
        const row: BankLimitRow = {
          bank_id: b.bank_id,
          bank_name: b.bank_name,
          limit_approve_date: b.limit_approve_date,
          limit_expiry_date: b.limit_expiry_date,
          lc_limit_usd: b.lc_limit_usd,
          used,
          available,
          usage_rate,
          opening_fee_rate: b.opening_fee_rate,
          acceptance_fee_rate: b.acceptance_fee_rate,
          fee_calc_method: b.fee_calc_method,
        };
        const cid = b.company_id;
        const companyName = companyMap.get(cid) ?? cid;
        if (!groupMap[cid]) groupMap[cid] = { company_id: cid, company_name: companyName, rows: [] };
        groupMap[cid].rows.push(row);
      });

      setGroups(Object.values(groupMap).filter((g) => g.rows.length > 0));
    } catch { setGroups([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { groups, loading, reload: load };
}

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
