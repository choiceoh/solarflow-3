import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { isAllCompanies } from '@/lib/companyUtils';
import type { InventoryResponse } from '@/types/inventory';
import type { Company } from '@/types/masters';

interface UseInventoryOptions {
  manufacturerId?: string;
  productId?: string;
}

function mergeInventory(rs: InventoryResponse[]): InventoryResponse {
  return {
    items: rs.flatMap((r) => r.items),
    summary: {
      total_physical_kw: rs.reduce((s, r) => s + r.summary.total_physical_kw, 0),
      total_available_kw: rs.reduce((s, r) => s + r.summary.total_available_kw, 0),
      total_incoming_kw: rs.reduce((s, r) => s + r.summary.total_incoming_kw, 0),
      total_secured_kw: rs.reduce((s, r) => s + r.summary.total_secured_kw, 0),
    },
    calculated_at: rs[0]?.calculated_at ?? new Date().toISOString(),
  };
}

function withCompany(result: InventoryResponse, company?: Company): InventoryResponse {
  if (!company) return result;
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      company_id: company.company_id,
      company_name: company.company_name,
    })),
  };
}

export function useInventory(opts: UseInventoryOptions = {}) {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const companies = useAppStore((s) => s.companies);
  const companiesLoaded = useAppStore((s) => s.companiesLoaded);
  const loadCompanies = useAppStore((s) => s.loadCompanies);

  const load = useCallback(async () => {
    if (!selectedCompanyId) {
      setData(null);
      setError('법인을 선택해주세요');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const extra: Record<string, unknown> = {};
      if (opts.manufacturerId) extra.manufacturer_id = opts.manufacturerId;
      if (opts.productId) extra.product_id = opts.productId;

      if (!companiesLoaded) await loadCompanies();
      const activeCompanies = useAppStore.getState().companies;

      let result: InventoryResponse;
      if (isAllCompanies(selectedCompanyId)) {
        const results = await Promise.all(
          activeCompanies.map((company) =>
            fetchWithAuth<InventoryResponse>('/api/v1/calc/inventory', {
              method: 'POST',
              body: JSON.stringify({ company_id: company.company_id, ...extra }),
            })
              .then((response) => withCompany(response, company))
              .catch(() => null),
          ),
        );
        result = mergeInventory(results.filter(Boolean) as InventoryResponse[]);
      } else {
        const company = activeCompanies.find((c) => c.company_id === selectedCompanyId)
          ?? companies.find((c) => c.company_id === selectedCompanyId);
        const response = await fetchWithAuth<InventoryResponse>('/api/v1/calc/inventory', {
          method: 'POST',
          body: JSON.stringify({ company_id: selectedCompanyId, ...extra }),
        });
        result = withCompany(response, company);
      }
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '재고 조회 실패';
      setError(msg.includes('503') || msg.includes('unavailable')
        ? '계산 엔진이 일시적으로 사용할 수 없습니다'
        : msg);
    }
    setLoading(false);
  }, [selectedCompanyId, opts.manufacturerId, opts.productId, companies, companiesLoaded, loadCompanies]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
