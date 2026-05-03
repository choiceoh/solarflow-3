import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReceiptText, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import DataTable, { type Column } from '@/components/common/DataTable';
import { fetchWithAuth } from '@/lib/api';
import { formatCapacity, formatDate, formatKRW, formatNumber, formatUSD, moduleLabel } from '@/lib/utils';
import type { BaroPurchaseHistoryItem, BaroPurchaseInboundType, BaroPurchaseStatus } from '@/types/baro-purchase-history';
import {
  BARO_PURCHASE_INBOUND_LABEL,
  BARO_PURCHASE_STATUS_LABEL,
} from '@/types/baro-purchase-history';

type InboundFilter = '__all__' | BaroPurchaseInboundType;
type CostFilter = 'all' | 'krw' | 'usd' | 'missing';

const statusVariant: Record<BaroPurchaseStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  scheduled: 'secondary',
  shipping: 'default',
  arrived: 'default',
  customs: 'secondary',
  completed: 'outline',
  erp_done: 'outline',
};

function formatKrwWp(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원/Wp`;
}

function formatUsdWp(value?: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}/Wp`;
}

function hasCost(row: BaroPurchaseHistoryItem): boolean {
  return row.unit_price_krw_wp != null || row.unit_price_usd_wp != null || row.estimated_amount_krw != null || row.estimated_amount_usd != null;
}

