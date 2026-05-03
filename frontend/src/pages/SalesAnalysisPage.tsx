import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { useAppStore } from '@/stores/appStore';
import { companyQueryUrl, fetchCalc } from '@/lib/companyUtils';
import { fetchWithAuth } from '@/lib/api';
import { formatKRW, formatNumber, moduleLabel } from '@/lib/utils';
import type { SaleListItem } from '@/types/outbound';
import type { CustomerAnalysis, CustomerItem } from '@/types/analysis';
import type { Partner } from '@/types/masters';
import { CardB, FilterChips, RailBlock, TileB } from '@/components/command/MockupPrimitives';
import { flatSpark, monthlyTrend } from '@/templates/sparkUtils';

interface MarginItem {
  manufacturer_name: string;
  product_code: string;
  product_name: string;
  spec_wp: number;
  total_sold_qty: number;
  total_sold_kw: number;
  avg_sale_price_wp: number;
  avg_cost_wp?: number | null;
  margin_wp?: number | null;
  margin_rate?: number | null;
  total_revenue_krw: number;
  total_cost_krw?: number | null;
  total_margin_krw?: number | null;
  sale_count: number;
}

interface MarginAnalysis {
  items: MarginItem[];
  summary: {
    total_sold_kw: number;
    total_revenue_krw: number;
    total_cost_krw: number;
    total_margin_krw: number;
    overall_margin_rate: number;
    cost_basis: string;
  };
}

interface PageState {
  loading: boolean;
  error: string | null;
  sales: SaleListItem[];
  margin: MarginAnalysis | null;
  customers: CustomerAnalysis | null;
}

type PeriodFilter = 'all' | 'last3' | 'year' | 'custom';

const emptyMargin: MarginAnalysis = {
  items: [],
  summary: {
    total_sold_kw: 0,
    total_revenue_krw: 0,
    total_cost_krw: 0,
    total_margin_krw: 0,
    overall_margin_rate: 0,
    cost_basis: 'landed',
  },
};

