import { useMemo, useCallback } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { fetchCalc, companyQueryUrl } from '@/lib/companyUtils';
import type { InventoryResponse } from '@/types/inventory';
import type { BLShipment } from '@/types/inbound';
import type { Order } from '@/types/orders';
import type {
  DashboardSectionState, DashboardSummary, MonthlyRevenue,
  PriceTrend, AlertItem, CompanySummaryRow,
} from '@/types/dashboard';
import type { LCLimitTimeline } from '@/types/banking';
import type { SaleListItem } from '@/types/outbound';
import type { PriceHistory } from '@/types/procurement';

// Rust engine /api/v1/calc/customer-analysis 응답 스키마 정본
export interface CustomerItem {
  customer_id: string;
  customer_name: string;
  total_sales_krw: number;
  total_collected_krw: number;
  outstanding_krw: number;
  outstanding_count: number;
  oldest_outstanding_days: number;
  avg_payment_days?: number | null;
  avg_margin_rate?: number | null;
  total_margin_krw?: number | null;
  avg_deposit_rate?: number | null;
  status: string;
}
export interface CustomerAnalysis {
  items: CustomerItem[];
  summary: {
    total_sales_krw: number;
    total_collected_krw: number;
    total_outstanding_krw: number;
    total_margin_krw: number;
    overall_margin_rate: number;
  };
}

interface PriceTrendResponse {
  manufacturers?: {
    name: string;
    data_points: { period: string; price_usd_wp: number }[];
  }[];
  trends?: {
    manufacturer_name: string;
    product_name: string;
    spec_wp: number;
    data_points: {
      period: string;
      avg_purchase_price_usd_wp?: number | null;
      avg_sale_price_krw_wp?: number | null;
    }[];
  }[];
}

type DashboardPriceHistory = PriceHistory & {
  manufacturers?: { name_kr?: string };
};

const MFG_COLORS: Record<string, string> = {
  '진코솔라': '#3b82f6', 'JinkoSolar': '#3b82f6',
  '트리나솔라': '#ef4444', 'TrinaSolar': '#ef4444',
  '라이젠에너지': '#22c55e', 'Risen': '#22c55e',
  'LONGi': '#f97316', '롱기': '#f97316', '론지': '#f97316',
};
const FALLBACK_COLORS = ['#6b7280', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'];

function mergeCustomer(rs: CustomerAnalysis[]): CustomerAnalysis {
  const merged = new Map<string, CustomerItem>();
  for (const r of rs) {
    for (const it of r.items || []) {
      const prev = merged.get(it.customer_id);
      if (!prev) { merged.set(it.customer_id, { ...it }); continue; }
      const revA = prev.total_sales_krw, revB = it.total_sales_krw;
      const marginA = prev.total_margin_krw ?? null, marginB = it.total_margin_krw ?? null;
      const combinedRev = revA + revB;
      const combinedMargin = (marginA ?? 0) + (marginB ?? 0);
      const combinedCovered = (marginA != null ? revA : 0) + (marginB != null ? revB : 0);
      merged.set(it.customer_id, {
        ...prev,
        total_sales_krw: combinedRev,
        total_collected_krw: prev.total_collected_krw + it.total_collected_krw,
        outstanding_krw: prev.outstanding_krw + it.outstanding_krw,
        outstanding_count: prev.outstanding_count + it.outstanding_count,
        oldest_outstanding_days: Math.max(prev.oldest_outstanding_days, it.oldest_outstanding_days),
        total_margin_krw: (marginA == null && marginB == null) ? null : combinedMargin,
        avg_margin_rate: combinedCovered > 0 ? Math.round((combinedMargin / combinedCovered) * 10000) / 100 : null,
      });
    }
  }
  const items = Array.from(merged.values()).sort((a, b) => b.total_sales_krw - a.total_sales_krw);
  const sumSales = items.reduce((s, i) => s + i.total_sales_krw, 0);
  const sumCollected = items.reduce((s, i) => s + i.total_collected_krw, 0);
  const sumOutstanding = items.reduce((s, i) => s + i.outstanding_krw, 0);
  const sumMargin = items.reduce((s, i) => s + (i.total_margin_krw ?? 0), 0);
  const covered = items.reduce((s, i) => s + (i.total_margin_krw != null ? i.total_sales_krw : 0), 0);
  return {
    items,
    summary: {
      total_sales_krw: sumSales,
      total_collected_krw: sumCollected,
      total_outstanding_krw: sumOutstanding,
      total_margin_krw: sumMargin,
      overall_margin_rate: covered > 0 ? Math.round((sumMargin / covered) * 10000) / 100 : 0,
    },
  };
}

function mergePriceTrend(rs: PriceTrendResponse[]): PriceTrendResponse {
  const seen = new Set<string>();
  const mfgs: NonNullable<PriceTrendResponse['manufacturers']> = [];
  for (const r of rs) {
    for (const m of toManufacturerPriceRows(r)) {
      if (!seen.has(m.name)) { seen.add(m.name); mfgs.push(m); }
    }
  }
  return { manufacturers: mfgs };
}

function toManufacturerPriceRows(r: PriceTrendResponse): NonNullable<PriceTrendResponse['manufacturers']> {
  if (r.manufacturers?.length) return r.manufacturers;
  const byManufacturer = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const trend of r.trends || []) {
    const name = trend.manufacturer_name;
    const periodMap = byManufacturer.get(name) ?? new Map<string, { sum: number; count: number }>();
    for (const point of trend.data_points || []) {
      const price = point.avg_purchase_price_usd_wp;
      if (price == null || price <= 0) continue;
      const prev = periodMap.get(point.period) ?? { sum: 0, count: 0 };
      prev.sum += price;
      prev.count += 1;
      periodMap.set(point.period, prev);
    }
    byManufacturer.set(name, periodMap);
  }
  return Array.from(byManufacturer.entries()).map(([name, periodMap]) => ({
    name,
    data_points: Array.from(periodMap.entries())
      .map(([period, value]) => ({ period, price_usd_wp: value.sum / Math.max(value.count, 1) }))
      .sort((a, b) => a.period.localeCompare(b.period)),
  }));
}