function matchesSearch(row: BaroPurchaseHistoryItem, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = [
    row.bl_number,
    row.po_number,
    row.source_name,
    row.manufacturer_name,
    row.product_code,
    row.product_name,
    row.spec_wp ? `${row.spec_wp}w` : '',
    row.warehouse_name,
    BARO_PURCHASE_INBOUND_LABEL[row.inbound_type],
    BARO_PURCHASE_STATUS_LABEL[row.status],
  ].join(' ').toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export default function BaroPurchaseHistoryPage() {
  const [rows, setRows] = useState<BaroPurchaseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inboundFilter, setInboundFilter] = useState<InboundFilter>('__all__');
  const [costFilter, setCostFilter] = useState<CostFilter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '1000' });
      if (inboundFilter !== '__all__') params.set('inbound_type', inboundFilter);
      const list = await fetchWithAuth<BaroPurchaseHistoryItem[]>(
        `/api/v1/baro/purchase-history?${params.toString()}`,
      );
      setRows(list);
    } catch (e) {
      console.error('[BARO 구매이력 로드 실패]', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [inboundFilter]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!matchesSearch(row, query)) return false;
      if (costFilter === 'krw') return row.unit_price_krw_wp != null || row.estimated_amount_krw != null;
      if (costFilter === 'usd') return row.unit_price_usd_wp != null || row.estimated_amount_usd != null;
      if (costFilter === 'missing') return !hasCost(row);
      return true;
    });
  }, [rows, query, costFilter]);

  const summary = useMemo(() => {
    const totalQty = filteredRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalKw = filteredRows.reduce((sum, row) => sum + row.capacity_kw, 0);
    const krwRows = filteredRows.filter((row) => row.unit_price_krw_wp != null && row.capacity_kw > 0);
    const usdRows = filteredRows.filter((row) => row.unit_price_usd_wp != null && row.capacity_kw > 0);
    const weightedKrw = krwRows.reduce((sum, row) => sum + Number(row.unit_price_krw_wp) * row.capacity_kw, 0);
    const weightedKw = krwRows.reduce((sum, row) => sum + row.capacity_kw, 0);
    const weightedUsd = usdRows.reduce((sum, row) => sum + Number(row.unit_price_usd_wp) * row.capacity_kw, 0);
    const weightedUsdKw = usdRows.reduce((sum, row) => sum + row.capacity_kw, 0);
    const totalKrw = filteredRows.reduce((sum, row) => sum + (row.estimated_amount_krw ?? 0), 0);
    const totalUsd = filteredRows.reduce((sum, row) => sum + (row.estimated_amount_usd ?? 0), 0);
    return {
      totalQty,
      totalKw,
      avgKrwWp: weightedKw > 0 ? weightedKrw / weightedKw : null,
      avgUsdWp: weightedUsdKw > 0 ? weightedUsd / weightedUsdKw : null,
      totalKrw,
      totalUsd,
      costCovered: filteredRows.filter(hasCost).length,
    };
  }, [filteredRows]);

  const columns: Column<BaroPurchaseHistoryItem>[] = [
    {
      key: 'purchase_date',
      label: '매입일',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium tabular-nums">{formatDate(row.purchase_date ?? row.actual_arrival ?? row.eta ?? '')}</span>
          <Badge variant={statusVariant[row.status]} className="mt-1 w-fit text-[11px]">
            {BARO_PURCHASE_STATUS_LABEL[row.status]}
          </Badge>
        </span>
      ),
    },
    {
      key: 'product_code',
      label: '품목',
      sortable: true,
      render: (row) => (
        <span className="flex min-w-[230px] flex-col">
          <span className="font-medium">
            {moduleLabel(row.manufacturer_name, row.spec_wp)}
            {row.product_code ? <span className="ml-1 text-xs text-muted-foreground">{row.product_code}</span> : null}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {row.product_name ?? '—'}
            {row.module_width_mm && row.module_height_mm
              ? ` · ${row.module_width_mm}x${row.module_height_mm}mm`
              : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'source_name',
      label: '매입처',
      sortable: true,
      render: (row) => (
        <span className="flex min-w-[150px] flex-col text-xs">
          <span className="font-medium">{row.source_name ?? row.manufacturer_name ?? '—'}</span>
          <span className="text-muted-foreground">{BARO_PURCHASE_INBOUND_LABEL[row.inbound_type]}</span>
        </span>
      ),
    },
    {
      key: 'quantity',
      label: '수량',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col text-right tabular-nums">
          <span className="font-medium">{formatNumber(row.quantity)}장</span>
          <span className="text-[11px] text-muted-foreground">{formatCapacity(row.capacity_kw)}</span>
        </span>
      ),
    },
    {
      key: 'unit_price_krw_wp',
      label: '매입단가',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col text-right tabular-nums">
          <span className="font-medium">{formatKrwWp(row.unit_price_krw_wp)}</span>
          <span className="text-[11px] text-muted-foreground">{formatUsdWp(row.unit_price_usd_wp)}</span>
        </span>
      ),
    },
    {
      key: 'estimated_amount_krw',
      label: '매입금액',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col text-right tabular-nums">
          <span className="font-medium">{row.estimated_amount_krw != null ? formatKRW(row.estimated_amount_krw) : '—'}</span>
          <span className="text-[11px] text-muted-foreground">{row.estimated_amount_usd != null ? formatUSD(row.estimated_amount_usd) : row.currency}</span>
        </span>
      ),
    },
    {
      key: 'bl_number',
      label: '근거',
      sortable: true,
      render: (row) => (
        <span className="flex min-w-[180px] flex-col text-xs">
          <span className="font-medium">{row.bl_number}</span>
          <span className="text-muted-foreground">{row.po_number ?? 'PO 미연결'} · {row.payment_terms ?? row.incoterms ?? '조건 미지정'}</span>
          <span className="text-muted-foreground">{row.warehouse_name ?? row.port ?? '도착지 미정'}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ReceiptText className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">구매이력</h1>
          <span className="truncate text-xs text-muted-foreground">
            BARO 법인 자체 매입 단가와 국내 타사 구매 내역
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> 새로 고침
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">총 매입수량</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(summary.totalQty)}장</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">총 매입용량</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatCapacity(summary.totalKw)}</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">평균 KRW/Wp</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatKrwWp(summary.avgKrwWp ?? undefined)}</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">원가 연결</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.costCovered.toLocaleString('ko-KR')} / {filteredRows.length.toLocaleString('ko-KR')}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="품번, 매입처, B/L, PO 검색"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={inboundFilter} onValueChange={(v) => setInboundFilter(v as InboundFilter)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <span className="flex-1 truncate text-left">
                {inboundFilter === '__all__' ? '전체 매입처' : BARO_PURCHASE_INBOUND_LABEL[inboundFilter]}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 매입처</SelectItem>
              {(Object.keys(BARO_PURCHASE_INBOUND_LABEL) as BaroPurchaseInboundType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {BARO_PURCHASE_INBOUND_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={costFilter} onValueChange={(v) => setCostFilter(v as CostFilter)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <span className="flex-1 truncate text-left">
                {costFilter === 'all' ? '전체 원가' : costFilter === 'krw' ? 'KRW 원가' : costFilter === 'usd' ? 'USD 원가' : '원가 없음'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 원가</SelectItem>
              <SelectItem value="krw">KRW 원가</SelectItem>
              <SelectItem value="usd">USD 원가</SelectItem>
              <SelectItem value="missing">원가 없음</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border bg-card">
        <DataTable
          data={filteredRows}
          columns={columns}
          loading={loading}
          emptyMessage="표시할 구매이력이 없습니다."
          defaultSort={{ key: 'purchase_date', direction: 'desc' }}
          footer={(
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableCell>
                <span className="flex flex-col">
                  <span className="font-semibold">합계</span>
                  <span className="text-[11px] text-muted-foreground">필터 결과 {filteredRows.length.toLocaleString('ko-KR')}건</span>
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">전체 품목</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                원가 연결 {summary.costCovered.toLocaleString('ko-KR')}건
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="flex flex-col">
                  <span className="font-semibold">{formatNumber(summary.totalQty)}장</span>
                  <span className="text-[11px] text-muted-foreground">{formatCapacity(summary.totalKw)}</span>
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="flex flex-col">
                  <span className="font-semibold">{formatKrwWp(summary.avgKrwWp ?? undefined)}</span>
                  <span className="text-[11px] text-muted-foreground">{formatUsdWp(summary.avgUsdWp ?? undefined)}</span>
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="flex flex-col">
                  <span className="font-semibold">{summary.totalKrw > 0 ? formatKRW(summary.totalKrw) : '—'}</span>
                  <span className="text-[11px] text-muted-foreground">{summary.totalUsd > 0 ? formatUSD(summary.totalUsd) : '—'}</span>
                </span>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">현재 검색/필터 기준</TableCell>
            </TableRow>
          )}
        />
      </div>
    </div>
  );
}
