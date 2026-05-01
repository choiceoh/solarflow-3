import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/appStore';
import { fetchCalc } from '@/lib/companyUtils';
import type { ForecastResponse } from '@/types/inventory';

interface UseForecastOptions {
  manufacturerId?: string;
  productId?: string;
}

function mergeForecast(rs: ForecastResponse[]): ForecastResponse {
  const monthMap = new Map<string, { opening: number; incoming: number; outgoing: number; closing: number; available: number }>();
  for (const r of rs) {
    for (const m of r.summary?.months || []) {
      const prev = monthMap.get(m.month) || { opening: 0, incoming: 0, outgoing: 0, closing: 0, available: 0 };
      monthMap.set(m.month, {
        opening: prev.opening + m.total_opening_kw,
        incoming: prev.incoming + m.total_incoming_kw,
        outgoing: prev.outgoing + m.total_outgoing_kw,
        closing: prev.closing + m.total_closing_kw,
        available: prev.available + m.total_available_kw,
      });
    }
  }
  return {
    products: rs.flatMap((r) => r.products),
    summary: {
      months: Array.from(monthMap.entries()).map(([month, v]) => ({
        month, total_opening_kw: v.opening, total_incoming_kw: v.incoming,
        total_outgoing_kw: v.outgoing, total_closing_kw: v.closing, total_available_kw: v.available,
      })),
    },
    calculated_at: rs[0]?.calculated_at ?? new Date().toISOString(),
  };
}

export function useForecast(opts: UseForecastOptions = {}) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const q = useQuery<ForecastResponse, Error>({
    queryKey: ['forecast', selectedCompanyId, opts.manufacturerId, opts.productId],
    queryFn: () => {
      const extra: Record<string, unknown> = { months_ahead: 6 };
      if (opts.manufacturerId) extra.manufacturer_id = opts.manufacturerId;
      if (opts.productId) extra.product_id = opts.productId;
      return fetchCalc<ForecastResponse>(selectedCompanyId, '/api/v1/calc/supply-forecast', extra, mergeForecast);
    },
    enabled: !!selectedCompanyId,
  });

  let error: string | null = null;
  if (q.error) {
    const msg = q.error.message;
    error = msg.includes('503') || msg.includes('unavailable')
      ? '계산 엔진이 일시적으로 사용할 수 없습니다'
      : msg;
  } else if (!selectedCompanyId) {
    error = '법인을 선택해주세요';
  }

  return {
    data: q.data ?? null,
    loading: q.isLoading,
    error,
    reload: async () => { await q.refetch(); },
  };
}
