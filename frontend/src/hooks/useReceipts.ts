import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import type { Receipt } from '@/types/orders';

export function useReceiptList(filters: { customer_id?: string; month?: string } = {}) {
  const [data, setData] = useState<Receipt[]>([]);
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
      const list = await fetchWithAuth<Receipt[]>(`/api/v1/receipts?${params}`);
      setData(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    }
    setLoading(false);
  }, [selectedCompanyId, filters.customer_id, filters.month]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
