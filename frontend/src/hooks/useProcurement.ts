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

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
      const raw = await fetchWithAuth<Array<LCRecord & { banks?: { bank_name?: string }; companies?: { company_name?: string }; purchase_orders?: { po_number?: string } }>>(`/api/v1/lcs?${params}`);
      setData(raw.map((r) => ({
        ...r,
        bank_name: r.bank_name ?? r.banks?.bank_name,
        company_name: r.company_name ?? r.companies?.company_name,
        po_number: r.po_number ?? r.purchase_orders?.po_number,
      })));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.status, filters.bank_id, filters.po_id]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// API 응답 중첩 구조: purchase_orders.po_number, purchase_orders.manufacturers.name_kr
type RawTT = TTRemittance & {
  purchase_orders?: { po_number?: string; manufacturers?: { name_kr?: string } };
};

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
      const raw = await fetchWithAuth<RawTT[]>(`/api/v1/tts?${params}`);
      setData(raw.map((r) => ({
        ...r,
        po_number: r.po_number ?? r.purchase_orders?.po_number ?? undefined,
        manufacturer_name: r.manufacturer_name ?? r.purchase_orders?.manufacturers?.name_kr ?? undefined,
      })));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.status, filters.po_id]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

type RawPriceHistory = PriceHistory & {
  manufacturers?: { name_kr: string };
  products?: { product_code: string; product_name: string; spec_wp?: number };
  purchase_orders?: { po_number?: string };
};

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
      const raw = await fetchWithAuth<RawPriceHistory[]>(`/api/v1/price-histories?${params}`);
      setData(raw.map((r) => ({
        ...r,
        manufacturer_name: r.manufacturer_name ?? r.manufacturers?.name_kr,
        product_name: r.product_name ?? r.products?.product_name,
        spec_wp: r.spec_wp ?? r.products?.spec_wp,
        related_po_number: r.related_po_number ?? r.purchase_orders?.po_number ?? undefined,
      })));
    } catch { setData([]); }
    setLoading(false);
  }, [selectedCompanyId, filters.manufacturer_id]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}
