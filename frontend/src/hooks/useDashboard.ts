import { useState, useEffect, useCallback } from 'react';
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

// 비유: 대시보드 데이터를 독립적으로 조회. 하나 실패해도 나머지는 표시.

// Rust engine /api/v1/calc/customer-analysis 응답 스키마 정본
// (engine/src/model/margin.rs::CustomerAnalysisResponse 와 맞물림)
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
  status: string; // 'normal' | 'warning' | 'overdue'
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

function makeSectionState<T>(initial?: T | null): DashboardSectionState<T> {
  return { data: initial ?? null, loading: true, error: null };
}

// D-060: 다중 법인 합산 merge 함수들 — inventory는 엔진에서 처리하므로 제거됨
function mergeCustomer(rs: CustomerAnalysis[]): CustomerAnalysis {
  // 다중 법인 합산: 같은 거래처가 여러 법인에 걸쳐있으면 customer_id로 병합.
  const merged = new Map<string, CustomerItem>();
  for (const r of rs) {
    for (const it of r.items || []) {
      const prev = merged.get(it.customer_id);
      if (!prev) { merged.set(it.customer_id, { ...it }); continue; }
      // 금액 합산, 비율은 가중 평균 (매출 가중), 일수는 최댓값
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
  const MFG_COLORS: Record<string, string> = {
    '진코솔라': '#3b82f6', 'JinkoSolar': '#3b82f6',
    '트리나솔라': '#ef4444', 'TrinaSolar': '#ef4444',
    '라이젠에너지': '#22c55e', 'Risen': '#22c55e',
    'LONGi': '#f97316', '롱기': '#f97316', '론지': '#f97316',
  };
  return {
    manufacturers: Array.from(byManufacturer.entries()).map(([name, periodMap], i) => ({
      name,
      color: MFG_COLORS[name] || ['#6b7280', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'][i % 5],
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

export function useDashboard(companyId: string | null, userRole: string) {
  const [summary, setSummary] = useState<DashboardSectionState<DashboardSummary>>(makeSectionState());
  const [revenue, setRevenue] = useState<DashboardSectionState<MonthlyRevenue>>(makeSectionState());
  const [priceTrend, setPriceTrend] = useState<DashboardSectionState<PriceTrend>>(makeSectionState());
  const [alerts, setAlerts] = useState<DashboardSectionState<AlertItem[]>>(makeSectionState());
  const [companySummary, setCompanySummary] = useState<DashboardSectionState<CompanySummaryRow[]>>(makeSectionState());
  const [incoming, setIncoming] = useState<DashboardSectionState<BLShipment[]>>(makeSectionState());
  const [orderBacklog, setOrderBacklog] = useState<DashboardSectionState<Order[]>>(makeSectionState());
  const [outstanding, setOutstanding] = useState<DashboardSectionState<CustomerAnalysis>>(makeSectionState());
  const [sales, setSales] = useState<DashboardSectionState<SaleListItem[]>>(makeSectionState([]));
  const [inventory, setInventory] = useState<DashboardSectionState<InventoryResponse>>(makeSectionState());
  const [longTermWarning, setLongTermWarning] = useState(0);
  const [longTermCritical, setLongTermCritical] = useState(0);

  const isManager = userRole === 'admin' || userRole === 'manager';

  const load = useCallback(async () => {
    if (!companyId) return;

    // 모든 섹션 loading=true
    setSummary((s) => ({ ...s, loading: true, error: null }));
    setRevenue((s) => ({ ...s, loading: true, error: null }));
    setPriceTrend((s) => ({ ...s, loading: true, error: null }));
    setSales((s) => ({ ...s, loading: true, error: null }));
    setInventory((s) => ({ ...s, loading: true, error: null }));
    setAlerts((s) => ({ ...s, loading: true, error: null }));
    setCompanySummary((s) => ({ ...s, loading: true, error: null }));
    if (isManager) {
      setIncoming((s) => ({ ...s, loading: true, error: null }));
      setOrderBacklog((s) => ({ ...s, loading: true, error: null }));
      setOutstanding((s) => ({ ...s, loading: true, error: null }));
    }

    // D-060: fetchCalc가 "all"이면 법인별 호출 후 merge 처리
    const fetchInventory = () => fetchCalc<InventoryResponse>(companyId, '/api/v1/calc/inventory', {});
    const fetchCustomerAnalysis = () => fetchCalc<CustomerAnalysis>(companyId, '/api/v1/calc/customer-analysis', {}, mergeCustomer);
    const fetchPriceTrendApi = () => fetchCalc<PriceTrendResponse>(companyId, '/api/v1/calc/price-trend', {}, mergePriceTrend);
    const fetchPriceHistories = () => fetchWithAuth<DashboardPriceHistory[]>(companyQueryUrl('/api/v1/price-histories', companyId));
    const fetchLCTimeline = () => fetchCalc<LCLimitTimeline>(companyId, '/api/v1/calc/lc-limit-timeline', { months_ahead: 3 }, mergeLCTimeline);
    // CRUD: "all"이면 company_id 파라미터 생략 → 전체 반환
    const fetchSales = () => fetchWithAuth<SaleListItem[]>(companyQueryUrl('/api/v1/sales', companyId));
    const fetchBLs = () => fetchWithAuth<BLShipment[]>(companyQueryUrl('/api/v1/bls', companyId));
    const fetchOrders = () => fetchWithAuth<Order[]>(companyQueryUrl('/api/v1/orders', companyId));

    const results = await Promise.allSettled([
      fetchInventory(),       // 0
      fetchSales(),           // 1
      fetchCustomerAnalysis(),// 2
      fetchPriceTrendApi(),   // 3
      fetchLCTimeline(),      // 4
      fetchBLs(),             // 5
      fetchOrders(),          // 6
      fetchPriceHistories(),  // 7
    ]);

    // 0: Inventory -> summary + 장기재고 알림 + inventory 섹션
    const invResult = results[0];
    if (invResult.status === 'fulfilled') {
      const s = invResult.value.summary;
      setSummary((prev) => ({
        ...prev, loading: false,
        data: {
          ...prev.data!,
          physical_mw: s.total_physical_kw / 1000,
          available_mw: s.total_available_kw / 1000,
          incoming_mw: s.total_incoming_kw / 1000,
          secured_mw: s.total_secured_kw / 1000,
          outstanding_krw: prev.data?.outstanding_krw ?? 0,
          lc_available_usd: prev.data?.lc_available_usd ?? 0,
        },
      }));
      setInventory({ data: invResult.value, loading: false, error: null });
      setLongTermWarning(invResult.value.items.filter((i) => i.long_term_status === 'warning').length);
      setLongTermCritical(invResult.value.items.filter((i) => i.long_term_status === 'critical').length);
    } else {
      setSummary((s) => ({ ...s, loading: false, error: '재고 데이터 조회 실패' }));
      setInventory({ data: null, loading: false, error: '재고 데이터 조회 실패' });
    }

    // 1: Sales -> monthly revenue
    const salesResult = results[1];
    if (salesResult.status === 'fulfilled') {
      setSales({ data: salesResult.value, loading: false, error: null });
      setRevenue({ data: salesToMonthlyRevenue(salesResult.value), loading: false, error: null });
    } else {
      setSales({ data: null, loading: false, error: '매출 데이터 조회 실패' });
      setRevenue({ data: null, loading: false, error: '매출 데이터 조회 실패' });
    }

    // 2: CustomerAnalysis -> outstanding + summary.outstanding_krw
    const custResult = results[2];
    let custData: CustomerAnalysis | null = null;
    if (custResult.status === 'fulfilled') {
      custData = custResult.value;
      setOutstanding({ data: custData, loading: false, error: null });
      setSummary((prev) => ({
        ...prev,
        data: prev.data ? { ...prev.data, outstanding_krw: custData!.summary?.total_outstanding_krw || 0 } : prev.data,
      }));
    } else {
      setOutstanding({ data: null, loading: false, error: '미수금 데이터 조회 실패' });
    }

    // 3: PriceTrend
    const ptResult = results[3];
    if (ptResult.status === 'fulfilled') {
      const mfgs = toManufacturerPriceRows(ptResult.value);
      const MFG_COLORS: Record<string, string> = {
        '진코솔라': '#3b82f6', 'JinkoSolar': '#3b82f6',
        '트리나솔라': '#ef4444', 'TrinaSolar': '#ef4444',
        '라이젠에너지': '#22c55e', 'Risen': '#22c55e',
        'LONGi': '#f97316', '롱기': '#f97316', '론지': '#f97316',
      };
      const colored = mfgs.map((m, i: number) => ({
        ...m,
        color: MFG_COLORS[m.name] || ['#6b7280', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'][i % 5],
      }));
      if (colored.length > 0) {
        setPriceTrend({ data: { manufacturers: colored }, loading: false, error: null });
      } else {
        const phResult = results[7];
        setPriceTrend({
          data: phResult.status === 'fulfilled' ? priceHistoriesToTrend(phResult.value) : { manufacturers: [] },
          loading: false,
          error: null,
        });
      }
    } else {
      const phResult = results[7];
      setPriceTrend({
        data: phResult.status === 'fulfilled' ? priceHistoriesToTrend(phResult.value) : null,
        loading: false,
        error: phResult.status === 'fulfilled' ? null : '단가 추이 조회 실패',
      });
    }

    // 4: LC Timeline -> summary.lc_available_usd
    const tlResult = results[4];
    if (tlResult.status === 'fulfilled') {
      const avail = (tlResult.value.bank_summaries || []).reduce((s: number, b: { available: number }) => s + b.available, 0);
      setSummary((prev) => ({
        ...prev,
        data: prev.data ? { ...prev.data, lc_available_usd: avail } : prev.data,
      }));
    }

    // 5: BLs
    const blResult = results[5];
    let blData: BLShipment[] = [];
    if (blResult.status === 'fulfilled') {
      blData = blResult.value;
      if (isManager) {
        const incomingBLs = blData
          .filter((bl) => bl.status === 'shipping' || bl.status === 'arrived' || bl.status === 'customs')
          .slice(0, 10);
        setIncoming({ data: incomingBLs, loading: false, error: null });
      }
    } else if (isManager) {
      setIncoming({ data: null, loading: false, error: '미착품 조회 실패' });
    }

    // 6: Orders
    const orderResult = results[6];
    let orderData: Order[] = [];
    if (orderResult.status === 'fulfilled') {
      orderData = orderResult.value;
      if (isManager) {
        const backlog = orderData
          .filter((o) => (o.status === 'received' || o.status === 'partial') && (o.remaining_qty ?? 0) > 0)
          .slice(0, 10);
        setOrderBacklog({ data: backlog, loading: false, error: null });
      }
    } else if (isManager) {
      setOrderBacklog({ data: null, loading: false, error: '수주 잔량 조회 실패' });
    }

    // 알림은 useAlerts.ts로 분리 (Step 31 감리 지적 3 반영)
    setAlerts({ data: [], loading: false, error: null });

    // 법인별 요약은 별도 (companyId가 "전체"일 때만)
    setCompanySummary((s) => ({ ...s, loading: false }));
  }, [companyId, isManager]);

  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  return {
    summary, revenue, priceTrend, alerts, companySummary,
    incoming, orderBacklog, outstanding, sales, inventory,
    longTermWarning, longTermCritical,
    reload: load,
  };
}
