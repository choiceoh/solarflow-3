import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import type { BLShipment, BLLineItem } from '@/types/inbound';

export function useBLList(filters: { inbound_type?: string; status?: string } = {}) {
  const [data, setData] = useState<BLShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.inbound_type) params.set('inbound_type', filters.inbound_type);
      if (filters.status) params.set('status', filters.status);
      const list = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?${params}`);
      setData(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    }
    setLoading(false);
  }, [selectedCompanyId, filters.inbound_type, filters.status]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

export function useBLDetail(blId: string | null) {
  const [data, setData] = useState<BLShipment | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!blId) { setData(null); return; }
    setLoading(true);
    try {
      const result = await fetchWithAuth<BLShipment>(`/api/v1/bls/${blId}`);
      setData(result);
    } catch { setData(null); }
    setLoading(false);
  }, [blId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

export function useBLLines(blId: string | null) {
  const [data, setData] = useState<BLLineItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!blId) { setData([]); return; }
    setLoading(true);
    try {
      const list = await fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${blId}/lines`);
      setData(list);
    } catch { setData([]); }
    setLoading(false);
  }, [blId]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}
