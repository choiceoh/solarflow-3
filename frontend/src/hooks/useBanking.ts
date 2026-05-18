import { useState, useCallback } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAllPaginated, fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc, companyParams, companyQueryUrl } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { LimitChange, LCLimitTimeline, LCMaturityAlert, LCFeeCalc, BankLimitRow } from '@/types/banking';
import type { Bank } from '@/types/masters';
import type { LCRecord } from '@/types/procurement';
import type { Company } from '@/types/masters';
import type { BLShipment } from '@/types/inbound';

export interface BankLimitGroup {
  company_id: string;
  company_name: string;
  rows: BankLimitRow[];
}

// BankingPage 4개 insight (TotalLimit/Used/Available/MaturityAlert) 의 SQL 집계.
// banks + lc_records + limit_changes 한 번에 SQL round-trip.
export interface BankingDashboard {
  totals: {
    bank_count: number;
    company_count: number;
    total_limit_usd: number;
    total_used_usd: number;
    total_available_usd: number;
  };
  trend24: {
    month: string;
    limit_delta_usd: number;
    lc_open_usd: number;
    lc_open_count: number;
  }[];
  by_bank: (BankLimitRow & {
    company_id: string;
    company_name: string;
  })[];
  by_company: {
    key: string;
    label: string;
    bank_count: number;
    limit_usd: number;
    used_usd: number;
    available_usd: number;
  }[];
  maturity: {
    total_count: number;
    by_urgency: { key: string; label: string; count: number; amount_usd_sum: number; share: number }[];
    by_bank_top10: { key: string; label: string; count: number; amount_usd_sum: number; share: number }[];
  };
}

export function useBankingDashboard() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const q = useQuery<BankingDashboard, Error>({
    queryKey: ['banking-dashboard', selectedCompanyId],
    queryFn: async () => {
      const params = companyParams(selectedCompanyId!);
      return fetchWithAuth<BankingDashboard>(`/api/v1/banking/dashboard?${params}`);
    },
    enabled: !!selectedCompanyId,
    placeholderData: keepPreviousData,
  });
  return {
    dashboard: q.data ?? null,
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.error ? q.error.message : null,
    reload: async () => { await q.refetch(); },
  };
}

// 활성 법인 표시 우선순위 (TS → DW → HS). 신규 법인은 가나다 순으로 뒤에 붙음.
const COMPANY_DISPLAY_ORDER: Record<string, number> = {
  TS: 0,
  DW: 1,
  HS: 2,
};

/**
 * useAllBankLimitGroups — 모든 활성 법인의 은행별 한도 현황을 Go API에서 직접 집계.
 * 은행이 0개인 활성 법인도 빈 카드로 노출 (등록 유도 목적).
 *
 * 한도 점유 판정 (M160, M142 모델 준수):
 *   PO 1개 → LC 1개 → BL 여러 개 (평균 spread 10일). LC 1행에 만기 단일값 표현 불가
 *   → 만기는 `bl_shipments.lc_maturity_date` (B/L date + 90일) 에 BL 단위로 보관.
 *
 * 한도 점유 = 미상환 + 미취소 + EXISTS(BL where lc_maturity_date >= today).
 *   BL 미연결 LC = 데이터 갭 (2024년 LC 21건 등) 으로 간주, 자동 상환 처리.
 *   재경실 룰: 만기 지난 BL 은 자동 상환 → 한도 복귀.
 */
