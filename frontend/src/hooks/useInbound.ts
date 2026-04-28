import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import type { BLShipment, BLLineItem } from '@/types/inbound';

export function useBLList(filters: { inbound_type?: string; status?: string; manufacturer_id?: string } = {}) {
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
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      const list = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?${params}`);
      // F18: PO번호/LC번호 enrichment — 백엔드가 평탄 반환이라 클라이언트 룩업
      const needPo = Array.from(new Set(list.map((b) => b.po_id).filter((x): x is string => !!x && !list.find((l) => l.po_id === x)?.po_number)));
      const needLc = Array.from(new Set(list.map((b) => b.lc_id).filter((x): x is string => !!x && !list.find((l) => l.lc_id === x)?.lc_number)));
      let poMap: Record<string, string> = {};
      let lcMap: Record<string, string> = {};
      if (needPo.length > 0 || needLc.length > 0) {
        try {
          const pos = await fetchWithAuth<Array<{ po_id: string; po_number?: string }>>(`/api/v1/pos?${companyParams(selectedCompanyId)}`);
          poMap = Object.fromEntries(pos.map((p) => [p.po_id, p.po_number ?? '']));
        } catch { /* skip */ }
        try {
          const lcs = await fetchWithAuth<Array<{ lc_id: string; lc_number?: string; purchase_orders?: { po_number?: string } }>>(`/api/v1/lcs?${companyParams(selectedCompanyId)}`);
          lcMap = Object.fromEntries(lcs.map((l) => [l.lc_id, l.lc_number ?? '']));
        } catch { /* skip */ }
      }
      setData(list.map((b) => ({
        ...b,
        po_number: b.po_number ?? (b.po_id ? poMap[b.po_id] : undefined),
        lc_number: b.lc_number ?? (b.lc_id ? lcMap[b.lc_id] : undefined),
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 실패');
    }
    setLoading(false);
  }, [selectedCompanyId, filters.inbound_type, filters.status, filters.manufacturer_id]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}
