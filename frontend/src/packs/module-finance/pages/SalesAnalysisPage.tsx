import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { useAppStore } from '@/stores/appStore';
import { companyQueryUrl, fetchCalc } from '@/lib/companyUtils';
import { fetchAllPaginated, fetchWithAuth } from '@/lib/api';
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
  cost_covered_revenue_krw?: number;
  cost_missing_revenue_krw?: number;
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
    cost_covered_revenue_krw?: number;
    cost_missing_revenue_krw?: number;
    cost_coverage_rate?: number;
    cost_basis: string;
  };
}

interface PageState {
  loading: boolean;
  error: string | null;
  warnings: string[];
  sales: SaleListItem[];
  margin: MarginAnalysis | null;
  customers: CustomerAnalysis | null;
}

type PeriodFilter = 'all' | 'last3' | 'year' | 'custom';
type MarginFilter = 'all' | 'missing_cost' | 'low_margin' | 'negative_margin';
type ReconciliationLevel = 'good' | 'watch' | 'risk';
// D-064 PR 30: 마진 분석 원가 기준 토글.
// fifo: ERP fifo_matches (PR 26) 직접 사용 — 가장 정확. 매칭된 출고만 cover.
// landed: 면장 + 부대비용 합산 (관세/부가세 포함 확정원가 추정).
// cif: 면장 CIF 만 (관세 전).
type CostBasis = 'fifo' | 'landed' | 'cif';

function saleListItemDate(item: SaleListItem) {
  return item.outbound_date ?? item.order_date ?? null;
}

