import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { companyParams } from '@/lib/companyUtils';
import { useListQuery } from '@/lib/queryHelpers';
import type { PurchaseOrder, POLineItem, LCRecord, LCLineItem, TTRemittance, PriceHistory } from '@/types/procurement';

export function usePOList(filters: { status?: string; manufacturer_id?: string; contract_type?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  return useListQuery<PurchaseOrder>(
    ['pos', selectedCompanyId, filters.status, filters.manufacturer_id, filters.contract_type],
    () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.status) params.set('status', filters.status);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      if (filters.contract_type) params.set('contract_type', filters.contract_type);
      return fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?${params}`);
    },
    { enabled: !!selectedCompanyId },
  );
}

export function usePOLines(poId: string | null) {
  return useListQuery<POLineItem>(
    ['po-lines', poId],
    () => fetchWithAuth<POLineItem[]>(`/api/v1/pos/${poId}/lines`),
    { enabled: !!poId },
  );
}

export function useLCLines(lcId: string | null) {
  return useListQuery<LCLineItem>(
    ['lc-lines', lcId],
    () => fetchWithAuth<LCLineItem[]>(`/api/v1/lcs/${lcId}/lines`),
    { enabled: !!lcId },
  );
}

export function useLCList(filters: { status?: string; bank_id?: string; po_id?: string; manufacturer_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  return useListQuery<LCRecord>(
    ['lcs', selectedCompanyId, filters.status, filters.bank_id, filters.po_id, filters.manufacturer_id],
    async () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.status) params.set('status', filters.status);
      if (filters.bank_id) params.set('bank_id', filters.bank_id);
      if (filters.po_id) params.set('po_id', filters.po_id);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      const raw = await fetchWithAuth<Array<LCRecord & { banks?: { bank_name?: string }; companies?: { company_name?: string }; purchase_orders?: { po_number?: string } }>>(`/api/v1/lcs?${params}`);
      return raw.map((r) => ({
        ...r,
        bank_name: r.bank_name ?? r.banks?.bank_name,
        company_name: r.company_name ?? r.companies?.company_name,
        po_number: r.po_number ?? r.purchase_orders?.po_number,
      }));
    },
    { enabled: !!selectedCompanyId },
  );
}

// API 응답 중첩 구조: purchase_orders.po_number, purchase_orders.manufacturers.name_kr
type RawTT = TTRemittance & {
  purchase_orders?: { po_number?: string; manufacturers?: { name_kr?: string } };
};

export function useTTList(filters: { status?: string; po_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  return useListQuery<TTRemittance>(
    ['tts', selectedCompanyId, filters.status, filters.po_id],
    async () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.status) params.set('status', filters.status);
      if (filters.po_id) params.set('po_id', filters.po_id);
      const raw = await fetchWithAuth<RawTT[]>(`/api/v1/tts?${params}`);
      return raw.map((r) => ({
        ...r,
        po_number: r.po_number ?? r.purchase_orders?.po_number ?? undefined,
        manufacturer_name: r.manufacturer_name ?? r.purchase_orders?.manufacturers?.name_kr ?? undefined,
      }));
    },
    { enabled: !!selectedCompanyId },
  );
}

type RawPriceHistory = PriceHistory & {
  manufacturers?: { name_kr: string };
  products?: { product_code: string; product_name: string; spec_wp?: number };
  purchase_orders?: { po_number?: string };
};

export function usePriceHistoryList(filters: { manufacturer_id?: string } = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  return useListQuery<PriceHistory>(
    ['price-histories', selectedCompanyId, filters.manufacturer_id],
    async () => {
      const params = companyParams(selectedCompanyId!);
      if (filters.manufacturer_id) params.set('manufacturer_id', filters.manufacturer_id);
      const raw = await fetchWithAuth<RawPriceHistory[]>(`/api/v1/price-histories?${params}`);
      return raw.map((r) => ({
        ...r,
        manufacturer_name: r.manufacturer_name ?? r.manufacturers?.name_kr,
        product_name: r.product_name ?? r.products?.product_name,
        spec_wp: r.spec_wp ?? r.products?.spec_wp,
        related_po_number: r.related_po_number ?? r.purchase_orders?.po_number ?? undefined,
      }));
    },
    { enabled: !!selectedCompanyId },
  );
}
