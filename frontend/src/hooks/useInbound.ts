import { fetchAllPaginated, fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery, useDetailQuery } from '@/lib/queryHelpers';
import type { BLShipment, BLLineItem } from '@/types/inbound';

export function useBLList(filters: { inbound_type?: string; status?: string; manufacturer_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  return useListQuery<BLShipment>(
    ['bls', selectedCompanyId, filters.inbound_type, filters.status, filters.manufacturer_id],
    async () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.inbound_type) params.set('inbound_type', filters.inbound_type);
      if (filters.status) params.set('status', filters.status);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      // 1000건 cap 우회 — 청크 누적으로 전체 받음.
      const list = await fetchAllPaginated<BLShipment>('/api/v1/bls', params.toString());
      // F18: PO번호/LC번호 enrichment — 백엔드가 평탄 반환이라 클라이언트 룩업
      const needPo = Array.from(new Set(list.map((b) => b.po_id).filter((x): x is string => !!x && !list.find((l) => l.po_id === x)?.po_number)));
      const needLc = Array.from(new Set(list.map((b) => b.lc_id).filter((x): x is string => !!x && !list.find((l) => l.lc_id === x)?.lc_number)));
      let poMap: Record<string, string> = {};
      let lcMap: Record<string, string> = {};
      if (needPo.length > 0 || needLc.length > 0) {
        try {
          const pos = await fetchAllPaginated<{ po_id: string; po_number?: string }>('/api/v1/pos', companyParams(selectedCompanyId!).toString());
          poMap = Object.fromEntries(pos.map((p) => [p.po_id, p.po_number ?? '']));
        } catch { /* skip */ }
        try {
          const lcs = await fetchAllPaginated<{ lc_id: string; lc_number?: string; purchase_orders?: { po_number?: string } }>('/api/v1/lcs', companyParams(selectedCompanyId!).toString());
          lcMap = Object.fromEntries(lcs.map((l) => [l.lc_id, l.lc_number ?? '']));
        } catch { /* skip */ }
      }
      return list.map((b) => ({
        ...b,
        po_number: b.po_number ?? (b.po_id ? poMap[b.po_id] : undefined),
        lc_number: b.lc_number ?? (b.lc_id ? lcMap[b.lc_id] : undefined),
      }));
    },
    { enabled: !!selectedCompanyId },
  );
}

export function useBLDetail(blId: string | null) {
  return useDetailQuery<BLShipment>(
    ['bl', blId],
    () => fetchWithAuth<BLShipment>(`/api/v1/bls/${blId}`),
    { enabled: !!blId },
  );
}

export function useBLLines(blId: string | null) {
  return useListQuery<BLLineItem>(
    ['bl-lines', blId],
    () => fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${blId}/lines`),
    { enabled: !!blId },
  );
}