function priceHistoriesToTrend(histories: DashboardPriceHistory[]): PriceTrend {
  const byManufacturer = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const history of histories) {
    const name = history.manufacturers?.name_kr || history.manufacturer_id || '제조사 미지정';
    const period = (history.change_date || '').slice(0, 7);
    if (!period || history.new_price <= 0) continue;
    const periodMap = byManufacturer.get(name) ?? new Map<string, { sum: number; count: number }>();
    const prev = periodMap.get(period) ?? { sum: 0, count: 0 };
    prev.sum += history.new_price;
    prev.count += 1;
    periodMap.set(period, prev);
    byManufacturer.set(name, periodMap);
  }
  return {
    manufacturers: Array.from(byManufacturer.entries()).map(([name, periodMap], i) => ({
      name,
      color: MFG_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      data_points: Array.from(periodMap.entries())
        .map(([period, value]) => ({ period, price_usd_wp: value.sum / Math.max(value.count, 1) }))
        .sort((a, b) => a.period.localeCompare(b.period)),
    })),
  };
}

function mergeLCTimeline(rs: LCLimitTimeline[]): LCLimitTimeline {
  const projMap = new Map<string, number>();
  for (const r of rs) {
    for (const p of r.monthly_projection || []) {
      projMap.set(p.month, (projMap.get(p.month) || 0) + p.projected_available);
    }
  }
  return {
    bank_summaries: rs.flatMap((r) => r.bank_summaries || []),
    timeline_events: rs.flatMap((r) => r.timeline_events || []),
    monthly_projection: Array.from(projMap.entries()).map(([month, projected_available]) => ({ month, projected_available })),
  };
}

function salesToMonthlyRevenue(sales: SaleListItem[]): MonthlyRevenue {
  const map = new Map<string, { month: string; revenue_krw: number; margin_krw: number; margin_rate: number }>();
  for (const item of sales) {
    const date = item.outbound_date ?? item.order_date ?? '';
    const month = date ? date.slice(0, 7) : '날짜 없음';
    const prev = map.get(month) ?? { month, revenue_krw: 0, margin_krw: 0, margin_rate: 0 };
    prev.revenue_krw += item.sale.supply_amount ?? 0;
    map.set(month, prev);
  }
  return { months: Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)) };
}