const emptyMargin: MarginAnalysis = {
  items: [],
  summary: {
    total_sold_kw: 0,
    total_revenue_krw: 0,
    total_cost_krw: 0,
    total_margin_krw: 0,
    overall_margin_rate: 0,
    cost_covered_revenue_krw: 0,
    cost_missing_revenue_krw: 0,
    cost_coverage_rate: 0,
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
      const prevCoveredRevenue = prev.cost_covered_revenue_krw ?? (prev.total_cost_krw != null ? prev.total_revenue_krw : 0);
      const itemCoveredRevenue = item.cost_covered_revenue_krw ?? (item.total_cost_krw != null ? item.total_revenue_krw : 0);
      const costCoveredRevenue = prevCoveredRevenue + itemCoveredRevenue;
      const costMissingRevenue = Math.max(0, totalRevenue - costCoveredRevenue);
      const hasCost = costCoveredRevenue > 0;
      const totalMargin = hasCost ? costCoveredRevenue - totalCost : null;
      const totalWp = totalQty * item.spec_wp;
      map.set(key, {
        ...prev,
        total_sold_qty: totalQty,
        total_sold_kw: prev.total_sold_kw + item.total_sold_kw,
        avg_sale_price_wp: totalWp > 0 ? round2(totalRevenue / totalWp) : 0,
        avg_cost_wp: hasCost && totalWp > 0 ? round2(totalCost / totalWp) : null,
        margin_wp: hasCost && totalWp > 0 ? round2((costCoveredRevenue - totalCost) / totalWp) : null,
        margin_rate: costCoveredRevenue > 0 && hasCost ? round2(((costCoveredRevenue - totalCost) / costCoveredRevenue) * 100) : null,
        total_revenue_krw: totalRevenue,
        total_cost_krw: hasCost ? totalCost : null,
        total_margin_krw: totalMargin,
        cost_covered_revenue_krw: round2(costCoveredRevenue),
        cost_missing_revenue_krw: round2(costMissingRevenue),
        sale_count: prev.sale_count + item.sale_count,
      });
    }
  }
  const items = Array.from(map.values()).sort((a, b) => b.total_revenue_krw - a.total_revenue_krw);
  const totalRevenue = items.reduce((sum, item) => sum + item.total_revenue_krw, 0);
  const totalCost = items.reduce((sum, item) => sum + (item.total_cost_krw ?? 0), 0);
  const costCoveredRevenue = items.reduce((sum, item) => sum + (item.cost_covered_revenue_krw ?? (item.total_cost_krw != null ? item.total_revenue_krw : 0)), 0);
  const costMissingRevenue = items.reduce((sum, item) => sum + (item.cost_missing_revenue_krw ?? (item.total_cost_krw == null ? item.total_revenue_krw : 0)), 0);
  const totalMargin = costCoveredRevenue - totalCost;
  return {
    items,
    summary: {
      total_sold_kw: round2(items.reduce((sum, item) => sum + item.total_sold_kw, 0)),
      total_revenue_krw: round2(totalRevenue),
      total_cost_krw: round2(totalCost),
      total_margin_krw: round2(totalMargin),
      overall_margin_rate: costCoveredRevenue > 0 ? round2((totalMargin / costCoveredRevenue) * 100) : 0,
      cost_covered_revenue_krw: round2(costCoveredRevenue),
      cost_missing_revenue_krw: round2(costMissingRevenue),
      cost_coverage_rate: totalRevenue > 0 ? round2((costCoveredRevenue / totalRevenue) * 100) : 0,
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

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round2((numerator / denominator) * 100);
}

function moneyDelta(a: number, b: number): number {
  return Math.abs(Math.round(a - b));
}

function levelTone(level: ReconciliationLevel): string {
  if (level === 'good') return 'bg-green-100 text-green-700';
  if (level === 'watch') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

export default function SalesAnalysisPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);
  // D-064 PR 30: 원가 기준 토글 — 기본 fifo (가장 정확). cost_details 만 있는 환경은 landed 로 폴백.
  const [costBasis, setCostBasis] = useState<CostBasis>('fifo');
  const [marginFilter, setMarginFilter] = useState<MarginFilter>('all');
  const manufacturers = useAppStore((s) => s.manufacturers);
  const products = useAppStore((s) => s.products);
  const loadManufacturers = useAppStore((s) => s.loadManufacturers);
  const loadProducts = useAppStore((s) => s.loadProducts);
  const [state, setState] = useState<PageState>({
    loading: true,
    error: null,
    warnings: [],
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
      setState({ loading: false, error: null, warnings: [], sales: [], margin: null, customers: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null, warnings: [] }));
    try {
      const calcFilterBody = {
        cost_basis: costBasis,
        ...(dateRange.dateFrom ? { date_from: dateRange.dateFrom } : {}),
        ...(dateRange.dateTo ? { date_to: dateRange.dateTo } : {}),
      };
      const salesQueryParts: string[] = [];
      const baseUrl = companyQueryUrl('/api/v1/sales', selectedCompanyId);
      const baseQueryFromUrl = baseUrl.includes('?') ? baseUrl.split('?')[1] ?? '' : '';
      if (baseQueryFromUrl) salesQueryParts.push(baseQueryFromUrl);
      if (customerFilter) salesQueryParts.push(`customer_id=${customerFilter}`);
      const salesQuery = salesQueryParts.join('&');
      const [sales, marginResult, customerResult] = await Promise.all([
        fetchAllPaginated<SaleListItem>('/api/v1/sales', salesQuery),
        fetchCalc<MarginAnalysis>(
          selectedCompanyId,
          '/api/v1/calc/margin-analysis',
          {
            ...calcFilterBody,
            ...(manufacturerFilter ? { manufacturer_id: manufacturerFilter } : {}),
            ...(customerFilter ? { customer_id: customerFilter } : {}),
          },
          mergeMargin,
        )
          .then((data) => ({ data, warning: null as string | null }))
          .catch(() => ({
            data: emptyMargin,
            warning: '이익 계산 엔진 응답을 받지 못했습니다. 매출 집계만 표시합니다.',
          })),
        fetchCalc<CustomerAnalysis>(
          selectedCompanyId,
          '/api/v1/calc/customer-analysis',
          {
            ...calcFilterBody,
            ...(customerFilter ? { customer_id: customerFilter } : {}),
          },
          mergeCustomers,
        )
          .then((data) => ({ data, warning: null as string | null }))
          .catch(() => ({
            data: emptyCustomers,
            warning: '거래처/수금 분석 엔진 응답을 받지 못했습니다. 미수금과 거래처 표시는 제외됩니다.',
          })),
      ]);
      setState({
        loading: false,
        error: null,
        warnings: [marginResult.warning, customerResult.warning].filter((w): w is string => Boolean(w)),
        sales,
        margin: marginResult.data,
        customers: customerResult.data,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        warnings: [],
        error: err instanceof Error ? err.message : '매출/이익 분석 데이터를 불러오지 못했습니다',
      }));
    }
  }, [costBasis, customerFilter, dateRange.dateFrom, dateRange.dateTo, manufacturerFilter, selectedCompanyId]);

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
  const supplySpark = useMemo(
    () => monthlyTrend(filteredSales, saleListItemDate, (i) => i.sale.supply_amount ?? 0),
    [filteredSales],
  );
  const issueRateSpark = useMemo(() => {
    // total 과 issued 가 같은 데이터 범위(filteredSales 의 minMonth)를 공유하도록
    // 동일 items 위에서 conditional getValue 로 계산 — 부분집합으로 분리하면 길이가 어긋남.
    const totalByMonth = monthlyTrend(filteredSales, saleListItemDate, () => 1);
    const issuedByMonth = monthlyTrend(filteredSales, saleListItemDate, (i) => (i.sale.tax_invoice_date ? 1 : 0));
    return totalByMonth.map((t, i) => (t > 0 ? Math.round((issuedByMonth[i]! / t) * 100) : 0));
  }, [filteredSales]);

  const margin = state.margin ?? emptyMargin;
  const customers = state.customers ?? emptyCustomers;
  const coveredCostCount = margin.items.filter((item) => item.avg_cost_wp != null).length;
  const costMissingItemCount = margin.items.length - coveredCostCount;
  const costCoveredRevenue = margin.summary.cost_covered_revenue_krw
    ?? margin.items.reduce((sum, item) => sum + (item.cost_covered_revenue_krw ?? (item.total_cost_krw != null ? item.total_revenue_krw : 0)), 0);
  const costMissingRevenue = margin.summary.cost_missing_revenue_krw
    ?? margin.items.reduce((sum, item) => sum + (item.cost_missing_revenue_krw ?? (item.total_cost_krw == null ? item.total_revenue_krw : 0)), 0);
  const costCoverageRate = margin.summary.cost_coverage_rate
    ?? (margin.summary.total_revenue_krw > 0 ? round2((costCoveredRevenue / margin.summary.total_revenue_krw) * 100) : 0);
  const shownMarginItems = useMemo(() => {
    if (marginFilter === 'missing_cost') {
      return margin.items.filter((item) => item.avg_cost_wp == null || item.total_cost_krw == null);
    }
    if (marginFilter === 'low_margin') {
      return margin.items.filter((item) => item.margin_rate != null && item.margin_rate < 8);
    }
    if (marginFilter === 'negative_margin') {
      return margin.items.filter((item) => item.margin_rate != null && item.margin_rate < 0);
    }
    return margin.items;
  }, [margin.items, marginFilter]);
  const shownMarginCoveredCount = shownMarginItems.filter((item) => item.avg_cost_wp != null).length;
  const shownMarginTotals = useMemo(() => {
    const totalRevenue = shownMarginItems.reduce((sum, item) => sum + item.total_revenue_krw, 0);
    const totalCost = shownMarginItems.reduce((sum, item) => sum + (item.total_cost_krw ?? 0), 0);
    const coveredRevenue = shownMarginItems.reduce((sum, item) => sum + (item.cost_covered_revenue_krw ?? (item.total_cost_krw != null ? item.total_revenue_krw : 0)), 0);
    const totalMargin = coveredRevenue - totalCost;
    return {
      qty: shownMarginItems.reduce((sum, item) => sum + item.total_sold_qty, 0),
      revenue: totalRevenue,
      margin: totalMargin,
      rate: coveredRevenue > 0 ? round2((totalMargin / coveredRevenue) * 100) : 0,
    };
  }, [shownMarginItems]);
  const pendingInvoiceSales = useMemo(() => filteredSales.filter((item) => !item.sale.tax_invoice_date), [filteredSales]);
  const pendingInvoiceRevenue = useMemo(
    () => pendingInvoiceSales.reduce((sum, item) => sum + (item.sale.supply_amount ?? 0), 0),
    [pendingInvoiceSales],
  );
  const missingCostRows = useMemo(() => {
    return margin.items
      .map((item) => ({
        item,
        missingRevenue: item.cost_missing_revenue_krw ?? (item.total_cost_krw == null ? item.total_revenue_krw : 0),
      }))
      .filter((row) => row.missingRevenue > 0)
      .sort((a, b) => b.missingRevenue - a.missingRevenue)
      .slice(0, 5);
  }, [margin.items]);
  const marginDragRows = useMemo(() => {
    const portfolioRate = margin.summary.overall_margin_rate;
    return margin.items
      .map((item) => {
        const coveredRevenue = item.cost_covered_revenue_krw ?? (item.total_cost_krw != null ? item.total_revenue_krw : 0);
        const rate = item.margin_rate;
        const dragKrw = rate != null && coveredRevenue > 0 && rate < portfolioRate
          ? coveredRevenue * ((portfolioRate - rate) / 100)
          : 0;
        return { item, coveredRevenue, dragKrw: round2(dragKrw) };
      })
      .filter((row) => row.dragKrw > 0 || (row.item.total_margin_krw ?? 0) < 0)
      .sort((a, b) => b.dragKrw - a.dragKrw)
      .slice(0, 5);
  }, [margin.items, margin.summary.overall_margin_rate]);
  const manufacturerDeepRows = useMemo(() => {
    const map = new Map<string, {
      manufacturer: string;
      revenue: number;
      coveredRevenue: number;
      missingRevenue: number;
      cost: number;
      margin: number;
      kw: number;
      saleCount: number;
    }>();
    for (const item of margin.items) {
      const key = item.manufacturer_name || '제조사 없음';
      const prev = map.get(key) ?? {
        manufacturer: key,
        revenue: 0,
        coveredRevenue: 0,
        missingRevenue: 0,
        cost: 0,
        margin: 0,
        kw: 0,
        saleCount: 0,
      };
      const coveredRevenue = item.cost_covered_revenue_krw ?? (item.total_cost_krw != null ? item.total_revenue_krw : 0);
      const missingRevenue = item.cost_missing_revenue_krw ?? (item.total_cost_krw == null ? item.total_revenue_krw : 0);
      const cost = item.total_cost_krw ?? 0;
      map.set(key, {
        ...prev,
        revenue: prev.revenue + item.total_revenue_krw,
        coveredRevenue: prev.coveredRevenue + coveredRevenue,
        missingRevenue: prev.missingRevenue + missingRevenue,
        cost: prev.cost + cost,
        margin: prev.margin + (coveredRevenue - cost),
        kw: prev.kw + item.total_sold_kw,
        saleCount: prev.saleCount + item.sale_count,
      });
    }
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        marginRate: row.coveredRevenue > 0 ? round2((row.margin / row.coveredRevenue) * 100) : null,
        revenueShare: pct(row.revenue, margin.summary.total_revenue_krw),
        missingRate: pct(row.missingRevenue, row.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [margin.items, margin.summary.total_revenue_krw]);
  const customerRiskRows = useMemo(() => {
    return customers.items
      .map((item) => {
        const marginRate = item.avg_margin_rate ?? 0;
        const overdueBoost = Math.min(2, item.oldest_outstanding_days / 60);
        const marginPenalty = item.avg_margin_rate == null ? 0 : Math.max(0, 8 - marginRate) * item.total_sales_krw * 0.01;
        const score = item.outstanding_krw * (1 + overdueBoost) + marginPenalty;
        const signal = item.oldest_outstanding_days >= 60
          ? '연체'
          : item.outstanding_krw > 0
            ? '미수'
            : item.avg_margin_rate != null && item.avg_margin_rate < 8
              ? '저마진'
              : '정상';
        return { item, score, signal };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [customers.items]);
  const reconciliationRows = useMemo(() => {
    const engineDelta = moneyDelta(salesSummary.supply, margin.summary.total_revenue_krw);
    const engineDeltaRate = pct(engineDelta, Math.max(salesSummary.supply, margin.summary.total_revenue_krw));
    const missingCostRate = pct(costMissingRevenue, margin.summary.total_revenue_krw);
    const outstandingRate = pct(customers.summary.total_outstanding_krw, customers.summary.total_sales_krw);
    return [
      {
        name: '매출원장 ↔ 이익엔진',
        value: formatKRW(engineDelta),
        sub: `${engineDeltaRate.toFixed(2)}% 차이`,
        level: engineDeltaRate < 0.1 ? 'good' as const : engineDeltaRate < 1 ? 'watch' as const : 'risk' as const,
      },
      {
        name: '세금계산서 미발행',
        value: `${pendingInvoiceSales.length.toLocaleString('ko-KR')}건`,
        sub: formatKRW(pendingInvoiceRevenue),
        level: pendingInvoiceRevenue === 0 ? 'good' as const : 'watch' as const,
      },
      {
        name: '원가 미연결',
        value: formatKRW(costMissingRevenue),
        sub: `${missingCostRate.toFixed(1)}%`,
        level: missingCostRate === 0 ? 'good' as const : missingCostRate < 5 ? 'watch' as const : 'risk' as const,
      },
      {
        name: '수금 미회수',
        value: formatKRW(customers.summary.total_outstanding_krw),
        sub: `${outstandingRate.toFixed(1)}%`,
        level: outstandingRate === 0 ? 'good' as const : outstandingRate < 15 ? 'watch' as const : 'risk' as const,
      },
    ];
  }, [
    costMissingRevenue,
    customers.summary.total_outstanding_krw,
    customers.summary.total_sales_krw,
    margin.summary.total_revenue_krw,
    pendingInvoiceRevenue,
    pendingInvoiceSales.length,
    salesSummary.supply,
  ]);
  const actionQueue = useMemo(() => {
    const actions: { title: string; value: string; detail: string }[] = [];
    const topMissing = missingCostRows[0];
    if (topMissing) {
      actions.push({
        title: '원가 연결',
        value: formatKRW(topMissing.missingRevenue),
        detail: `${topMissing.item.product_code} 원가부터 연결`,
      });
    }
    const topDrag = marginDragRows[0];
    if (topDrag) {
      actions.push({
        title: '저마진 방어',
        value: formatKRW(topDrag.dragKrw),
        detail: `${topDrag.item.product_code} 평균 대비 이익 누수`,
      });
    }
    const topCustomerRisk = customerRiskRows[0];
    if (topCustomerRisk) {
      actions.push({
        title: '수금 우선',
        value: formatKRW(topCustomerRisk.item.outstanding_krw),
        detail: `${topCustomerRisk.item.customer_name} · ${topCustomerRisk.signal}`,
      });
    }
    if (pendingInvoiceRevenue > 0) {
      actions.push({
        title: '계산서 발행',
        value: `${pendingInvoiceSales.length.toLocaleString('ko-KR')}건`,
        detail: `${formatKRW(pendingInvoiceRevenue)} 공급가 미발행`,
      });
    }
    if (actions.length === 0) {
      actions.push({ title: '정상 범위', value: '대기', detail: '큰 이익 누수 신호 없음' });
    }
    return actions.slice(0, 4);
  }, [customerRiskRows, marginDragRows, missingCostRows, pendingInvoiceRevenue, pendingInvoiceSales.length]);
  const causeRows = useMemo(() => {
    const rows = marginDragRows.slice(0, 3).map((row) => ({
      key: `drag-${row.item.product_code}-${row.item.spec_wp}`,
      kind: '저마진',
      target: row.item.product_code,
      value: formatKRW(row.dragKrw),
      basis: `${row.item.margin_rate?.toFixed(1) ?? '—'}% · 평균 ${margin.summary.overall_margin_rate.toFixed(1)}%`,
    }));
    for (const row of missingCostRows.slice(0, 3)) {
      rows.push({
        key: `missing-${row.item.product_code}-${row.item.spec_wp}`,
        kind: '원가 없음',
        target: row.item.product_code,
        value: formatKRW(row.missingRevenue),
        basis: '이익률 계산 제외',
      });
    }
    return rows.slice(0, 6);
  }, [margin.summary.overall_margin_rate, marginDragRows, missingCostRows]);
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
  const marginFilterOptions = [
    { key: 'all', label: '전체' },
    { key: 'missing_cost', label: '원가 없음' },
    { key: 'low_margin', label: '저마진' },
    { key: 'negative_margin', label: '적자' },
  ];
  const topCustomer = customers.items[0];
  const shownCustomers = customers.items.slice(0, 8);
  const shownCustomerTotals = shownCustomers.reduce(
    (acc, item) => ({
      sales: acc.sales + item.total_sales_krw,
      outstanding: acc.outstanding + item.outstanding_krw,
    }),
    { sales: 0, outstanding: 0 },
  );

  return (
    <div className="sf-page">
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
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
              {/* D-064 PR 30: 원가 기준 토글 — fifo 정합치 / landed 추정 / cif 추정 */}
              <FilterChips
                options={[
                  { key: 'fifo', label: 'FIFO 정합' },
                  { key: 'landed', label: 'Landed' },
                  { key: 'cif', label: 'CIF' },
                ]}
                value={costBasis}
                onChange={(value) => setCostBasis(value as CostBasis)}
              />
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
      {state.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {state.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      )}

      {/* NumberTween formatter — '억' 단위 (krw 원본을 억으로 나눠 .toFixed(2)). */}
      {/* 모든 KPI 가 동일 패턴이라 inline closure 로 처리. */}
      <div className="sf-command-kpis">
        <TileB
          lbl="공급가 매출"
          v={(salesSummary.supply / 100000000).toFixed(2)}
          numericValue={salesSummary.supply}
          formatter={(n) => (n / 100000000).toFixed(2)}
          u="억"
          sub={`${formatNumber(salesSummary.count)}건`}
          tone="solar"
          spark={supplySpark}
          metricId="sales_analysis.supply_amount"
        />
        <TileB
          lbl="계산 이익"
          v={(margin.summary.total_margin_krw / 100000000).toFixed(2)}
          numericValue={margin.summary.total_margin_krw}
          formatter={(n) => (n / 100000000).toFixed(2)}
          u="억"
          sub={`${formatKRW(costCoveredRevenue)} 기준`}
          tone={margin.summary.total_margin_krw >= 0 ? 'pos' : 'neg'}
          spark={flatSpark(Math.abs(margin.summary.total_margin_krw))}
          metricId="sales_analysis.margin_rate"
        />
        <TileB
          lbl="이익률"
          v={margin.summary.overall_margin_rate.toFixed(1)}
          numericValue={margin.summary.overall_margin_rate}
          formatter={(n) => n.toFixed(1)}
          u="%"
          sub={`원가 연결률 ${costCoverageRate.toFixed(0)}%`}
          tone={margin.summary.overall_margin_rate >= 8 ? 'pos' : 'warn'}
          spark={flatSpark(margin.summary.overall_margin_rate)}
          metricId="sales_analysis.margin_rate"
        />
        <TileB
          lbl="미수금"
          v={(customers.summary.total_outstanding_krw / 100000000).toFixed(2)}
          numericValue={customers.summary.total_outstanding_krw}
          formatter={(n) => (n / 100000000).toFixed(2)}
          u="억"
          sub={`수금 ${formatKRW(customers.summary.total_collected_krw)}`}
          tone={customers.summary.total_outstanding_krw > 0 ? 'warn' : 'pos'}
          metricId="receipts.remaining"
        />
        <TileB
          lbl="계산서 미발행"
          v={String(salesSummary.pending)}
          numericValue={salesSummary.pending}
          formatter={(n) => String(Math.round(n))}
          u="건"
          sub={`${formatNumber(salesSummary.issued)}건 발행 · ${salesSummary.issueRate}%`}
          tone={salesSummary.pending > 0 ? 'warn' : 'info'}
          spark={issueRateSpark}
          metricId="sales_analysis.issue_rate"
        />
        <TileB
          lbl="원가 미연결"
          v={(costMissingRevenue / 100000000).toFixed(2)}
          numericValue={costMissingRevenue}
          formatter={(n) => (n / 100000000).toFixed(2)}
          u="억"
          sub={`${formatNumber(costMissingItemCount)}개 품목`}
          tone={costMissingRevenue > 0 ? 'warn' : 'pos'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <CardB title="이익 원인 분해" sub="저마진 · 원가 공백 우선순위">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>구분</TableHead>
                <TableHead>대상</TableHead>
                <TableHead className="text-right">규모</TableHead>
                <TableHead className="text-right">근거</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {causeRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="text-xs">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${row.kind === '원가 없음' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{row.kind}</span>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{row.target}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{row.value}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{row.basis}</TableCell>
                </TableRow>
              ))}
              {causeRows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">큰 이익 누수 신호가 없습니다</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardB>

        <CardB title="거래처 위험 우선순위" sub="미수 · 연체 · 저마진 복합 점수">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>거래처</TableHead>
                <TableHead>신호</TableHead>
                <TableHead className="text-right">미수</TableHead>
                <TableHead className="text-right">이익률</TableHead>
                <TableHead className="text-right">최장</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customerRiskRows.map(({ item, signal }) => (
                <TableRow key={item.customer_id}>
                  <TableCell className="text-xs font-medium">{item.customer_name}</TableCell>
                  <TableCell className="text-xs">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${signal === '연체' ? 'bg-red-100 text-red-700' : signal === '정상' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{signal}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatKRW(item.outstanding_krw)}</TableCell>
                  <TableCell className="text-right text-xs">{item.avg_margin_rate != null ? `${item.avg_margin_rate.toFixed(1)}%` : '—'}</TableCell>
                  <TableCell className="text-right text-xs">{item.oldest_outstanding_days}일</TableCell>
                </TableRow>
              ))}
              {customerRiskRows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">우선 대응할 거래처 위험이 없습니다</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardB>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <CardB title="제조사별 기여도" sub="매출 비중 · 이익률 · 원가 공백">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제조사</TableHead>
                <TableHead className="text-right">매출</TableHead>
                <TableHead className="text-right">비중</TableHead>
                <TableHead className="text-right">이익률</TableHead>
                <TableHead className="text-right">원가공백</TableHead>
                <TableHead className="text-right">출고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manufacturerDeepRows.map((row) => (
                <TableRow key={row.manufacturer}>
                  <TableCell className="text-xs font-medium">{row.manufacturer}</TableCell>
                  <TableCell className="text-right text-xs">{formatKRW(row.revenue)}</TableCell>
                  <TableCell className="text-right text-xs">{row.revenueShare.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-xs font-medium">{row.marginRate != null ? `${row.marginRate.toFixed(1)}%` : '—'}</TableCell>
                  <TableCell className="text-right text-xs">{row.missingRate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-xs">{row.kw.toFixed(1)}kW</TableCell>
                </TableRow>
              ))}
              {manufacturerDeepRows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">제조사별 분석 데이터가 없습니다</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardB>

        <CardB title="원장 대사 체크" sub="매출 · 세금계산서 · 원가 · 수금">
          <div className="divide-y divide-[var(--line)]">
            {reconciliationRows.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-[var(--ink)]">{row.name}</div>
                  <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">{row.sub}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="mono text-xs font-semibold">{row.value}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${levelTone(row.level)}`}>
                    {row.level === 'good' ? '정상' : row.level === 'watch' ? '주의' : '위험'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardB>
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
                {shownCustomers.map((item) => (
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
              {shownCustomers.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell className="text-xs font-medium">합계</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatKRW(shownCustomerTotals.sales)}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatKRW(shownCustomerTotals.outstanding)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{shownCustomers.length.toLocaleString('ko-KR')}건</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
        </CardB>
      </div>

      <CardB
        title="품목별 이익 분석"
        sub="판매가 · 원가 · 이익/Wp"
        right={<FilterChips options={marginFilterOptions} value={marginFilter} onChange={(value) => setMarginFilter(value as MarginFilter)} />}
      >
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
              {shownMarginItems.map((item) => {
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
              {shownMarginItems.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-xs text-muted-foreground">이익 분석 데이터가 없습니다</TableCell></TableRow>
              )}
            </TableBody>
            {shownMarginItems.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="text-xs font-medium">합계</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{shownMarginItems.length.toLocaleString('ko-KR')}건</TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatNumber(shownMarginTotals.qty)}</TableCell>
                  <TableCell />
                  <TableCell className="text-xs text-muted-foreground">원가 연결 {shownMarginCoveredCount.toLocaleString('ko-KR')}건</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right text-xs font-medium">{shownMarginTotals.rate.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatKRW(shownMarginTotals.revenue)}</TableCell>
                  <TableCell className="text-right text-xs font-medium">{formatKRW(shownMarginTotals.margin)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
      </CardB>
        </section>

        <aside className="sf-procurement-rail card">
          <RailBlock title="이익 신뢰도" count={`${costCoverageRate.toFixed(0)}%`}>
            <div className="bignum text-[30px] text-[var(--solar-3)]">{margin.summary.overall_margin_rate.toFixed(1)}<span className="mono text-sm text-[var(--ink-3)]">%</span></div>
            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">계산 이익 {formatKRW(margin.summary.total_margin_krw)} · 미연결 {formatKRW(costMissingRevenue)}</div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--bg-2)]">
              <div className="h-full bg-[var(--solar-2)]" style={{ width: `${Math.min(100, costCoverageRate)}%` }} />
            </div>
          </RailBlock>
          <RailBlock title="우선 조치" count={`${actionQueue.length}`}>
            <div className="space-y-2">
              {actionQueue.map((action, index) => (
                <div key={`${action.title}-${index}`} className={index ? 'border-t border-[var(--line)] pt-2' : ''}>
                  <div className="flex justify-between gap-2 text-[11.5px]">
                    <span className="font-medium text-[var(--ink)]">{action.title}</span>
                    <span className="mono text-[var(--ink-2)]">{action.value}</span>
                  </div>
                  <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">{action.detail}</div>
                </div>
              ))}
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