const emptyCustomers: CustomerAnalysis = {
  items: [],
  summary: {
    total_sales_krw: 0,
    total_collected_krw: 0,
    total_outstanding_krw: 0,
    total_margin_krw: 0,
    overall_margin_rate: 0,
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mergeMargin(results: MarginAnalysis[]): MarginAnalysis {
  const map = new Map<string, MarginItem>();
  for (const result of results) {
    for (const item of result.items || []) {
      const key = `${item.manufacturer_name}|${item.product_code}|${item.spec_wp}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...item });
        continue;
      }
      const totalQty = prev.total_sold_qty + item.total_sold_qty;
      const totalRevenue = prev.total_revenue_krw + item.total_revenue_krw;
      const totalCost = (prev.total_cost_krw ?? 0) + (item.total_cost_krw ?? 0);
      const hasCost = prev.total_cost_krw != null || item.total_cost_krw != null;
      const totalMargin = hasCost ? totalRevenue - totalCost : null;
      const totalWp = totalQty * item.spec_wp;
      map.set(key, {
        ...prev,
        total_sold_qty: totalQty,
        total_sold_kw: prev.total_sold_kw + item.total_sold_kw,
        avg_sale_price_wp: totalWp > 0 ? round2(totalRevenue / totalWp) : 0,
        avg_cost_wp: hasCost && totalWp > 0 ? round2(totalCost / totalWp) : null,
        margin_wp: hasCost && totalWp > 0 ? round2((totalRevenue - totalCost) / totalWp) : null,
        margin_rate: totalRevenue > 0 && hasCost ? round2(((totalRevenue - totalCost) / totalRevenue) * 100) : null,
        total_revenue_krw: totalRevenue,
        total_cost_krw: hasCost ? totalCost : null,
        total_margin_krw: totalMargin,
        sale_count: prev.sale_count + item.sale_count,
      });
    }
  }
  const items = Array.from(map.values()).sort((a, b) => b.total_revenue_krw - a.total_revenue_krw);
  const totalRevenue = items.reduce((sum, item) => sum + item.total_revenue_krw, 0);
  const totalCost = items.reduce((sum, item) => sum + (item.total_cost_krw ?? 0), 0);
  const totalMargin = totalRevenue - totalCost;
  return {
    items,
    summary: {
      total_sold_kw: round2(items.reduce((sum, item) => sum + item.total_sold_kw, 0)),
      total_revenue_krw: round2(totalRevenue),
      total_cost_krw: round2(totalCost),
      total_margin_krw: round2(totalMargin),
      overall_margin_rate: totalRevenue > 0 ? round2((totalMargin / totalRevenue) * 100) : 0,
      cost_basis: results[0]?.summary.cost_basis ?? 'landed',
    },
  };
}

function mergeCustomers(results: CustomerAnalysis[]): CustomerAnalysis {
  const map = new Map<string, CustomerItem>();
  for (const result of results) {
    for (const item of result.items || []) {
      const prev = map.get(item.customer_id);
      if (!prev) {
        map.set(item.customer_id, { ...item });
        continue;
      }
      map.set(item.customer_id, {
        ...prev,
        total_sales_krw: prev.total_sales_krw + item.total_sales_krw,
        total_collected_krw: prev.total_collected_krw + item.total_collected_krw,
        outstanding_krw: prev.outstanding_krw + item.outstanding_krw,
        outstanding_count: prev.outstanding_count + item.outstanding_count,
        oldest_outstanding_days: Math.max(prev.oldest_outstanding_days, item.oldest_outstanding_days),
        total_margin_krw: (prev.total_margin_krw ?? 0) + (item.total_margin_krw ?? 0),
        avg_margin_rate: null,
      });
    }
  }
  const items = Array.from(map.values()).sort((a, b) => b.total_sales_krw - a.total_sales_krw);
  const totalSales = items.reduce((sum, item) => sum + item.total_sales_krw, 0);
  const totalMargin = items.reduce((sum, item) => sum + (item.total_margin_krw ?? 0), 0);
  return {
    items: items.map((item) => ({
      ...item,
      avg_margin_rate: item.total_sales_krw > 0 && item.total_margin_krw != null
        ? round2((item.total_margin_krw / item.total_sales_krw) * 100)
        : item.avg_margin_rate,
    })),
    summary: {
      total_sales_krw: totalSales,
      total_collected_krw: items.reduce((sum, item) => sum + item.total_collected_krw, 0),
      total_outstanding_krw: items.reduce((sum, item) => sum + item.outstanding_krw, 0),
      total_margin_krw: totalMargin,
      overall_margin_rate: totalSales > 0 ? round2((totalMargin / totalSales) * 100) : 0,
    },
  };
}

function toMonth(date?: string): string {
  return date ? date.slice(0, 7) : '날짜 없음';
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function resolvePeriod(period: PeriodFilter, customFrom: string, customTo: string) {
  const today = new Date();
  if (period === 'last3') {
    const from = firstDayOfMonth(new Date(today.getFullYear(), today.getMonth() - 2, 1));
    return { dateFrom: formatDateInput(from), dateTo: formatDateInput(today) };
  }
  if (period === 'year') {
    return { dateFrom: `${today.getFullYear()}-01-01`, dateTo: formatDateInput(today) };
  }
  if (period === 'custom') {
    return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
  }
  return { dateFrom: undefined, dateTo: undefined };
}

function withinRange(date: string | undefined, dateFrom?: string, dateTo?: string): boolean {
  if (!date) return !dateFrom && !dateTo;
  const day = date.slice(0, 10);
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

export default function SalesAnalysisPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);
  const manufacturers = useAppStore((s) => s.manufacturers);
  const products = useAppStore((s) => s.products);
  const loadManufacturers = useAppStore((s) => s.loadManufacturers);
  const loadProducts = useAppStore((s) => s.loadProducts);
  const [state, setState] = useState<PageState>({
    loading: true,
    error: null,
    sales: [],
    margin: null,
    customers: null,
  });

  const dateRange = useMemo(
    () => resolvePeriod(period, customFrom, customTo),
    [customFrom, customTo, period],
  );

  useEffect(() => {
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => setPartners([]));
    loadManufacturers();
    loadProducts();
  }, [loadManufacturers, loadProducts]);

  const load = useCallback(async () => {
    if (!selectedCompanyId) {
      setState({ loading: false, error: null, sales: [], margin: null, customers: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const calcFilterBody = {
        cost_basis: 'landed',
        ...(dateRange.dateFrom ? { date_from: dateRange.dateFrom } : {}),
        ...(dateRange.dateTo ? { date_to: dateRange.dateTo } : {}),
      };
      let salesUrl = companyQueryUrl('/api/v1/sales', selectedCompanyId);
      if (customerFilter) {
        salesUrl += `${salesUrl.includes('?') ? '&' : '?'}customer_id=${customerFilter}`;
      }
      const [sales, margin, customers] = await Promise.all([
        fetchWithAuth<SaleListItem[]>(salesUrl),
        fetchCalc<MarginAnalysis>(
          selectedCompanyId,
          '/api/v1/calc/margin-analysis',
          {
            ...calcFilterBody,
            ...(manufacturerFilter ? { manufacturer_id: manufacturerFilter } : {}),
          },
          mergeMargin,
        ).catch(() => emptyMargin),
        fetchCalc<CustomerAnalysis>(
          selectedCompanyId,
          '/api/v1/calc/customer-analysis',
          {
            ...calcFilterBody,
            ...(customerFilter ? { customer_id: customerFilter } : {}),
          },
          mergeCustomers,
        ).catch(() => emptyCustomers),
      ]);
      setState({ loading: false, error: null, sales, margin, customers });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : '매출/이익 분석 데이터를 불러오지 못했습니다',
      }));
    }
  }, [customerFilter, dateRange.dateFrom, dateRange.dateTo, manufacturerFilter, selectedCompanyId]);

  useEffect(() => { load(); }, [load]);

  const productManufacturerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.product_id, product.manufacturer_id);
    return map;
  }, [products]);

  const filteredSales = useMemo(() => {
    return state.sales.filter((item) => {
      if (!withinRange(item.outbound_date ?? item.order_date, dateRange.dateFrom, dateRange.dateTo)) return false;
      if (manufacturerFilter && (!item.product_id || productManufacturerMap.get(item.product_id) !== manufacturerFilter)) return false;
      return true;
    });
  }, [dateRange.dateFrom, dateRange.dateTo, manufacturerFilter, productManufacturerMap, state.sales]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; vat: number; total: number; count: number }>();
    for (const item of filteredSales) {
      const month = toMonth(item.outbound_date ?? item.order_date);
      const prev = map.get(month) ?? { month, revenue: 0, vat: 0, total: 0, count: 0 };
      prev.revenue += item.sale.supply_amount ?? 0;
      prev.vat += item.sale.vat_amount ?? 0;
      prev.total += item.sale.total_amount ?? 0;
      prev.count += 1;
      map.set(month, prev);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [filteredSales]);

  const salesSummary = useMemo(() => {
    const supply = filteredSales.reduce((sum, item) => sum + (item.sale.supply_amount ?? 0), 0);
    const total = filteredSales.reduce((sum, item) => sum + (item.sale.total_amount ?? 0), 0);
    const issued = filteredSales.filter((item) => item.sale.tax_invoice_date).length;
    return {
      supply,
      total,
      count: filteredSales.length,
      issued,
      pending: filteredSales.length - issued,
      issueRate: filteredSales.length > 0 ? Math.round((issued / filteredSales.length) * 100) : 0,
    };
  }, [filteredSales]);

  // KPI sparkline — 최근 8개월 실제 매출/세금 흐름.
  const saleDate = (item: SaleListItem) => item.outbound_date ?? item.order_date ?? null;
  const supplySpark = useMemo(
    () => monthlyTrend(filteredSales, saleDate, (i) => i.sale.supply_amount ?? 0),
    [filteredSales],
  );
  const totalSpark = useMemo(
    () => monthlyTrend(filteredSales, saleDate, (i) => i.sale.total_amount ?? 0),
    [filteredSales],
  );
  const issueRateSpark = useMemo(() => {
    // total 과 issued 가 같은 데이터 범위(filteredSales 의 minMonth)를 공유하도록
    // 동일 items 위에서 conditional getValue 로 계산 — 부분집합으로 분리하면 길이가 어긋남.
    const totalByMonth = monthlyTrend(filteredSales, saleDate, () => 1);
    const issuedByMonth = monthlyTrend(filteredSales, saleDate, (i) => (i.sale.tax_invoice_date ? 1 : 0));
    return totalByMonth.map((t, i) => (t > 0 ? Math.round((issuedByMonth[i]! / t) * 100) : 0));
  }, [filteredSales]);

  const margin = state.margin ?? emptyMargin;
  const customers = state.customers ?? emptyCustomers;
  const coveredCostCount = margin.items.filter((item) => item.avg_cost_wp != null).length;
  const manufacturerLabel = manufacturerFilter
    ? (manufacturers.find((m) => m.manufacturer_id === manufacturerFilter)?.short_name
      ?? manufacturers.find((m) => m.manufacturer_id === manufacturerFilter)?.name_kr
      ?? '제조사')
    : '전체 제조사';

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">좌측 상단에서 법인을 선택해주세요.</div>;
  }

  if (state.loading) return <LoadingSpinner className="h-full" />;

  const periodOptions = [
    { key: 'all', label: '전체' },
    { key: 'last3', label: '최근 3개월' },
    { key: 'year', label: '올해' },
    { key: 'custom', label: '직접 지정' },
  ];
  const topCustomer = customers.items[0];

  return (
    <div className="sf-page">
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main" data-onboarding-step="sales.summary.cost">
          <CardB
            title="매출/이익 분석"
            sub="판매, 세금계산서, 수금, B/L 원가 연결"
            right={<button type="button" className="btn xs" onClick={load}>새로고침</button>}
            padded
          >
            <div className="flex flex-wrap items-center gap-2">
              <FilterChips options={periodOptions} value={period} onChange={(value) => setPeriod(value as PeriodFilter)} />
              {period === 'custom' && (
                <>
                  <DateInput value={customFrom} onChange={setCustomFrom} className="h-8 w-36 text-xs" placeholder="시작일" />
                  <DateInput value={customTo} onChange={setCustomTo} className="h-8 w-36 text-xs" placeholder="종료일" />
                </>
              )}
              <div className="w-44">
                <PartnerCombobox
                  partners={partners}
                  value={customerFilter}
                  onChange={setCustomerFilter}
                  placeholder="전체 거래처"
                  includeAllOption
                  allLabel="전체 거래처"
                />
              </div>
              <Select value={manufacturerFilter || 'all'} onValueChange={(v) => setManufacturerFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <span className="truncate">{manufacturerLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 제조사</SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.short_name || m.name_kr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto text-[10px] text-muted-foreground">
                제조사 필터는 매출 집계와 품목별 이익에 적용됩니다.
              </div>
            </div>
          </CardB>

      {state.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="sf-command-kpis">
        <TileB lbl="공급가 매출" v={(salesSummary.supply / 100000000).toFixed(2)} u="억" sub={`${formatNumber(salesSummary.count)}건`} tone="solar" spark={supplySpark} />
        <TileB lbl="부가세 포함" v={(salesSummary.total / 100000000).toFixed(2)} u="억" sub="세금계산서 기준 합계" tone="ink" spark={totalSpark} />
        <TileB lbl="계산서 발행률" v={String(salesSummary.issueRate)} u="%" sub={`${formatNumber(salesSummary.issued)}건 발행 / ${formatNumber(salesSummary.pending)}건 미발행`} tone="info" spark={issueRateSpark} />
        <TileB lbl="이익률" v={margin.summary.overall_margin_rate.toFixed(1)} u="%" sub={`${formatKRW(margin.summary.total_margin_krw)} · 원가 ${coveredCostCount}/${margin.items.length}건`} tone="pos" spark={flatSpark(margin.summary.overall_margin_rate)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <CardB title="월별 매출" sub="공급가 · 부가세 포함" padded>
            {monthly.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">매출 데이터가 없습니다</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 100000000)}억`} />
                  <Tooltip formatter={(value, name) => [formatKRW(Number(value)), name === 'revenue' ? '공급가' : '부가세 포함']} />
                  <Bar dataKey="revenue" fill="#2563eb" name="공급가" />
                  <Bar dataKey="total" fill="#16a34a" name="부가세 포함" />
                </BarChart>
              </ResponsiveContainer>
            )}
        </CardB>

        <CardB title="거래처별 청구/미수" sub="상위 8개 거래처" padded>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>거래처</TableHead>
                  <TableHead className="text-right">청구액</TableHead>
                  <TableHead className="text-right">미수</TableHead>
                  <TableHead className="text-right">이익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.items.slice(0, 8).map((item) => (
                  <TableRow key={item.customer_id}>
                    <TableCell className="text-xs font-medium">{item.customer_name}</TableCell>
                    <TableCell className="text-right text-xs">{formatKRW(item.total_sales_krw)}</TableCell>
                    <TableCell className="text-right text-xs">{formatKRW(item.outstanding_krw)}</TableCell>
                    <TableCell className="text-right text-xs">{item.avg_margin_rate != null ? `${item.avg_margin_rate.toFixed(1)}%` : '—'}</TableCell>
                  </TableRow>
                ))}
                {customers.items.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">거래처 분석 데이터가 없습니다</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
        </CardB>
      </div>

      <CardB title="품목별 이익 분석" sub="판매가 · 원가 · 이익/Wp">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>모듈</TableHead>
                <TableHead>품번 / 품명</TableHead>
                <TableHead className="text-right">수량</TableHead>
                <TableHead className="text-right">판매가</TableHead>
                <TableHead>원가상태</TableHead>
                <TableHead className="text-right">원가</TableHead>
                <TableHead className="text-right">이익/Wp</TableHead>
                <TableHead className="text-right">이익률</TableHead>
                <TableHead className="text-right">매출</TableHead>
                <TableHead className="text-right">이익</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {margin.items.map((item) => {
                const costCovered = item.avg_cost_wp != null && item.total_cost_krw != null;
                return (
                <TableRow key={`${item.manufacturer_name}-${item.product_code}-${item.spec_wp}`} className={!costCovered ? 'bg-yellow-50/40' : undefined}>
                  <TableCell className="text-xs font-medium">{moduleLabel(item.manufacturer_name, item.spec_wp)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{item.product_code}</div>
                    <div className="text-muted-foreground">{item.product_name}</div>
                  </TableCell>
                  <TableCell className="text-right text-xs">{formatNumber(item.total_sold_qty)}</TableCell>
                  <TableCell className="text-right text-xs">{formatNumber(item.avg_sale_price_wp)}원</TableCell>
                  <TableCell className="text-xs">
                    {costCovered ? (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">원가 연결</span>
                    ) : (
                      <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">원가 없음</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs">{item.avg_cost_wp != null ? `${formatNumber(item.avg_cost_wp)}원` : '—'}</TableCell>
                  <TableCell className="text-right text-xs">{item.margin_wp != null ? `${formatNumber(item.margin_wp)}원` : '—'}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{item.margin_rate != null ? `${item.margin_rate.toFixed(1)}%` : '—'}</TableCell>
                  <TableCell className="text-right text-xs">{formatKRW(item.total_revenue_krw)}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{item.total_margin_krw != null ? formatKRW(item.total_margin_krw) : '—'}</TableCell>
                </TableRow>
                );
              })}
              {margin.items.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-xs text-muted-foreground">이익 분석 데이터가 없습니다</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
      </CardB>
        </section>

        <aside className="sf-procurement-rail card">
          <RailBlock title="목표 달성률" count={period === 'all' ? '전체' : period}>
            <div className="bignum text-[30px] text-[var(--solar-3)]">{margin.summary.overall_margin_rate.toFixed(1)}<span className="mono text-sm text-[var(--ink-3)]">%</span></div>
            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">총이익 {formatKRW(margin.summary.total_margin_krw)} · 매출 {formatKRW(salesSummary.supply)}</div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--bg-2)]">
              <div className="h-full bg-[var(--solar-2)]" style={{ width: `${Math.min(100, margin.summary.overall_margin_rate * 5)}%` }} />
            </div>
          </RailBlock>
          <RailBlock title="상위 거래처" count="매출">
            {customers.items.slice(0, 5).map((item, index) => (
              <div key={item.customer_id} className={`py-2 ${index ? 'border-t border-[var(--line)]' : ''}`}>
                <div className="flex justify-between gap-2 text-[11.5px]">
                  <span className="truncate text-[var(--ink-2)]">{item.customer_name}</span>
                  <span className="mono font-semibold text-[var(--ink)]">{formatKRW(item.total_sales_krw)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                  <div className="h-full bg-[var(--solar-2)]" style={{ width: `${customers.summary.total_sales_krw ? Math.min(100, (item.total_sales_krw / customers.summary.total_sales_krw) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </RailBlock>
          <RailBlock title="수금 상태" last>
            <div className="space-y-2 text-[11.5px] text-[var(--ink-2)]">
              <div className="flex justify-between"><span>수금액</span><span className="mono">{formatKRW(customers.summary.total_collected_krw)}</span></div>
              <div className="flex justify-between"><span>미수금</span><span className="mono text-[var(--warn)]">{formatKRW(customers.summary.total_outstanding_krw)}</span></div>
              <div className="flex justify-between"><span>원가 연결</span><span className="mono">{coveredCostCount}/{margin.items.length}</span></div>
            </div>
            {topCustomer ? <div className="mono mt-3 text-[10.5px] text-[var(--ink-3)]">TOP · {topCustomer.customer_name}</div> : null}
          </RailBlock>
        </aside>
      </div>
    </div>
  );
}
