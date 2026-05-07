import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Bot, CalendarClock, CheckCircle2, RefreshCw, Search, TrendingUp } from 'lucide-react';
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
import type {
  PriceBenchmark,
  PriceBenchmarkAIRefreshResult,
  PriceBenchmarkRun,
} from '@/types/priceBenchmark';

const SOURCE_OPTIONS = [
  { key: 'opis', label: 'OPIS', sub: 'CMM · Forward · DDP' },
  { key: 'infolink', label: 'InfoLink', sub: '모듈·셀·웨이퍼' },
  { key: 'trendforce', label: 'TrendForce', sub: '주간가·입찰' },
  { key: 'pvinsights', label: 'PVinsights', sub: '일일 보조' },
  { key: 'china_tender', label: '중국 입찰', sub: '국영 GW급' },
  { key: 'cpia_floor', label: 'CPIA', sub: '원가 floor' },
  { key: 'tier1_asp', label: 'Tier-1 ASP', sub: '분기 실적' },
];

const METRIC_LABELS: Record<string, string> = {
  cmm_fob_china_topcon_600w: 'CMM FOB China TOPCon',
  forward_q1: 'Forward Q+1',
  forward_q2: 'Forward Q+2',
  forward_q3: 'Forward Q+3',
  forward_q4: 'Forward Q+4',
  ddp_us: 'DDP US',
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
  manufacturer_asp: 'Tier-1 ASP',
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

interface SeriesDef {
  key: string;
  label: string;
  sourceKey: string;
  metricKey: string;
  latestDate: string;
  latestValue: number;
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

export default function PriceForecastPage() {
  const [rows, setRows] = useState<PriceBenchmark[]>([]);
  const [runs, setRuns] = useState<PriceBenchmarkRun[]>([]);
  const [ourPrices, setOurPrices] = useState<OurPricesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [unit, setUnit] = useState<UnitKey>('usd');
  const [horizon, setHorizon] = useState<HorizonKey>('18m');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    () => new Set(SOURCE_OPTIONS.map((source) => source.key)),
  );

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
      if (priceValue(row, unit) == null) return false;
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
  }, [query, rows, selectedSources, unit]);

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
          latestDate: saleLatestDate,
          latestValue: saleLatestValue,
        });
      }
    }

    // 우리 시리즈는 항상 상위 표시 + 그 외 외부 시리즈는 latest 기준 10개
    const allDefs = Array.from(defs.values());
    const ourDefs = allDefs.filter((d) => d.sourceKey === 'our');
    const externalDefs = allDefs
      .filter((d) => d.sourceKey !== 'our')
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate))
      .slice(0, 10);
    return {
      chartData: Array.from(pointByDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
      series: [...ourDefs, ...externalDefs],
    };
  }, [filteredRows, unit, ourPrices]);

  const latestByMetric = useMemo(() => {
    const latest = new Map<string, PriceBenchmark>();
    for (const row of filteredRows) {
      const key = row.metric_key;
      const prev = latest.get(key);
      if (!prev || row.value_date > prev.value_date) latest.set(key, row);
    }
    return latest;
  }, [filteredRows]);

  const runLatest = runs[0] ?? null;
  const latestCmm = latestByMetric.get('cmm_fob_china_topcon_600w');
  const latestTender = latestByMetric.get('china_state_tender');
  const forwardCount = filteredRows.filter((row) => row.basis === 'forward').length;
  const sourceCount = new Set(filteredRows.map((row) => row.source_key)).size;

  const triggerAIRefresh = async () => {
    setRefreshing(true);
    try {
      // PR 43: 비동기 — POST 즉시 run_id 받고 폴링 시작
      const result = await fetchWithAuth<PriceBenchmarkAIRefreshResult>('/api/v1/price-benchmarks/ai-refresh', {
        method: 'POST',
        body: JSON.stringify({ source_keys: Array.from(selectedSources) }),
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
      } catch (err) {
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

  return (
    <MasterConsole
      eyebrow="PRICE FORECAST"
      title="가격예측"
      description="외부 시세·입찰·원가 floor·제조사 ASP를 같은 시계열로 비교합니다."
      tableTitle="가격 벤치마크"
      tableSub={`${filteredRows.length.toLocaleString('ko-KR')}개 관측값 · ${series.length.toLocaleString('ko-KR')}개 라인`}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button size="sm" onClick={() => void triggerAIRefresh()} disabled={refreshing || selectedSources.size === 0}>
            <Bot className={`h-3.5 w-3.5 ${refreshing ? 'animate-pulse' : ''}`} />
            AI 지표 갱신
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
        </div>
      )}
    >
      <div className="space-y-4 p-3">
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-h-[380px] rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            {chartData.length === 0 || series.length === 0 ? (
              <div className="flex h-[340px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <TrendingUp className="h-8 w-8 text-[var(--ink-4)]" />
                <div>표시할 가격 관측값이 없습니다</div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
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
                    const ourColor = item.key === 'our_purchase' ? '#0ea5e9' : '#16a34a';
                    return (
                      <Line
                        key={item.key}
                        type="monotone"
                        dataKey={item.key}
                        name={item.label}
                        stroke={isOur ? ourColor : LINE_COLORS[index % LINE_COLORS.length]}
                        strokeWidth={isOur ? 2.6 : 1.8}
                        dot={{ r: isOur ? 3 : 2 }}
                        activeDot={{ r: isOur ? 5 : 4 }}
                        connectNulls
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <aside className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="sf-eyebrow">수집 소스</div>
              <Badge variant="outline" className="text-[10px]">{sourceCount}개 표시</Badge>
            </div>
            <div className="space-y-2">
              {SOURCE_OPTIONS.map((source) => (
                <label
                  key={source.key}
                  className="flex cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-2 py-2 text-xs"
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
          </aside>
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일자</TableHead>
                  <TableHead>소스</TableHead>
                  <TableHead>지표</TableHead>
                  <TableHead>지역·조건</TableHead>
                  <TableHead className="text-right">가격</TableHead>
                  <TableHead>근거</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.slice(0, 18).map((row) => (
                  <TableRow key={row.benchmark_id}>
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
                    <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                      {row.source_url ? (
                        <a href={row.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          {row.raw_excerpt ? row.raw_excerpt.slice(0, 70) : '원문'}
                        </a>
                      ) : (
                        row.raw_excerpt?.slice(0, 70) ?? '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      관측값이 없습니다
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-[var(--ink-3)]" />
              <div className="sf-eyebrow">AI 수집 로그</div>
            </div>
            <div className="space-y-2">
              {runs.map((run) => (
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
                  {run.error_message ? (
                    <div className="mt-1 text-[11px] text-destructive">{run.error_message}</div>
                  ) : null}
                </div>
              ))}
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