export function useAllBankLimitGroups() {
  const q = useListQuery<BankLimitGroup>(
    ['bank-limit-groups'],
    async () => {
      const [banks, lcs, companies, bls] = await Promise.all([
        fetchWithAuth<Bank[]>('/api/v1/banks').catch(() => [] as Bank[]),
        fetchWithAuth<LCRecord[]>('/api/v1/lcs').catch(() => [] as LCRecord[]),
        fetchWithAuth<Company[]>('/api/v1/companies').catch(() => [] as Company[]),
        fetchAllPaginated<BLShipment>('/api/v1/bls', '').catch(() => [] as BLShipment[]),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const lcsWithFutureBl = new Set<string>();
      for (const bl of bls ?? []) {
        if (bl.lc_id && bl.lc_maturity_date && bl.lc_maturity_date >= today) {
          lcsWithFutureBl.add(bl.lc_id);
        }
      }
      const activeLcs = (lcs ?? []).filter(
        (l) => !l.repaid && l.status !== 'cancelled' && lcsWithFutureBl.has(l.lc_id),
      );
      const usedByBank: Record<string, number> = {};
      activeLcs.forEach((l) => {
        usedByBank[l.bank_id] = (usedByBank[l.bank_id] ?? 0) + (l.amount_usd ?? 0);
      });

      const activeCompanies = (companies ?? []).filter((c) => c.is_active);
      const companyMap = new Map(activeCompanies.map((c) => [c.company_id, c.company_name]));
      const codeMap = new Map(activeCompanies.map((c) => [c.company_id, c.company_code]));
      const groupMap: Record<string, BankLimitGroup> = {};
      activeCompanies.forEach((c) => {
        groupMap[c.company_id] = { company_id: c.company_id, company_name: c.company_name, rows: [] };
      });

      (banks ?? []).filter((b) => b.is_active).forEach((b) => {
        const rawUsed = usedByBank[b.bank_id] ?? 0;
        const used = Math.min(rawUsed, b.lc_limit_usd);
        const available = Math.max(0, b.lc_limit_usd - used);
        const usage_rate = b.lc_limit_usd > 0 ? Math.min(100, (used / b.lc_limit_usd) * 100) : 0;
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
        // 비활성 법인의 은행은 그룹이 없으므로 자연스럽게 제외됨
        if (!groupMap[cid]) return;
        const companyName = companyMap.get(cid) ?? cid;
        groupMap[cid].company_name = companyName;
        groupMap[cid].rows.push(row);
      });

      return Object.values(groupMap).sort((a, b) => {
        const codeA = codeMap.get(a.company_id) ?? '';
        const codeB = codeMap.get(b.company_id) ?? '';
        const orderA = COMPANY_DISPLAY_ORDER[codeA] ?? 100 + codeA.charCodeAt(0);
        const orderB = COMPANY_DISPLAY_ORDER[codeB] ?? 100 + codeB.charCodeAt(0);
        return orderA - orderB;
      });
    },
  );
  return { groups: q.data, loading: q.loading, reload: q.reload };
}

// 한도 변경 이력 조회 (CRUD — "all"이면 company_id 생략)
export function useLimitChangeList() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  return useListQuery<LimitChange>(
    ['limit-changes', selectedCompanyId],
    () => fetchWithAuth<LimitChange[]>(companyQueryUrl('/api/v1/limit-changes', selectedCompanyId!)),
    { enabled: !!selectedCompanyId },
  );
}

// Rust: LC 한도 타임라인
export function useLCLimitTimeline(monthsAhead: number = 3) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const q = useDetailQuery<LCLimitTimeline>(
    ['lc-limit-timeline', selectedCompanyId, monthsAhead],
    () => fetchCalc<LCLimitTimeline>(
      selectedCompanyId!, '/api/v1/calc/lc-limit-timeline', { months_ahead: monthsAhead },
    ),
    { enabled: !!selectedCompanyId },
  );
  return { data: q.data, loading: q.loading, error: q.error, reload: q.reload };
}

// Rust: LC 만기 알림
export function useLCMaturityAlert(daysAhead: number = 30) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const q = useDetailQuery<LCMaturityAlert>(
    ['lc-maturity-alert', selectedCompanyId, daysAhead],
    () => fetchCalc<LCMaturityAlert>(
      selectedCompanyId!, '/api/v1/calc/lc-maturity-alert', { days_ahead: daysAhead },
    ),
    { enabled: !!selectedCompanyId },
  );
  return { data: q.data, loading: q.loading, error: q.error, reload: q.reload };
}

// Rust: LC 수수료 계산 (사용자 액션 호출 — 캐시 불필요)
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
