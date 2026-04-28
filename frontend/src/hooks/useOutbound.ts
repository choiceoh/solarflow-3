import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import type { Outbound, SaleListItem } from '@/types/outbound';

export function useOutboundList(filters: { status?: string; usage_category?: string; manufacturer_id?: string } = {}) {
  const [data, setData] = useState<Outbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.status) params.set('status', filters.status);
      if (filters.usage_category) params.set('usage_category', filters.usage_category);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      const list = await fetchWithAuth<Outbound[]>(`/api/v1/outbounds?${params}`);
      setData(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    }
    setLoading(false);
  }, [selectedCompanyId, filters.status, filters.usage_category, filters.manufacturer_id]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

export function useOutboundDetail(outboundId: string | null) {
  const [data, setData] = useState<Outbound | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!outboundId) { setData(null); return; }
    setLoading(true);
    try {
      const result = await fetchWithAuth<Outbound>(`/api/v1/outbounds/${outboundId}`);
      setData(result);
    } catch { setData(null); }
    setLoading(false);
  }, [outboundId]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

export function useSaleList(filters: { customer_id?: string; month?: string; invoice_status?: string } = {}) {
  const [data, setData] = useState<SaleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.month) params.set('month', filters.month);
      if (filters.invoice_status) params.set('invoice_status', filters.invoice_status);
      const list = await fetchWithAuth<SaleListItem[]>(`/api/v1/sales?${params}`);
      setData(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    }
    setLoading(false);
  }, [selectedCompanyId, filters.customer_id, filters.month, filters.invoice_status]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