function section<T>(data: T | null, loading: boolean, error: string | null): DashboardSectionState<T> {
  return { data, loading, error };
}

export function useDashboard(companyId: string | null, userRole: string) {
  const queryClient = useQueryClient();
  const isManager = userRole === 'admin' || userRole === 'manager';
  const enabled = !!companyId;

  const queries = useQueries({
    queries: [
      {
        queryKey: ['dashboard-inventory', companyId],
        queryFn: () => fetchCalc<InventoryResponse>(companyId, '/api/v1/calc/inventory', {}),
        enabled,
      },
      {
        queryKey: ['dashboard-sales', companyId],
        queryFn: () => fetchWithAuth<SaleListItem[]>(companyQueryUrl('/api/v1/sales', companyId)),
        enabled,
      },
      {
        queryKey: ['dashboard-customer-analysis', companyId],
        queryFn: () => fetchCalc<CustomerAnalysis>(companyId, '/api/v1/calc/customer-analysis', {}, mergeCustomer),
        enabled,
      },
      {
        queryKey: ['dashboard-price-trend', companyId],
        queryFn: () => fetchCalc<PriceTrendResponse>(companyId, '/api/v1/calc/price-trend', {}, mergePriceTrend),
        enabled,
      },
      {
        queryKey: ['dashboard-lc-timeline', companyId],
        queryFn: () => fetchCalc<LCLimitTimeline>(companyId, '/api/v1/calc/lc-limit-timeline', { months_ahead: 3 }, mergeLCTimeline),
        enabled,
      },
      {
        queryKey: ['dashboard-bls', companyId],
        queryFn: () => fetchWithAuth<BLShipment[]>(companyQueryUrl('/api/v1/bls', companyId)),
        enabled,
      },
      {
        queryKey: ['dashboard-orders', companyId],
        queryFn: () => fetchWithAuth<Order[]>(companyQueryUrl('/api/v1/orders', companyId)),
        enabled,
      },
      {
        queryKey: ['dashboard-price-histories', companyId],
        queryFn: () => fetchWithAuth<DashboardPriceHistory[]>(companyQueryUrl('/api/v1/price-histories', companyId)),
        enabled,
      },
    ],
  });

  const [invQ, salesQ, custQ, ptQ, tlQ, blQ, orderQ, phQ] = queries;

  const invData = invQ.data ?? null;
  const salesData = salesQ.data ?? null;
  const custData = custQ.data ?? null;
  const tlData = tlQ.data ?? null;
  const blData = useMemo(() => blQ.data ?? [], [blQ.data]);
  const orderData = useMemo(() => orderQ.data ?? [], [orderQ.data]);

  const summary = useMemo<DashboardSectionState<DashboardSummary>>(() => {
    const loading = invQ.isLoading;
    if (invQ.isError && !invData) {
      return section<DashboardSummary>(null, false, '재고 데이터 조회 실패');
    }
    if (!invData) return section<DashboardSummary>(null, loading, null);
    const s = invData.summary;
    return section<DashboardSummary>({
      physical_mw: s.total_physical_kw / 1000,
      available_mw: s.total_available_kw / 1000,
      incoming_mw: s.total_incoming_kw / 1000,
      secured_mw: s.total_secured_kw / 1000,
      outstanding_krw: custData?.summary?.total_outstanding_krw ?? 0,
      lc_available_usd: tlData?.bank_summaries?.reduce((acc, b) => acc + b.available, 0) ?? 0,
    }, loading, null);
  }, [invQ.isLoading, invQ.isError, invData, custData, tlData]);

  const revenue = useMemo<DashboardSectionState<MonthlyRevenue>>(() => {
    if (salesQ.isError) return section<MonthlyRevenue>(null, false, '매출 데이터 조회 실패');
    if (!salesData) return section<MonthlyRevenue>(null, salesQ.isLoading, null);
    return section<MonthlyRevenue>(salesToMonthlyRevenue(salesData), false, null);
  }, [salesQ.isLoading, salesQ.isError, salesData]);

  const priceTrend = useMemo<DashboardSectionState<PriceTrend>>(() => {
    const loading = ptQ.isLoading;
    if (ptQ.data) {
      const mfgs = toManufacturerPriceRows(ptQ.data);
      const colored = mfgs.map((m, i) => ({
        ...m,
        color: MFG_COLORS[m.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      }));
      if (colored.length > 0) return section<PriceTrend>({ manufacturers: colored }, false, null);
      // fallback: price histories
      if (phQ.data) return section<PriceTrend>(priceHistoriesToTrend(phQ.data), false, null);
      return section<PriceTrend>({ manufacturers: [] }, false, null);
    }
    if (ptQ.isError) {
      if (phQ.data) return section<PriceTrend>(priceHistoriesToTrend(phQ.data), false, null);
      return section<PriceTrend>(null, false, '단가 추이 조회 실패');
    }
    return section<PriceTrend>(null, loading, null);
  }, [ptQ.isLoading, ptQ.isError, ptQ.data, phQ.data]);

  const inventory = useMemo<DashboardSectionState<InventoryResponse>>(() => {
    if (invQ.isError) return section<InventoryResponse>(null, false, '재고 데이터 조회 실패');
    return section<InventoryResponse>(invData, invQ.isLoading, null);
  }, [invQ.isLoading, invQ.isError, invData]);

  const sales = useMemo<DashboardSectionState<SaleListItem[]>>(() => {
    if (salesQ.isError) return section<SaleListItem[]>(null, false, '매출 데이터 조회 실패');
    return section<SaleListItem[]>(salesData, salesQ.isLoading, null);
  }, [salesQ.isLoading, salesQ.isError, salesData]);

  const outstanding = useMemo<DashboardSectionState<CustomerAnalysis>>(() => {
    if (custQ.isError) return section<CustomerAnalysis>(null, false, '미수금 데이터 조회 실패');
    return section<CustomerAnalysis>(custData, custQ.isLoading, null);
  }, [custQ.isLoading, custQ.isError, custData]);

  const incoming = useMemo<DashboardSectionState<BLShipment[]>>(() => {
    if (!isManager) return section<BLShipment[]>(null, false, null);
    if (blQ.isError) return section<BLShipment[]>(null, false, '미착품 조회 실패');
    if (!blQ.data) return section<BLShipment[]>(null, blQ.isLoading, null);
    const incomingBLs = blData
      .filter((bl) => bl.status === 'shipping' || bl.status === 'arrived' || bl.status === 'customs')
      .slice(0, 10);
    return section<BLShipment[]>(incomingBLs, false, null);
  }, [isManager, blQ.isLoading, blQ.isError, blQ.data, blData]);

  const orderBacklog = useMemo<DashboardSectionState<Order[]>>(() => {
    if (!isManager) return section<Order[]>(null, false, null);
    if (orderQ.isError) return section<Order[]>(null, false, '수주 잔량 조회 실패');
    if (!orderQ.data) return section<Order[]>(null, orderQ.isLoading, null);
    const backlog = orderData
      .filter((o) => (o.status === 'received' || o.status === 'partial') && (o.remaining_qty ?? 0) > 0)
      .slice(0, 10);
    return section<Order[]>(backlog, false, null);
  }, [isManager, orderQ.isLoading, orderQ.isError, orderQ.data, orderData]);

  const alerts = useMemo<DashboardSectionState<AlertItem[]>>(
    () => section<AlertItem[]>([], false, null),
    [],
  );
  const companySummary = useMemo<DashboardSectionState<CompanySummaryRow[]>>(
    () => section<CompanySummaryRow[]>(null, false, null),
    [],
  );

  const longTermWarning = invData?.items.filter((i) => i.long_term_status === 'warning').length ?? 0;
  const longTermCritical = invData?.items.filter((i) => i.long_term_status === 'critical').length ?? 0;

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['dashboard-inventory', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-sales', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-customer-analysis', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-price-trend', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-lc-timeline', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-bls', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-orders', companyId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard-price-histories', companyId] });
  }, [queryClient, companyId]);

  return {
    summary, revenue, priceTrend, alerts, companySummary,
    incoming, orderBacklog, outstanding, sales, inventory,
    longTermWarning, longTermCritical,
    reload,
  };
}
