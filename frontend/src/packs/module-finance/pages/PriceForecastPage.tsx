import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Download,
  DollarSign,
  FilePlus2,
  Layers,
  Minus,
  RefreshCw,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
  Trash2,
  XCircle,
} from 'lucide-react';
import { MasterConsole } from '@/components/command/MasterConsole';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchWithAuth } from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/utils';
import { formatError, notify } from '@/lib/notify';
import { confirmDialog } from '@/lib/dialogs';
import type {
  PriceBenchmark,
  PriceBenchmarkAIRefreshResult,
  PriceBenchmarkReviewStatus,
  PriceBenchmarkRun,
  PriceForecastScenario,
  PriceForecastSourceQuality,
  PriceForecastStrategyRequest,
  PriceForecastStrategyResponse,
} from '@/types/priceBenchmark';

const SOURCE_OPTIONS = [
  { key: 'opis', label: 'OPIS', sub: 'CMM · Forward · EU DDP' },
  { key: 'infolink', label: 'InfoLink', sub: '모듈·폴리실리콘' },
  { key: 'trendforce', label: 'TrendForce', sub: '주간가·입찰' },
  { key: 'pvinsights', label: 'PVinsights', sub: '중국·유럽 보조' },
  { key: 'china_tender', label: '중국 입찰', sub: '국영 GW급' },
  { key: 'cpia_floor', label: 'CPIA', sub: '원가 floor' },
  { key: 'our_quote', label: '우리 견적', sub: '미체결 공급사 견적' },
];

const AI_SOURCE_OPTIONS = SOURCE_OPTIONS.filter((source) => source.key !== 'our_quote');

const METRIC_LABELS: Record<string, string> = {
  cmm_fob_china_topcon_600w: 'CMM FOB China TOPCon',
  forward_q1: 'Forward Q+1',
  forward_q2: 'Forward Q+2',
  forward_q3: 'Forward Q+3',
  forward_q4: 'Forward Q+4',
  ddp_europe: 'DDP Europe',
  module_centralized: 'Centralized',
  module_distributed: 'Distributed',
  cell: 'Cell',
  wafer: 'Wafer',
  polysilicon: 'Polysilicon',
  china_domestic: '중국 국내가',
  china_export: '중국 수출가',
  china_state_tender: '국영 입찰가',
  cpia_cost_floor: 'CPIA Floor',
  supplier_quote: '공급사 견적',
};

const UNIT_OPTIONS = [
  { key: 'usd', label: 'USD/W' },
  { key: 'cny', label: 'CNY/W' },
  { key: 'krw', label: 'KRW/W' },
] as const;

const HORIZON_OPTIONS = [
  { key: '6m', label: '6개월', months: 6 },
  { key: '12m', label: '12개월', months: 12 },
  { key: '18m', label: '18개월', months: 18 },
  { key: '36m', label: '36개월', months: 36 },
] as const;

const CHART_PRESETS = [
  { key: 'core', label: '핵심 지표', icon: Target },
  { key: 'our', label: '우리 거래·견적', icon: DollarSign },
  { key: 'basis', label: 'FOB · DDP · 입찰', icon: Layers },
] as const;

const ALL_FILTER = 'all';
const REVIEW_ACTIVE_FILTER = 'active';

const REVIEW_FILTER_OPTIONS = [
  { key: REVIEW_ACTIVE_FILTER, label: '검토 대상' },
  { key: 'candidate', label: '후보' },
  { key: 'accepted', label: '채택' },
  { key: 'rejected', label: '제외' },
  { key: ALL_FILTER, label: '전체' },
] as const;

const LINE_COLORS = [
  '#0f766e',
  '#b91c1c',
  '#2563eb',
  '#a16207',
  '#7c3aed',
  '#15803d',
  '#be123c',
  '#0369a1',
  '#c2410c',
  '#4f46e5',
];

type UnitKey = (typeof UNIT_OPTIONS)[number]['key'];
type HorizonKey = (typeof HORIZON_OPTIONS)[number]['key'];
type ChartPresetKey = (typeof CHART_PRESETS)[number]['key'];
type ReviewFilterKey = (typeof REVIEW_FILTER_OPTIONS)[number]['key'];
type ChartPoint = Record<string, string | number>;

interface SeriesDef {
  key: string;
  label: string;
  sourceKey: string;
  metricKey: string;
  marketRegion: string;
  basis: string;
  latestDate: string;
  latestValue: number;
}

interface SeriesInsight {
  latestDate: string;
  latestValue: number;
  previousDate: string | null;
  previousValue: number | null;
  delta: number | null;
  deltaPct: number | null;
}

interface LatestOwnPrice {
  date: string;
  value: number;
  count: number;
}

interface RunSourceHealth {
  key: string;
  label: string;
  status: 'ok' | 'warning' | 'failed' | 'running';
}

interface QuoteFormState {
  supplier: string;
  valueDate: string;
  priceUsdW: string;
  marketRegion: 'fob_china' | 'china_export' | 'ddp_europe';
  basis: 'quote' | 'fob' | 'ddp';
  technology: string;
  notes: string;
}

// PR 42: 우리 구매가 + 평균 판매가 시리즈
interface OurPricesPurchase {
  month: string;
  count: number;
  avg_usd_wp: number;
  avg_krw_wp: number;
}
interface OurPricesSale {
  month: string;
  count: number;
  avg_krw_wp: number;
}
interface OurPricesResponse {
  purchases: OurPricesPurchase[];
  sales: OurPricesSale[];
  generated_at: string;
}

function priceValue(row: PriceBenchmark, unit: UnitKey): number | null {
  const value = unit === 'usd' ? row.price_usd_w : unit === 'cny' ? row.price_cny_w : row.price_krw_w;
  return value != null && Number.isFinite(value) ? Number(value) : null;
}

