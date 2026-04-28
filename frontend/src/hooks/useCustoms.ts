import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import type { Declaration, DeclarationCost, Expense } from '@/types/customs';

// 면장 목록 조회
export function useDeclarationList(filters: { bl_id?: string; month?: string } = {}) {
  const [data, setData] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.bl_id) params.set('bl_id', filters.bl_id);
      setData(await fetchWithAuth<Declaration[]>(`/api/v1/declarations?${params}`));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.bl_id]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// 면장 상세 조회
export function useDeclarationDetail(id: string | null) {
  const [data, setData] = useState<Declaration | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setData(null); return; }
    setLoading(true);
    try {
      setData(await fetchWithAuth<Declaration>(`/api/v1/declarations/${id}`));
    } catch { setData(null); }
    setLoading(false);
  }, [id]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// 원가 목록 조회 (지적 2번: /api/v1/cost-details 사용!)
export function useCostDetailList(declarationId: string | null) {
  const [data, setData] = useState<DeclarationCost[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!declarationId) { setData([]); return; }
    setLoading(true);
    try {
      setData(await fetchWithAuth<DeclarationCost[]>(`/api/v1/cost-details?declaration_id=${declarationId}`));
    } catch { setData([]); }
    setLoading(false);
  }, [declarationId]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// 부대비용 목록 조회
export function useExpenseList(filters: { bl_id?: string; month?: string; expense_type?: string } = {}) {
  const [data, setData] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.bl_id) params.set('bl_id', filters.bl_id);
      if (filters.month) params.set('month', filters.month);
      if (filters.expense_type) params.set('expense_type', filters.expense_type);
      setData(await fetchWithAuth<Expense[]>(`/api/v1/expenses?${params}`));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.bl_id, filters.month, filters.expense_type]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}
