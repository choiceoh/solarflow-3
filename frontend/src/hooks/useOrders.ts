import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import type { Order } from '@/types/orders';
import type { Outbound } from '@/types/outbound';

export function useOrderList(filters: { status?: string; customer_id?: string; management_category?: string } = {}) {
  const [data, setData] = useState<Order[]>([]);
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
      if (filters.customer_id) params.set('customer_id', filters.customer_id);
      if (filters.management_category) params.set('management_category', filters.management_category);
      const list = await fetchWithAuth<Order[]>(`/api/v1/orders?${params}`);
      setData(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    }
    setLoading(false);
  }, [selectedCompanyId, filters.status, filters.customer_id, filters.management_category]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

export function useOrderDetail(orderId: string | null) {
  const [data, setData] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) { setData(null); return; }
    setLoading(true);
    try {
      const result = await fetchWithAuth<Order>(`/api/v1/orders/${orderId}`);
      setData(result);
    } catch { setData(null); }
    setLoading(false);
  }, [orderId]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

export function useOrderOutbounds(orderId: string | null) {
  const [data, setData] = useState<Outbound[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orderId) { setData([]); return; }
    setLoading(true);
    try {
      const list = await fetchWithAuth<Outbound[]>(`/api/v1/outbounds?order_id=${orderId}`);
      setData(list);
    } catch { setData([]); }
    setLoading(false);
  }, [orderId]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}