function formatUnitPrice(value: number | null | undefined, unit: UnitKey): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (unit === 'krw') return `${formatNumber(value)}원/W`;
  const symbol = unit === 'usd' ? '$' : '¥';
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}/W`;
}

function formatConfidence(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

function benchmarkReviewStatus(row: PriceBenchmark): PriceBenchmarkReviewStatus {
  if (row.review_status === 'accepted' || row.review_status === 'rejected') return row.review_status;
  return 'candidate';
}

function reviewStatusLabel(status: PriceBenchmarkReviewStatus): string {
  if (status === 'accepted') return '채택';
  if (status === 'rejected') return '제외';
  return '후보';
}

function reviewStatusVariant(status: PriceBenchmarkReviewStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'accepted') return 'default';
  if (status === 'rejected') return 'secondary';
  return 'outline';
}

function reviewMatchesFilter(row: PriceBenchmark, filter: ReviewFilterKey): boolean {
  const status = benchmarkReviewStatus(row);
  if (filter === REVIEW_ACTIVE_FILTER) return status !== 'rejected';
  if (filter === ALL_FILTER) return true;
  return status === filter;
}

function monthStart(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function seriesKey(row: PriceBenchmark) {
  return [row.source_key, row.metric_key, row.market_region, row.basis, row.quarter_label ?? ''].join('__');
}

function shortSeriesLabel(row: PriceBenchmark) {
  const metric = METRIC_LABELS[row.metric_key] ?? row.metric_label;
  const region = row.market_region.replaceAll('_', ' ');
  return `${row.source_name} · ${metric}${region ? ` · ${region}` : ''}`;
}

function statusLabel(status: PriceBenchmarkRun['status']) {
  if (status === 'completed') return '완료';
  if (status === 'partial') return '부분';
  if (status === 'failed') return '실패';
  return '실행중';
}

function statusVariant(status: PriceBenchmarkRun['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'failed') return 'destructive';
  if (status === 'completed') return 'default';
  if (status === 'partial') return 'secondary';
  return 'outline';
}

function seriesMatchesPreset(item: SeriesDef, preset: ChartPresetKey) {
  if (preset === 'core') {
    return (
      item.key === 'our_purchase' ||
      item.metricKey === 'supplier_quote' ||
      [
        'cmm_fob_china_topcon_600w',
        'china_state_tender',
        'cpia_cost_floor',
      ].includes(item.metricKey)
    );
  }
  if (preset === 'our') {
    return item.sourceKey === 'our' || item.sourceKey === 'our_quote' || ['cmm_fob_china_topcon_600w', 'china_state_tender'].includes(item.metricKey);
  }
  return item.sourceKey !== 'our' && ['fob', 'ddp', 'tender', 'quote'].includes(item.basis);
}

function valueFromPoint(point: ChartPoint, key: string): number | null {
  const value = point[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildSeriesInsight(points: ChartPoint[], key: string): SeriesInsight | null {
  const values = points
    .map((point) => {
      const value = valueFromPoint(point, key);
      return value == null ? null : { date: String(point.date), value };
    })
    .filter((point): point is { date: string; value: number } => point != null);
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const previous = values.length >= 2 ? values[values.length - 2] : null;
  const delta = previous ? latest.value - previous.value : null;
  const deltaPct = previous && previous.value !== 0 ? (delta! / previous.value) * 100 : null;
  return {
    latestDate: latest.date,
    latestValue: latest.value,
    previousDate: previous?.date ?? null,
    previousValue: previous?.value ?? null,
    delta,
    deltaPct,
  };
}

function formatDeltaPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatAbsPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatScenarioRange(scenario: PriceForecastScenario | null | undefined) {
  if (!scenario || scenario.low_usd_w == null || scenario.high_usd_w == null) return '—';
  return `${formatUnitPrice(scenario.low_usd_w, 'usd')} ~ ${formatUnitPrice(scenario.high_usd_w, 'usd')}`;
}

function directionTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 1.5) return 'flat';
  return value > 0 ? 'up' : 'down';
}

function latestOwnPurchase(data: OurPricesResponse | null, unit: UnitKey): LatestOwnPrice | null {
  if (!data || unit === 'cny') return null;
  let latest: LatestOwnPrice | null = null;
  for (const item of data.purchases) {
    const value = unit === 'usd' ? item.avg_usd_wp : item.avg_krw_wp;
    if (value <= 0) continue;
    const date = `${item.month}-15`;
    if (!latest || date > latest.date) {
      latest = { date, value, count: item.count };
    }
  }
  return latest;
}

function latestOwnSale(data: OurPricesResponse | null, unit: UnitKey): LatestOwnPrice | null {
  if (!data || unit !== 'krw') return null;
  let latest: LatestOwnPrice | null = null;
  for (const item of data.sales) {
    if (item.avg_krw_wp <= 0) continue;
    const date = `${item.month}-15`;
    if (!latest || date > latest.date) {
      latest = { date, value: item.avg_krw_wp, count: item.count };
    }
  }
  return latest;
}

function latestBenchmarkByMetric(rows: PriceBenchmark[], metricKey: string, unit: UnitKey): PriceBenchmark | null {
  let latest: PriceBenchmark | null = null;
  for (const row of rows) {
    if (row.metric_key !== metricKey || priceValue(row, unit) == null) continue;
    if (!latest || row.value_date > latest.value_date) latest = row;
  }
  return latest;
}

function latestTwoBenchmarkValues(rows: PriceBenchmark[], metricKey: string, unit: UnitKey): { latest: number; previous: number | null } | null {
  const values = rows
    .filter((row) => row.metric_key === metricKey)
    .map((row) => {
      const value = priceValue(row, unit);
      return value == null ? null : { date: row.value_date, value };
    })
    .filter((point): point is { date: string; value: number } => point != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const previous = values.length >= 2 ? values[values.length - 2] : null;
  return { latest: latest.value, previous: previous?.value ?? null };
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function parseRunStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseRunWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    .filter((item) => item && item !== 'null');
}

function parseEvidenceSourceKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(value)) return keys;
  for (const item of value) {
    if (item && typeof item === 'object' && 'source_key' in item) {
      const key = String((item as { source_key?: unknown }).source_key ?? '').trim();
      if (key) keys.add(key);
    }
  }
  return keys;
}

function runSourceHealth(run: PriceBenchmarkRun): RunSourceHealth[] {
  const sourceKeys = parseRunStringArray(run.source_keys);
  const warnings = parseRunWarnings(run.warnings);
  const evidenceKeys = parseEvidenceSourceKeys(run.evidence);
  const keys = sourceKeys.length > 0 ? sourceKeys : AI_SOURCE_OPTIONS.map((source) => source.key);
  return keys.map((key) => {
    const source = SOURCE_OPTIONS.find((item) => item.key === key);
    const label = source?.label ?? key;
    const sourceWarnings = warnings.filter((warning) => (
      warning.toLowerCase().includes(key.toLowerCase()) || warning.includes(label)
    ));
    if (run.status === 'running') return { key, label, status: 'running' };
    if (run.status === 'failed') return { key, label, status: 'failed' };
    if (sourceWarnings.some((warning) => /실패|fail|error|evidence 0|skip/i.test(warning))) {
      return { key, label, status: 'warning' };
    }
    if (run.status === 'partial' && !evidenceKeys.has(key)) {
      return { key, label, status: 'warning' };
    }
    return { key, label, status: 'ok' };
  });
}

function runHealthVariant(status: RunSourceHealth['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'failed') return 'destructive';
  if (status === 'warning') return 'secondary';
  if (status === 'running') return 'outline';
  return 'default';
}

function runHealthLabel(status: RunSourceHealth['status']) {
  if (status === 'failed') return '실패';
  if (status === 'warning') return '확인';
  if (status === 'running') return '진행';
  return '정상';
}

function qualityVariant(status: PriceForecastSourceQuality['status']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'stale') return 'destructive';
  if (status === 'watch') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
}

function qualityLabel(status: PriceForecastSourceQuality['status']) {
  if (status === 'stale') return '보강';
  if (status === 'watch') return '확인';
  if (status === 'ok') return '정상';
  return status;
}

function strategyToneClass(tone: PriceForecastStrategyResponse['tone'] | undefined) {
  if (tone === 'positive') return 'text-emerald-700';
  if (tone === 'warning') return 'text-amber-700';
  return 'text-[var(--ink)]';
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export default function PriceForecastPage() {
  const [rows, setRows] = useState<PriceBenchmark[]>([]);
  const [runs, setRuns] = useState<PriceBenchmarkRun[]>([]);
  const [ourPrices, setOurPrices] = useState<OurPricesResponse | null>(null);
  const [forecastStrategy, setForecastStrategy] = useState<PriceForecastStrategyResponse | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState<UnitKey>('usd');
  const [horizon, setHorizon] = useState<HorizonKey>('18m');
  const [chartPreset, setChartPreset] = useState<ChartPresetKey>('core');
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(null);
  const [basisFilter, setBasisFilter] = useState(ALL_FILTER);
  const [regionFilter, setRegionFilter] = useState(ALL_FILTER);
  const [technologyFilter, setTechnologyFilter] = useState(ALL_FILTER);
  const [quarterFilter, setQuarterFilter] = useState(ALL_FILTER);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilterKey>(REVIEW_ACTIVE_FILTER);
  const [selectedBenchmarkIds, setSelectedBenchmarkIds] = useState<Set<string>>(() => new Set());
  // selectedSources — 차트/표 표시 필터 (사이드바 "표시 필터" 체크박스).
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    () => new Set(SOURCE_OPTIONS.map((source) => source.key)),
  );
  // aiSources — AI 수집 대상 (헤더 chip toggle). 표시 필터와 독립적.
  // 기본값은 모두 선택. OPIS 가 죽었을 때 OPIS 만 빼고 돌리거나, 한 source 만 빠르게 갱신할 때 사용.
  const [aiSources, setAiSources] = useState<Set<string>>(
    () => new Set(AI_SOURCE_OPTIONS.map((source) => source.key)),
  );
  const [savingQuote, setSavingQuote] = useState(false);
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>(() => ({
    supplier: '',
    valueDate: new Date().toISOString().slice(0, 10),
    priceUsdW: '',
    marketRegion: 'fob_china',
    basis: 'quote',
    technology: 'TOPCon >=600W',
    notes: '',
  }));
  const [sourceListParent] = useAutoAnimate<HTMLDivElement>();
  const [runLogParent] = useAutoAnimate<HTMLDivElement>();

  const selectedHorizon = HORIZON_OPTIONS.find((item) => item.key === horizon) ?? HORIZON_OPTIONS[2];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const from = monthStart(selectedHorizon.months);
      const [loadedRows, loadedRuns, loadedOur] = await Promise.all([
        fetchWithAuth<PriceBenchmark[]>(`/api/v1/price-benchmarks?limit=3000&from=${from}`),
        fetchWithAuth<PriceBenchmarkRun[]>('/api/v1/price-benchmarks/runs?limit=8'),
        fetchWithAuth<OurPricesResponse>(`/api/v1/price-benchmarks/our-prices?from=${from}`).catch(() => null),
      ]);
      setRows(loadedRows);
      setRuns(loadedRuns);
      setOurPrices(loadedOur);
    } catch (err) {
      notify.error(formatError(err));
      setRows([]);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [selectedHorizon.months]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runs.some((run) => run.status === 'running')) return;
    const timer = window.setTimeout(() => void load(), 5000);
    return () => window.clearTimeout(timer);
  }, [runs, load]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!selectedSources.has(row.source_key)) return false;
      if (!reviewMatchesFilter(row, reviewFilter)) return false;
      if (priceValue(row, unit) == null) return false;
      if (basisFilter !== ALL_FILTER && row.basis !== basisFilter) return false;
      if (regionFilter !== ALL_FILTER && row.market_region !== regionFilter) return false;
      if (technologyFilter !== ALL_FILTER && (row.technology ?? '') !== technologyFilter) return false;
      if (quarterFilter !== ALL_FILTER && (row.quarter_label ?? row.period_label ?? '') !== quarterFilter) return false;
      if (!q) return true;
      const haystack = [
        row.source_name,
        row.metric_label,
        METRIC_LABELS[row.metric_key],
        row.market_region,
        row.basis,
        row.technology,
        row.project_segment,
        row.notes,
      ].join(' ').toLowerCase();
      return q.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [basisFilter, query, quarterFilter, regionFilter, reviewFilter, rows, selectedSources, technologyFilter, unit]);

  const selectedSourceRows = useMemo(
    () => rows.filter((row) => selectedSources.has(row.source_key) && benchmarkReviewStatus(row) !== 'rejected'),
    [rows, selectedSources],
  );

  const reviewCounts = useMemo(() => rows.reduce<Record<PriceBenchmarkReviewStatus, number>>((acc, row) => {
    acc[benchmarkReviewStatus(row)] += 1;
    return acc;
  }, { candidate: 0, accepted: 0, rejected: 0 }), [rows]);

  const filterOptions = useMemo(() => {
    const scopedRows = rows.filter((row) => (
      selectedSources.has(row.source_key)
      && reviewMatchesFilter(row, reviewFilter)
      && priceValue(row, unit) != null
    ));
    return {
      basis: uniqueOptions(scopedRows.map((row) => row.basis)),
      regions: uniqueOptions(scopedRows.map((row) => row.market_region)),
      technologies: uniqueOptions(scopedRows.map((row) => row.technology)),
      quarters: uniqueOptions(scopedRows.map((row) => row.quarter_label ?? row.period_label)),
    };
  }, [reviewFilter, rows, selectedSources, unit]);

  const visibleRows = filteredRows;

  useEffect(() => {
    setSelectedBenchmarkIds((prev) => {
      if (prev.size === 0) return prev;
      const allowed = new Set(filteredRows.map((row) => row.benchmark_id));
      const next = new Set(Array.from(prev).filter((id) => allowed.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredRows]);

  useEffect(() => {
    if (basisFilter !== ALL_FILTER && !filterOptions.basis.includes(basisFilter)) setBasisFilter(ALL_FILTER);
    if (regionFilter !== ALL_FILTER && !filterOptions.regions.includes(regionFilter)) setRegionFilter(ALL_FILTER);
    if (technologyFilter !== ALL_FILTER && !filterOptions.technologies.includes(technologyFilter)) setTechnologyFilter(ALL_FILTER);
    if (quarterFilter !== ALL_FILTER && !filterOptions.quarters.includes(quarterFilter)) setQuarterFilter(ALL_FILTER);
  }, [basisFilter, filterOptions, quarterFilter, regionFilter, technologyFilter]);

  const { chartData, series } = useMemo(() => {
    const pointByDate = new Map<string, Record<string, string | number>>();
    const defs = new Map<string, SeriesDef>();
    const sorted = [...filteredRows].sort((a, b) => a.value_date.localeCompare(b.value_date));
    for (const row of sorted) {
      const value = priceValue(row, unit);
      if (value == null) continue;
      const key = seriesKey(row);
      const date = row.value_date.slice(0, 10);
      const item = pointByDate.get(date) ?? { date };
      item[key] = value;
      pointByDate.set(date, item);
      defs.set(key, {
        key,
        label: shortSeriesLabel(row),
        sourceKey: row.source_key,
        metricKey: row.metric_key,
        marketRegion: row.market_region,
        basis: row.basis,
        latestDate: date,
        latestValue: value,
      });
    }

    // PR 42: 우리 구매가/판매가 시리즈 추가 (월별 평균, 단가 단위에 맞춰)
    if (ourPrices) {
      const purchaseValueOf = (p: OurPricesPurchase): number | null => {
        if (unit === 'usd') return p.avg_usd_wp > 0 ? p.avg_usd_wp : null;
        if (unit === 'krw') return p.avg_krw_wp > 0 ? p.avg_krw_wp : null;
        return null; // CNY 미지원
      };
      const saleValueOf = (s: OurPricesSale): number | null => (
        unit === 'krw' && s.avg_krw_wp > 0 ? s.avg_krw_wp : null
      );

      let purchaseLatestDate = '';
      let purchaseLatestValue = 0;
      for (const p of ourPrices.purchases) {
        const v = purchaseValueOf(p);
        if (v == null) continue;
        const date = `${p.month}-15`; // 월 중앙 표시
        const item = pointByDate.get(date) ?? { date };
        item['our_purchase'] = v;
        pointByDate.set(date, item);
        if (date > purchaseLatestDate) {
          purchaseLatestDate = date;
          purchaseLatestValue = v;
        }
      }
      if (purchaseLatestDate) {
        defs.set('our_purchase', {
          key: 'our_purchase',
          label: '우리 구매계약가',
          sourceKey: 'our',
          metricKey: 'our_purchase',
          marketRegion: 'internal',
          basis: 'transaction',
          latestDate: purchaseLatestDate,
          latestValue: purchaseLatestValue,
        });
      }

      let saleLatestDate = '';
      let saleLatestValue = 0;
      for (const s of ourPrices.sales) {
        const v = saleValueOf(s);
        if (v == null) continue;
        const date = `${s.month}-15`;
        const item = pointByDate.get(date) ?? { date };
        item['our_sale'] = v;
        pointByDate.set(date, item);
        if (date > saleLatestDate) {
          saleLatestDate = date;
          saleLatestValue = v;
        }
      }
      if (saleLatestDate) {
        defs.set('our_sale', {
          key: 'our_sale',
          label: '우리 평균 판매가',
          sourceKey: 'our',
          metricKey: 'our_sale',
          marketRegion: 'internal',
          basis: 'transaction',
          latestDate: saleLatestDate,
          latestValue: saleLatestValue,
        });
      }
    }

    const presetDefs = Array.from(defs.values()).filter((item) => seriesMatchesPreset(item, chartPreset));
    const ourDefs = presetDefs.filter((d) => d.sourceKey === 'our');
    const externalDefs = presetDefs
      .filter((d) => d.sourceKey !== 'our')
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate))
      .slice(0, 10);
    return {
      chartData: Array.from(pointByDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
      series: [...ourDefs, ...externalDefs],
    };
  }, [filteredRows, unit, ourPrices, chartPreset]);

  const latestByMetric = useMemo(() => {
    const latest = new Map<string, PriceBenchmark>();
    for (const row of filteredRows) {
      const key = row.metric_key;
      const prev = latest.get(key);
      if (!prev || row.value_date > prev.value_date) latest.set(key, row);
    }
    return latest;
  }, [filteredRows]);

  const selectedSeries = series.find((item) => item.key === selectedSeriesKey) ?? series[0] ?? null;
  const selectedSeriesInsight = selectedSeries ? buildSeriesInsight(chartData, selectedSeries.key) : null;
  const ownPurchase = latestOwnPurchase(ourPrices, unit);
  const ownSale = latestOwnSale(ourPrices, unit);
  const latestCmmForUnit = latestBenchmarkByMetric(selectedSourceRows, 'cmm_fob_china_topcon_600w', unit);
  const latestTenderForUnit = latestBenchmarkByMetric(selectedSourceRows, 'china_state_tender', unit);
  const latestFloorForUnit = latestBenchmarkByMetric(selectedSourceRows, 'cpia_cost_floor', unit);
  const latestQuoteForUnit = latestBenchmarkByMetric(selectedSourceRows, 'supplier_quote', unit);
  const ownPurchaseUSD = latestOwnPurchase(ourPrices, 'usd');
  const latestQuoteUSD = latestBenchmarkByMetric(selectedSourceRows, 'supplier_quote', 'usd');
  const strategyRequest = useMemo<PriceForecastStrategyRequest | null>(() => {
    const observations = selectedSourceRows
      .filter((row) => row.price_usd_w != null && Number.isFinite(Number(row.price_usd_w)) && Number(row.price_usd_w) > 0)
      .map((row) => ({
        source_key: row.source_key,
        source_name: row.source_name,
        metric_key: row.metric_key,
        metric_label: row.metric_label,
        value_date: row.value_date,
        market_region: row.market_region,
        basis: row.basis,
        price_usd_w: row.price_usd_w ?? null,
        price_cny_w: row.price_cny_w ?? null,
        price_krw_w: row.price_krw_w ?? null,
        confidence: row.confidence ?? null,
      }));
    if (observations.length === 0) return null;
    return {
      unit: 'usd',
      observations,
      own_purchase_usd_w: ownPurchaseUSD?.value ?? null,
      own_purchase_date: ownPurchaseUSD?.date ?? null,
      own_quote_usd_w: latestQuoteUSD?.price_usd_w ?? null,
      own_quote_date: latestQuoteUSD?.value_date ?? null,
      runs: runs.map((run) => ({
        status: run.status,
        started_at: run.started_at,
        source_keys: parseRunStringArray(run.source_keys),
        warnings: parseRunWarnings(run.warnings),
      })),
    };
  }, [latestQuoteUSD?.price_usd_w, latestQuoteUSD?.value_date, ownPurchaseUSD?.date, ownPurchaseUSD?.value, runs, selectedSourceRows]);

  useEffect(() => {
    let cancelled = false;
    if (!strategyRequest) {
      setForecastStrategy(null);
      setStrategyLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setStrategyLoading(true);
    fetchWithAuth<PriceForecastStrategyResponse>('/api/v1/calc/price-forecast-strategy', {
      method: 'POST',
      body: JSON.stringify(strategyRequest),
    })
      .then((response) => {
        if (!cancelled) setForecastStrategy(response);
      })
      .catch((err) => {
        console.warn('[SolarFlow] 가격전망 Rust 계산 실패:', err);
        if (!cancelled) setForecastStrategy(null);
      })
      .finally(() => {
        if (!cancelled) setStrategyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [strategyRequest]);

  const latestCmmUSD = latestBenchmarkByMetric(selectedSourceRows, 'cmm_fob_china_topcon_600w', 'usd');
  const latestFloorUSD = latestBenchmarkByMetric(selectedSourceRows, 'cpia_cost_floor', 'usd');
  const cmmTrendUSD = latestTwoBenchmarkValues(selectedSourceRows, 'cmm_fob_china_topcon_600w', 'usd');
  const cmmTrendPct = cmmTrendUSD?.previous ? ((cmmTrendUSD.latest - cmmTrendUSD.previous) / cmmTrendUSD.previous) * 100 : null;
  const purchaseVsCmmPct = ownPurchaseUSD && latestCmmUSD && priceValue(latestCmmUSD, 'usd')
    ? ((ownPurchaseUSD.value - priceValue(latestCmmUSD, 'usd')!) / priceValue(latestCmmUSD, 'usd')!) * 100
    : null;
  const cmmVsFloorPct = latestCmmUSD && latestFloorUSD && priceValue(latestCmmUSD, 'usd') && priceValue(latestFloorUSD, 'usd')
    ? ((priceValue(latestCmmUSD, 'usd')! - priceValue(latestFloorUSD, 'usd')!) / priceValue(latestCmmUSD, 'usd')!) * 100
    : null;
  const cmmTrend = directionTone(cmmTrendPct);
  const oneMonthView = cmmTrend === 'up' ? '상승' : cmmTrend === 'down' ? '하락' : '보합';
  const threeMonthView = cmmVsFloorPct != null && cmmVsFloorPct < 4 ? '하방 제한' : oneMonthView;
  const fallbackStrategyLabel = (() => {
    if (!latestCmmUSD) return '관측 보강';
    if (cmmTrend === 'up' && (purchaseVsCmmPct == null || purchaseVsCmmPct <= 2)) return '즉시 협상';
    if (cmmTrend === 'down' && purchaseVsCmmPct != null && purchaseVsCmmPct > 2) return '분할 매입';
    if (cmmVsFloorPct != null && cmmVsFloorPct < 4) return '관망 제한';
    return '조건부 관망';
  })();
  const fallbackStrategyNote = (() => {
    if (!latestCmmUSD) return 'CMM 관측값이 들어오면 판단 정확도가 올라갑니다';
    if (fallbackStrategyLabel === '즉시 협상') return '상승 흐름 대비 현재 계약가를 빠르게 잠그는 쪽이 유리합니다';
    if (fallbackStrategyLabel === '분할 매입') return '시장가 대비 계약가가 높아 단가 확인 후 나눠 잡는 편이 낫습니다';
    if (fallbackStrategyLabel === '관망 제한') return '원가 floor와 가까워 추가 하락 여지가 제한적입니다';
    return '추가 입찰가와 forward 확인 후 계약 시점을 정하는 편이 안정적입니다';
  })();
  const strategyDisplayLabel = forecastStrategy?.action_label ?? fallbackStrategyLabel;
  const strategyDisplayNote = forecastStrategy?.note ?? fallbackStrategyNote;
  const strategyOneMonthView = forecastStrategy?.one_month_view ?? oneMonthView;
  const strategyThreeMonthView = forecastStrategy?.three_month_view ?? threeMonthView;
  const strategySixMonthView = forecastStrategy?.six_month_view ?? '—';
  const strategyBasis = forecastStrategy?.basis.slice(0, 4) ?? [];

  const runLatest = runs[0] ?? null;
  const latestCmm = latestByMetric.get('cmm_fob_china_topcon_600w');
  const latestTender = latestByMetric.get('china_state_tender');
  const forwardCount = filteredRows.filter((row) => row.basis === 'forward').length;
  const sourceCount = new Set(filteredRows.map((row) => row.source_key)).size;
  const hasRunningRun = runs.some((run) => run.status === 'running');
  const visibleBenchmarkIds = useMemo(() => visibleRows.map((row) => row.benchmark_id), [visibleRows]);
  const allVisibleSelected = visibleBenchmarkIds.length > 0
    && visibleBenchmarkIds.every((id) => selectedBenchmarkIds.has(id));

  const downloadCSV = () => {
    const header = ['일자', '소스', '지표', '지역', '조건', '통화', 'USD/W', 'CNY/W', 'KRW/W', '기술', '구간', '근거 URL', '근거'];
    const lines = filteredRows.map((row) => [
      row.value_date,
      row.source_name,
      METRIC_LABELS[row.metric_key] ?? row.metric_label,
      row.market_region,
      row.basis,
      row.currency,
      row.price_usd_w ?? '',
      row.price_cny_w ?? '',
      row.price_krw_w ?? '',
      row.technology ?? '',
      row.quarter_label ?? row.period_label ?? '',
      row.source_url ?? '',
      row.raw_excerpt ?? '',
    ].map(csvCell).join(','));
    const csv = `\uFEFF${header.map(csvCell).join(',')}\n${lines.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price_benchmarks_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toggleBenchmarkSelection = (benchmarkID: string) => {
    setSelectedBenchmarkIds((prev) => {
      const next = new Set(prev);
      if (next.has(benchmarkID)) next.delete(benchmarkID);
      else next.add(benchmarkID);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    setSelectedBenchmarkIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleBenchmarkIds) next.delete(id);
      } else {
        for (const id of visibleBenchmarkIds) next.add(id);
      }
      return next;
    });
  };

  const deleteSelectedBenchmarks = async () => {
    const ids = Array.from(selectedBenchmarkIds);
    if (ids.length === 0) return;

    const ok = await confirmDialog({
      title: '관측값 삭제',
      description: `선택한 가격 관측값 ${ids.length.toLocaleString('ko-KR')}건을 삭제합니다. 삭제 후 차트와 하단 목록에서 제외됩니다.`,
      confirmLabel: '삭제',
      variant: 'destructive',
    });
    if (!ok) return;

    const idSet = new Set(ids);
    setDeleting(true);
    try {
      await Promise.all(ids.map((id) => (
        fetchWithAuth(`/api/v1/price-benchmarks/${encodeURIComponent(id)}`, { method: 'DELETE' })
      )));
      setRows((prev) => prev.filter((row) => !idSet.has(row.benchmark_id)));
      setSelectedBenchmarkIds(new Set());
      notify.success(`${ids.length.toLocaleString('ko-KR')}건 삭제했습니다`);
      await load();
    } catch (err) {
      notify.error(formatError(err));
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const updateBenchmarkReviewStatus = async (ids: string[], status: PriceBenchmarkReviewStatus) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previousRows = rows;
    setReviewing(true);
    setRows((prev) => prev.map((row) => (
      idSet.has(row.benchmark_id) ? { ...row, review_status: status } : row
    )));
    try {
      await Promise.all(ids.map((id) => fetchWithAuth(
        `/api/v1/price-benchmarks/${encodeURIComponent(id)}/review-status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ review_status: status }),
        },
      )));
      setSelectedBenchmarkIds(new Set());
      notify.success(`${ids.length.toLocaleString('ko-KR')}건 ${reviewStatusLabel(status)} 처리했습니다`);
    } catch (err) {
      setRows(previousRows);
      notify.error(formatError(err));
      await load();
    } finally {
      setReviewing(false);
    }
  };

  const triggerAIRefresh = async () => {
    if (hasRunningRun || refreshing) {
      notify.warning('이미 실행 중인 AI 수집이 있습니다');
      return;
    }
    setRefreshing(true);
    try {
      // PR 43: 비동기 — POST 즉시 run_id 받고 폴링 시작
      const result = await fetchWithAuth<PriceBenchmarkAIRefreshResult>('/api/v1/price-benchmarks/ai-refresh', {
        method: 'POST',
        body: JSON.stringify({ source_keys: Array.from(aiSources) }),
      });

      // running 이면 폴링 (3초 간격, 최대 15분)
      if (result.status === 'running' && result.run_id) {
        notify.info('AI 수집 시작 — 진행 상황 추적 중…');
        const pollResult = await pollAIRefreshRun(result.run_id);
        const msg = `AI 수집 ${pollResult.inserted_count.toLocaleString('ko-KR')}건 저장`;
        if (pollResult.status === 'completed') notify.success(msg);
        else if (pollResult.status === 'failed') notify.error(`AI 수집 실패: ${pollResult.error_message ?? '알 수 없음'}`);
        else notify.warning(`${msg} · ${(pollResult.warnings ?? []).slice(0, 1).join('') || '일부 확인 필요'}`);
      } else {
        // 옛 동기 응답 호환 (운영 backend 가 아직 옛 버전)
        const msg = `AI 수집 ${result.inserted_count.toLocaleString('ko-KR')}건 저장`;
        if (result.status === 'completed') notify.success(msg);
        else notify.warning(`${msg} · ${result.warnings.slice(0, 1).join('') || '일부 확인 필요'}`);
      }
      await load();
    } catch (err) {
      notify.error(formatError(err));
    } finally {
      setRefreshing(false);
    }
  };

  // PR 43: run_id 폴링 — status 가 running 이 아닐 때까지 3초마다 GET.
  // 최대 15분 (300번) — 그 이후엔 timeout 으로 실패.
  const pollAIRefreshRun = async (runID: string): Promise<PriceBenchmarkRun> => {
    const POLL_INTERVAL_MS = 3000;
    const MAX_ATTEMPTS = 300; // 15분
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const run = await fetchWithAuth<PriceBenchmarkRun>(`/api/v1/price-benchmarks/runs/${runID}`);
        if (run.status !== 'running') {
          return run;
        }
      } catch {
        // 일시적 fetch 실패는 무시 — 계속 폴링
      }
    }
    throw new Error('AI 수집 시간 초과 (15분)');
  };

  const toggleSource = (key: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add(key);
      return next;
    });
  };

  // toggleAiSource — chip toggle 클릭. 모두 해제는 허용 (버튼이 비활성).
  const toggleAiSource = (key: string) => {
    setAiSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAllAiSources = (selectAll: boolean) => {
    if (selectAll) {
      setAiSources(new Set(AI_SOURCE_OPTIONS.map((source) => source.key)));
    } else {
      setAiSources(new Set());
    }
  };

  const saveSupplierQuote = async () => {
    const supplier = quoteForm.supplier.trim();
    const priceUsdW = Number(quoteForm.priceUsdW);
    if (!supplier) {
      notify.warning('공급사명을 입력해 주세요');
      return;
    }
    if (!quoteForm.valueDate) {
      notify.warning('견적일을 입력해 주세요');
      return;
    }
    if (!Number.isFinite(priceUsdW) || priceUsdW <= 0) {
      notify.warning('USD/W 견적가를 양수로 입력해 주세요');
      return;
    }

    setSavingQuote(true);
    try {
      const created = await fetchWithAuth<PriceBenchmark>('/api/v1/price-benchmarks', {
        method: 'POST',
        body: JSON.stringify({
          source_key: 'our_quote',
          source_name: supplier,
          metric_key: 'supplier_quote',
          metric_label: '공급사 미체결 견적',
          value_date: quoteForm.valueDate,
          period_label: 'quote',
          market_region: quoteForm.marketRegion,
          basis: quoteForm.basis,
          currency: 'USD',
          price_usd_w: priceUsdW,
          technology: quoteForm.technology.trim() || null,
          confidence: 0.86,
          raw_excerpt: `${supplier} 미체결 견적 ${priceUsdW.toFixed(4)} USD/W`,
          notes: quoteForm.notes.trim() || null,
        }),
      });
      setRows((prev) => [created, ...prev.filter((row) => row.benchmark_id !== created.benchmark_id)]);
      setSelectedSources((prev) => new Set(prev).add('our_quote'));
      setQuoteForm((prev) => ({ ...prev, priceUsdW: '', notes: '' }));
      notify.success('미체결 견적을 가격예측에 기록했습니다');
      await load();
    } catch (err) {
      notify.error(formatError(err));
    } finally {
      setSavingQuote(false);
    }
  };

  return (
    <MasterConsole
      eyebrow="PRICE FORECAST"
      title="가격예측"
      description="중국·유럽 외부 벤치마크, 우리 거래가, 구매 전략을 한 화면에서 비교합니다."
      tableTitle="가격 벤치마크"
      tableSub={`${filteredRows.length.toLocaleString('ko-KR')}개 관측값 · 채택 ${reviewCounts.accepted.toLocaleString('ko-KR')}건 · 제외 ${reviewCounts.rejected.toLocaleString('ko-KR')}건`}
      kpiScope="price-forecast"
      actions={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            role="group"
            aria-label="AI 수집 대상 source"
            className="flex flex-wrap items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1"
          >
            <span className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">수집 대상</span>
            {AI_SOURCE_OPTIONS.map((source) => {
              const active = aiSources.has(source.key);
              return (
                <button
                  key={source.key}
                  type="button"
                  onClick={() => toggleAiSource(source.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                    active
                      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]'
                      : 'border-[var(--line)] bg-transparent text-[var(--ink-3)] hover:border-[var(--ink-3)]'
                  }`}
                >
                  {source.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setAllAiSources(aiSources.size !== SOURCE_OPTIONS.length)}
              className="ml-1 text-[10px] text-[var(--ink-4)] underline-offset-2 hover:underline"
            >
              {aiSources.size === AI_SOURCE_OPTIONS.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button size="sm" onClick={() => void triggerAIRefresh()} disabled={refreshing || hasRunningRun || aiSources.size === 0}>
            <Bot className={`h-3.5 w-3.5 ${refreshing || hasRunningRun ? 'animate-pulse' : ''}`} />
            {hasRunningRun ? 'AI 수집 중' : 'AI 지표 갱신'}
          </Button>
        </div>
      )}
      metrics={[
        {
          label: 'CMM',
          value: formatUnitPrice(latestCmm ? priceValue(latestCmm, unit) : null, unit),
          sub: latestCmm ? formatDate(latestCmm.value_date) : '관측값 없음',
          tone: latestCmm ? 'solar' : 'ink',
        },
        {
          label: 'Forward',
          value: forwardCount.toLocaleString('ko-KR'),
          unit: '점',
          sub: 'Q+1~Q+4',
          tone: 'info',
        },
        {
          label: '입찰가',
          value: formatUnitPrice(latestTender ? priceValue(latestTender, unit) : null, unit),
          sub: latestTender ? latestTender.source_name : '중국 국영',
          tone: latestTender ? 'warn' : 'ink',
        },
        {
          label: '최근 수집',
          value: runLatest ? statusLabel(runLatest.status) : '—',
          sub: runLatest ? `${formatDate(runLatest.started_at)} · ${runLatest.inserted_count}건` : '수집 로그 없음',
          tone: runLatest?.status === 'failed' ? 'warn' : 'pos',
        },
      ]}
      toolbar={(
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[220px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-4)]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="지표·지역 검색"
              className="h-7 pl-7 text-xs"
            />
          </div>
          <Select value={unit} onValueChange={(value) => setUnit(value as UnitKey)}>
            <SelectTrigger size="sm" className="w-[96px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((item) => (
                <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={reviewFilter} onValueChange={(value) => setReviewFilter(value as ReviewFilterKey)}>
            <SelectTrigger size="sm" className="w-[112px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_FILTER_OPTIONS.map((item) => (
                <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={horizon} onValueChange={(value) => setHorizon(value as HorizonKey)}>
            <SelectTrigger size="sm" className="w-[92px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZON_OPTIONS.map((item) => (
                <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={basisFilter} onValueChange={(value) => setBasisFilter(value ?? ALL_FILTER)}>
            <SelectTrigger size="sm" className="w-[104px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>조건 전체</SelectItem>
              {filterOptions.basis.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={regionFilter} onValueChange={(value) => setRegionFilter(value ?? ALL_FILTER)}>
            <SelectTrigger size="sm" className="w-[128px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>지역 전체</SelectItem>
              {filterOptions.regions.map((item) => (
                <SelectItem key={item} value={item}>{item.replaceAll('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={technologyFilter} onValueChange={(value) => setTechnologyFilter(value ?? ALL_FILTER)}>
            <SelectTrigger size="sm" className="w-[136px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>기술 전체</SelectItem>
              {filterOptions.technologies.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={quarterFilter} onValueChange={(value) => setQuarterFilter(value ?? ALL_FILTER)}>
            <SelectTrigger size="sm" className="w-[104px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>기간 전체</SelectItem>
              {filterOptions.quarters.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={downloadCSV} disabled={filteredRows.length === 0}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          {selectedBenchmarkIds.size > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {selectedBenchmarkIds.size.toLocaleString('ko-KR')}건 선택
            </Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={reviewing || refreshing || selectedBenchmarkIds.size === 0}
            onClick={() => void updateBenchmarkReviewStatus(Array.from(selectedBenchmarkIds), 'accepted')}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            채택
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={reviewing || refreshing || selectedBenchmarkIds.size === 0}
            onClick={() => void updateBenchmarkReviewStatus(Array.from(selectedBenchmarkIds), 'rejected')}
          >
            <XCircle className="h-3.5 w-3.5" />
            제외
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting || reviewing || refreshing || selectedBenchmarkIds.size === 0}
            onClick={() => void deleteSelectedBenchmarks()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </Button>
        </div>
      )}
    >
      <div className="space-y-4 p-3">
        <section className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <div className="sf-eyebrow">외부 벤치마크</div>
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {formatUnitPrice(latestCmmForUnit ? priceValue(latestCmmForUnit, unit) : null, unit)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {latestCmmForUnit ? `CMM · ${formatDate(latestCmmForUnit.value_date)}` : 'CMM 관측값 없음'}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded border border-[var(--line)] px-2 py-1">
                <div className="text-muted-foreground">입찰가</div>
                <div className="font-semibold tabular-nums">
                  {formatUnitPrice(latestTenderForUnit ? priceValue(latestTenderForUnit, unit) : null, unit)}
                </div>
              </div>
              <div className="rounded border border-[var(--line)] px-2 py-1">
                <div className="text-muted-foreground">Floor</div>
                <div className="font-semibold tabular-nums">
                  {formatUnitPrice(latestFloorForUnit ? priceValue(latestFloorForUnit, unit) : null, unit)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <div className="sf-eyebrow">우리 거래가</div>
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {formatUnitPrice(ownPurchase?.value ?? null, unit)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {ownPurchase ? `구매계약 ${ownPurchase.count}건 · ${formatDate(ownPurchase.date)}` : unit === 'cny' ? 'CNY 환산 미지원' : '구매계약 평균 없음'}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[var(--line)] px-2 py-1 text-[11px]">
              <span className="text-muted-foreground">평균 판매가</span>
              <span className="font-semibold tabular-nums">{formatUnitPrice(ownSale?.value ?? null, unit)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[var(--line)] px-2 py-1 text-[11px]">
              <span className="text-muted-foreground">최근 견적</span>
              <span className="font-semibold tabular-nums">{formatUnitPrice(latestQuoteForUnit ? priceValue(latestQuoteForUnit, unit) : null, unit)}</span>
            </div>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <div className="sf-eyebrow">예측 · 전략</div>
              <Badge variant={forecastStrategy ? 'default' : 'outline'} className="ml-auto text-[10px]">
                {strategyLoading ? 'Rust 계산중' : forecastStrategy ? 'Rust' : '화면 계산'}
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-lg font-semibold ${strategyToneClass(forecastStrategy?.tone)}`}>{strategyDisplayLabel}</span>
              <span className="text-xs text-muted-foreground">
                1개월 {strategyOneMonthView} · 3개월 {strategyThreeMonthView} · 6개월 {strategySixMonthView}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{strategyDisplayNote}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {strategyBasis.length > 0 ? strategyBasis.map((item) => (
                <Badge key={item} variant="outline" className="text-[10px]">{item}</Badge>
              )) : (
                <Badge variant="outline" className="text-[10px]">근거 대기</Badge>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <FilePlus2 className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <div className="sf-eyebrow">미체결 견적 기록</div>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(120px,0.8fr)_140px_120px_130px_110px_minmax(120px,0.8fr)_auto]">
              <Input
                value={quoteForm.supplier}
                onChange={(event) => setQuoteForm((prev) => ({ ...prev, supplier: event.target.value }))}
                placeholder="공급사"
                className="h-8 text-xs"
              />
              <Input
                type="date"
                value={quoteForm.valueDate}
                onChange={(event) => setQuoteForm((prev) => ({ ...prev, valueDate: event.target.value }))}
                className="h-8 text-xs"
              />
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={quoteForm.priceUsdW}
                onChange={(event) => setQuoteForm((prev) => ({ ...prev, priceUsdW: event.target.value }))}
                placeholder="USD/W"
                className="h-8 text-xs"
              />
              <Select
                value={quoteForm.marketRegion}
                onValueChange={(value) => setQuoteForm((prev) => ({ ...prev, marketRegion: value as QuoteFormState['marketRegion'] }))}
              >
                <SelectTrigger size="sm" className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fob_china">FOB China</SelectItem>
                  <SelectItem value="china_export">China Export</SelectItem>
                  <SelectItem value="ddp_europe">DDP Europe</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={quoteForm.basis}
                onValueChange={(value) => setQuoteForm((prev) => ({ ...prev, basis: value as QuoteFormState['basis'] }))}
              >
                <SelectTrigger size="sm" className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="fob">FOB</SelectItem>
                  <SelectItem value="ddp">DDP</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={quoteForm.technology}
                onChange={(event) => setQuoteForm((prev) => ({ ...prev, technology: event.target.value }))}
                placeholder="기술"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={savingQuote}
                onClick={() => void saveSupplierQuote()}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                기록
              </Button>
            </div>
            <Input
              value={quoteForm.notes}
              onChange={(event) => setQuoteForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="메모"
              className="mt-2 h-8 text-xs"
            />
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="sf-eyebrow">최근 견적</div>
              <Badge variant="outline" className="text-[10px]">
                {latestQuoteForUnit ? formatDate(latestQuoteForUnit.value_date) : '대기'}
              </Badge>
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {formatUnitPrice(latestQuoteForUnit ? priceValue(latestQuoteForUnit, unit) : null, unit)}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {latestQuoteForUnit ? latestQuoteForUnit.source_name : '견적 기록 없음'}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[var(--line)] px-2 py-1 text-[11px]">
              <span className="text-muted-foreground">CMM 대비</span>
              <span className="font-semibold tabular-nums">{formatPercent(forecastStrategy?.market.quote_vs_cmm_pct)}</span>
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="sf-eyebrow">Rust 전망 시나리오</div>
                <div className="text-[11px] text-muted-foreground">USD/W 기준 · 1/3/6개월 범위</div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                신뢰 {formatConfidence(forecastStrategy?.confidence_score)}
              </Badge>
            </div>
            <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span>CMM 추세 {formatPercent(forecastStrategy?.market.cmm_trend_pct)}</span>
              <span>구매가 대비 {formatPercent(forecastStrategy?.market.purchase_vs_cmm_pct)}</span>
              <span>견적 대비 {formatPercent(forecastStrategy?.market.quote_vs_cmm_pct)}</span>
              <span>Floor gap {formatPercent(forecastStrategy?.market.cmm_vs_floor_pct)}</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {(forecastStrategy?.scenarios ?? []).map((scenario) => (
                <div key={scenario.key} className="grid gap-2 py-2 text-xs md:grid-cols-[72px_minmax(0,1fr)_minmax(120px,0.6fr)] md:items-center">
                  <div className="font-semibold text-[var(--ink)]">{scenario.label}</div>
                  <div>
                    <div className="font-semibold tabular-nums">{formatScenarioRange(scenario)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Base {formatUnitPrice(scenario.base_usd_w, 'usd')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {scenario.drivers.slice(0, 2).map((driver) => (
                      <Badge key={driver} variant="outline" className="text-[10px]">{driver}</Badge>
                    ))}
                  </div>
                </div>
              ))}
              {!forecastStrategy ? (
                <div className="py-5 text-center text-sm text-muted-foreground">
                  {strategyLoading ? 'Rust 계산 결과를 불러오는 중입니다' : '전망 계산에 필요한 관측값을 기다립니다'}
                </div>
              ) : null}
            </div>
            <div className="mt-2 grid gap-2 border-t border-[var(--line)] pt-2 text-[11px] text-muted-foreground md:grid-cols-3">
              <span>백테스트 {forecastStrategy?.backtest ? `${forecastStrategy.backtest.sample_count}건` : '대기'}</span>
              <span>방향 적중 {forecastStrategy?.backtest?.direction_hit_rate != null ? `${Math.round(forecastStrategy.backtest.direction_hit_rate * 100)}%` : '—'}</span>
              <span>평균 오차 {formatAbsPercent(forecastStrategy?.backtest?.mean_abs_error_pct)}</span>
            </div>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="sf-eyebrow">데이터 품질</div>
                <div className="text-[11px] text-muted-foreground">최근성·신뢰도·수집 경고 점수</div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                이상치 {(forecastStrategy?.outliers?.length ?? 0).toLocaleString('ko-KR')}건
              </Badge>
            </div>
            <div className="space-y-2">
              {(forecastStrategy?.source_quality ?? []).slice(0, 6).map((item) => (
                <div key={item.source_key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-[var(--line)] pb-2 text-xs last:border-b-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[var(--ink)]">{item.source_name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.latest_date ? formatDate(item.latest_date) : '최근일 없음'} · {item.observation_count}건 · {item.note}
                      {(item.outlier_count ?? 0) > 0 ? ` · 이상치 ${item.outlier_count}건` : ''}
                      {(item.backtest_score_delta ?? 0) !== 0 ? ` · 보정 ${(item.backtest_score_delta ?? 0) > 0 ? '+' : ''}${(item.backtest_score_delta ?? 0).toFixed(1)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold tabular-nums">{Math.round(item.score)}</span>
                    <Badge variant={qualityVariant(item.status)} className="text-[10px]">{qualityLabel(item.status)}</Badge>
                  </div>
                </div>
              ))}
              {!forecastStrategy ? (
                <div className="py-5 text-center text-sm text-muted-foreground">
                  품질 점수 계산 대기
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-h-[380px] rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="sf-eyebrow">차트 프리셋</div>
                <div className="text-[11px] text-muted-foreground">
                  {CHART_PRESETS.find((item) => item.key === chartPreset)?.label}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {CHART_PRESETS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.key}
                      type="button"
                      variant={chartPreset === item.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setChartPreset(item.key);
                        setSelectedSeriesKey(null);
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            </div>
            {chartData.length === 0 || series.length === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <TrendingUp className="h-8 w-8 text-[var(--ink-4)]" />
                <div>표시할 가격 관측값이 없습니다</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={310}>
                <LineChart data={chartData} margin={{ top: 12, right: 18, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={58}
                    domain={['auto', 'auto']}
                    tickFormatter={(value: number) => (
                      unit === 'krw' ? `${Math.round(value)}` : value.toFixed(3)
                    )}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatUnitPrice(Number(value), unit),
                      series.find((item) => item.key === name)?.label ?? String(name),
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                  {unit === 'usd' ? <ReferenceLine y={0.1} stroke="#78716c" strokeDasharray="4 4" /> : null}
                  {series.map((item, index) => {
                    const isOur = item.sourceKey === 'our';
                    const isOurQuote = item.sourceKey === 'our_quote';
                    const ourColor = isOurQuote ? '#f97316' : item.key === 'our_purchase' ? '#0ea5e9' : '#16a34a';
                    const isSelected = selectedSeries?.key === item.key;
                    return (
                      <Line
                        key={item.key}
                        type="monotone"
                        dataKey={item.key}
                        name={item.label}
                        stroke={isOur || isOurQuote ? ourColor : LINE_COLORS[index % LINE_COLORS.length]}
                        strokeWidth={isSelected ? 3 : isOur || isOurQuote ? 2.6 : 1.8}
                        opacity={selectedSeries && !isSelected ? 0.45 : 1}
                        dot={{ r: isOur || isOurQuote ? 3 : 2 }}
                        activeDot={{ r: isOur || isOurQuote ? 5 : 4 }}
                        connectNulls
                        isAnimationActive
                        animationDuration={360}
                        animationEasing="ease-out"
                        onClick={() => setSelectedSeriesKey(item.key)}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <aside className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="sf-eyebrow">표시 필터</div>
              <Badge variant="outline" className="text-[10px]">{sourceCount}개 표시</Badge>
            </div>
            <div className="mb-2 text-[10px] leading-4 text-[var(--ink-4)]">
              차트·표에 보이는 source. AI 수집 대상은 상단 chip 으로 따로 선택합니다.
            </div>
            <div ref={sourceListParent} className="sf-motion-list space-y-2">
              {SOURCE_OPTIONS.map((source) => (
                <label
                  key={source.key}
                  className="flex cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-2 py-2 text-xs transition-[border-color,background,box-shadow] duration-150"
                  data-selected={selectedSources.has(source.key)}
                >
                  <Checkbox
                    checked={selectedSources.has(source.key)}
                    onCheckedChange={() => toggleSource(source.key)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[var(--ink)]">{source.label}</span>
                    <span className="block truncate text-[11px] text-[var(--ink-3)]">{source.sub}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 border-t border-[var(--line)] pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="sf-eyebrow">선택 라인</div>
                {selectedSeriesInsight ? (
                  <Badge variant="outline" className="text-[10px]">
                    {formatDate(selectedSeriesInsight.latestDate)}
                  </Badge>
                ) : null}
              </div>
              {selectedSeries && selectedSeriesInsight ? (
                <div className="space-y-2 text-xs">
                  <div className="font-semibold leading-5 text-[var(--ink)]">{selectedSeries.label}</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">최근값</span>
                    <span className="font-semibold tabular-nums">{formatUnitPrice(selectedSeriesInsight.latestValue, unit)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">직전 대비</span>
                    <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
                      {directionTone(selectedSeriesInsight.deltaPct) === 'up' ? <ArrowUpRight className="h-3 w-3 text-red-600" /> : null}
                      {directionTone(selectedSeriesInsight.deltaPct) === 'down' ? <ArrowDownRight className="h-3 w-3 text-blue-600" /> : null}
                      {directionTone(selectedSeriesInsight.deltaPct) === 'flat' ? <Minus className="h-3 w-3 text-muted-foreground" /> : null}
                      {formatDeltaPct(selectedSeriesInsight.deltaPct)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {selectedSeries.sourceKey === 'our'
                      ? '내부 거래 평균'
                      : selectedSeries.sourceKey === 'our_quote'
                        ? '미체결 공급사 견적'
                        : `${selectedSeries.marketRegion.replaceAll('_', ' ')} · ${selectedSeries.basis}`}
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-muted-foreground">라인 없음</div>
              )}
            </div>
          </aside>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
            <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
              <div>
                <div className="sf-eyebrow">가격 관측값</div>
                <div className="text-[11px] text-muted-foreground">
                  {selectedBenchmarkIds.size > 0
                    ? `${selectedBenchmarkIds.size.toLocaleString('ko-KR')}건 선택됨`
                    : `${visibleRows.length.toLocaleString('ko-KR')}건`}
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="ml-auto"
                disabled={deleting || reviewing || refreshing || selectedBenchmarkIds.size === 0}
                onClick={() => void deleteSelectedBenchmarks()}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleting ? '삭제 중' : '선택 삭제'}
              </Button>
            </div>
            <BenchmarkVirtualTable
              visibleRows={visibleRows}
              selectedBenchmarkIds={selectedBenchmarkIds}
              visibleBenchmarkIds={visibleBenchmarkIds}
              allVisibleSelected={allVisibleSelected}
              deleting={deleting}
              reviewing={reviewing}
              unit={unit}
              toggleVisibleSelection={toggleVisibleSelection}
              toggleBenchmarkSelection={toggleBenchmarkSelection}
              onReviewStatusChange={(ids, status) => void updateBenchmarkReviewStatus(ids, status)}
              onSelectSeries={setSelectedSeriesKey}
            />
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <div className="sf-eyebrow">AI 수집 로그</div>
            </div>
            <div ref={runLogParent} className="sf-motion-list space-y-2">
              {runs.map((run) => {
                const health = runSourceHealth(run);
                const warningCount = parseRunWarnings(run.warnings).length;
                return (
                  <div key={run.run_id} className="rounded border border-[var(--line)] px-2.5 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(run.status)} className="text-[10px]">
                        {statusLabel(run.status)}
                      </Badge>
                      <span className="font-semibold tabular-nums">{formatDate(run.started_at)}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{run.provider ?? 'ai'} · {run.model ?? 'model'}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{run.inserted_count.toLocaleString('ko-KR')}건 저장 · {run.skipped_count.toLocaleString('ko-KR')}건 제외</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {health.slice(0, 5).map((item) => (
                        <Badge key={item.key} variant={runHealthVariant(item.status)} className="text-[10px]">
                          {item.label} · {runHealthLabel(item.status)}
                        </Badge>
                      ))}
                      {health.length > 5 ? (
                        <Badge variant="outline" className="text-[10px]">+{health.length - 5}</Badge>
                      ) : null}
                    </div>
                    {warningCount > 0 ? (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        <span>warning {warningCount.toLocaleString('ko-KR')}건</span>
                      </div>
                    ) : null}
                    {run.error_message ? (
                      <div className="mt-1 text-[11px] text-destructive">{run.error_message}</div>
                    ) : null}
                  </div>
                );
              })}
              {runs.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">수집 로그가 없습니다</div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </MasterConsole>
  );
}

/**
 * 가상 스크롤 벤치마크 관측값 테이블 — 3000건까지 스크롤 부드럽게.
 * tbody 의 padding spacer 패턴 (보이는 row 위/아래 빈 tr 로 공간 확보, 보이는
 * row 만 실제 렌더). table layout 변경 없이 col 정렬 보존.
 */
function BenchmarkVirtualTable({
  visibleRows,
  selectedBenchmarkIds,
  visibleBenchmarkIds,
  allVisibleSelected,
  deleting,
  reviewing,
  unit,
  toggleVisibleSelection,
  toggleBenchmarkSelection,
  onReviewStatusChange,
  onSelectSeries,
}: {
  visibleRows: PriceBenchmark[];
  selectedBenchmarkIds: Set<string>;
  visibleBenchmarkIds: string[];
  allVisibleSelected: boolean;
  deleting: boolean;
  reviewing: boolean;
  unit: UnitKey;
  toggleVisibleSelection: (next?: boolean) => void;
  toggleBenchmarkSelection: (id: string) => void;
  onReviewStatusChange: (ids: string[], status: PriceBenchmarkReviewStatus) => void;
  onSelectSeries: (seriesKey: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
    getItemKey: (index) => visibleRows[index]?.benchmark_id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]!.start : 0;
  const paddingBottom = virtualItems.length > 0
    ? totalSize - virtualItems[virtualItems.length - 1]!.end
    : 0;

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ maxHeight: 'min(60vh, 720px)', contain: 'content' }}
    >
      <Table className="sf-motion-table">
        <TableHeader className="sticky top-0 z-10 bg-[var(--surface)]">
          <TableRow>
            <TableHead className="w-9">
              <Checkbox
                aria-label="현재 목록 전체 선택"
                checked={allVisibleSelected}
                disabled={visibleBenchmarkIds.length === 0 || deleting}
                onCheckedChange={toggleVisibleSelection}
              />
            </TableHead>
            <TableHead>일자</TableHead>
            <TableHead>소스</TableHead>
            <TableHead>지표</TableHead>
            <TableHead>지역·조건</TableHead>
            <TableHead className="text-right">가격</TableHead>
            <TableHead>신뢰도</TableHead>
            <TableHead>채택</TableHead>
            <TableHead>근거</TableHead>
            <TableHead className="w-[132px] text-right">처리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                관측값이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            <>
              {paddingTop > 0 ? (
                <tr aria-hidden style={{ height: paddingTop }}>
                  <td colSpan={10} />
                </tr>
              ) : null}
              {virtualItems.map((vRow) => {
                const row = visibleRows[vRow.index];
                if (!row) return null;
                const status = benchmarkReviewStatus(row);
                return (
                  <TableRow
                    key={vRow.key}
                    data-index={vRow.index}
                    data-active={selectedBenchmarkIds.has(row.benchmark_id) ? 'true' : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectSeries(seriesKey(row))}
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`${row.source_name} ${row.metric_label} 선택`}
                        checked={selectedBenchmarkIds.has(row.benchmark_id)}
                        disabled={deleting}
                        onCheckedChange={() => toggleBenchmarkSelection(row.benchmark_id)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">{formatDate(row.value_date)}</TableCell>
                    <TableCell className="text-xs font-medium">{row.source_name}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{METRIC_LABELS[row.metric_key] ?? row.metric_label}</div>
                      <div className="text-[11px] text-muted-foreground">{row.period_label ?? row.quarter_label ?? row.basis}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{row.market_region.replaceAll('_', ' ')}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[row.technology, row.project_segment, row.cargo_min_mw && row.cargo_max_mw ? `${row.cargo_min_mw}-${row.cargo_max_mw}MW` : null].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums">
                      {formatUnitPrice(priceValue(row, unit), unit)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={row.confidence != null && row.confidence < 0.7 ? 'destructive' : 'outline'} className="text-[10px]">
                        {formatConfidence(row.confidence)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={reviewStatusVariant(status)} className="text-[10px]">
                        {reviewStatusLabel(status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                      {row.source_url ? (
                        <a href={row.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          {row.raw_excerpt ? row.raw_excerpt.slice(0, 70) : '원문'}
                        </a>
                      ) : (
                        row.raw_excerpt?.slice(0, 70) ?? '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {status !== 'accepted' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={reviewing || deleting}
                            onClick={() => onReviewStatusChange([row.benchmark_id], 'accepted')}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            채택
                          </Button>
                        ) : null}
                        {status !== 'rejected' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={reviewing || deleting}
                            onClick={() => onReviewStatusChange([row.benchmark_id], 'rejected')}
                          >
                            <XCircle className="h-3 w-3" />
                            제외
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={reviewing || deleting}
                            onClick={() => onReviewStatusChange([row.benchmark_id], 'candidate')}
                          >
                            <RotateCcw className="h-3 w-3" />
                            후보
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden style={{ height: paddingBottom }}>
                  <td colSpan={10} />
                </tr>
              ) : null}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
