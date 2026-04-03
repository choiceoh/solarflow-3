import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import type { PurchaseOrder, POLineItem, LCRecord, TTRemittance, PriceHistory } from '@/types/procurement';

export function usePOList(filters: { status?: string; manufacturer_id?: string; contract_type?: string } = {}) {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.status) params.set('status', filters.status);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      if (filters.contract_type) params.set('contract_type', filters.contract_type);
      setData(await fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?${params}`));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.status, filters.manufacturer_id, filters.contract_type]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

export function usePOLines(poId: string | null) {
  const [data, setData] = useState<POLineItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!poId) { setData([]); return; }
    setLoading(true);
    try { setData(await fetchWithAuth<POLineItem[]>(`/api/v1/pos/${poId}/lines`)); } catch { setData([]); }
    setLoading(false);
  }, [poId]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

export function useLCList(filters: { status?: string; bank_id?: string; po_id?: string } = {}) {
  const [data, setData] = useState<LCRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.status) params.set('status', filters.status);
      if (filters.bank_id) params.set('bank_id', filters.bank_id);
      if (filters.po_id) params.set('po_id', filters.po_id);
      setData(await fetchWithAuth<LCRecord[]>(`/api/v1/lcs?${params}`));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.status, filters.bank_id, filters.po_id]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

export function useTTList(filters: { status?: string; po_id?: string } = {}) {
  const [data, setData] = useState<TTRemittance[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.status) params.set('status', filters.status);
      if (filters.po_id) params.set('po_id', filters.po_id);
      setData(await fetchWithAuth<TTRemittance[]>(`/api/v1/tts?${params}`));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.status, filters.po_id]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

export function usePriceHistoryList(filters: { manufacturer_id?: string } = {}) {
  const [data, setData] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const load = useCallback(async () => {
    if (!selectedCompanyId) { setData([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = companyParams(selectedCompanyId);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      setData(await fetchWithAuth<PriceHistory[]>(`/api/v1/price-histories?${params}`));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.manufacturer_id]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}
