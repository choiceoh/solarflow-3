import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Ship } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import DataTable, { type Column } from '@/components/common/DataTable';
import { fetchWithAuth } from '@/lib/api';
import { formatDate, moduleLabel } from '@/lib/utils';
import type { BaroIncomingItem, BaroIncomingStatus } from '@/types/baro-incoming';
import {
  BARO_INCOMING_STATUS_LABEL,
  BARO_INCOMING_TYPE_LABEL,
} from '@/types/baro-incoming';

type Scope = 'open' | 'all';
type StatusFilter = '' | BaroIncomingStatus;

const statusVariant: Record<BaroIncomingStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  scheduled: 'secondary',
  shipping: 'default',
  arrived: 'default',
  customs: 'secondary',
  completed: 'outline',
  erp_done: 'outline',
};

function formatCapacity(kw: number): string {
  if (!Number.isFinite(kw) || kw <= 0) return '0 kW';
  if (kw >= 1000) return `${(kw / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MW`;
  return `${Math.round(kw).toLocaleString('ko-KR')} kW`;
}

function daysUntil(date?: string): number | null {
  if (!date) return null;
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((target.getTime() - base.getTime()) / 86_400_000);
}

function etaLabel(row: BaroIncomingItem): string {
  const date = row.sales_available_date ?? row.eta ?? row.actual_arrival;
  const d = daysUntil(date);
  if (d == null) return '일정 미정';
  if (d < 0) return `${Math.abs(d)}일 지남`;
  if (d === 0) return '오늘';
  return `${d}일 후`;
}

function matchesSearch(row: BaroIncomingItem, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = [
    row.bl_number,
    row.company_name,
    row.manufacturer_name,
    row.product_code,
    row.product_name,
    row.spec_wp ? `${row.spec_wp}w` : '',
    row.module_width_mm && row.module_height_mm ? `${row.module_width_mm}x${row.module_height_mm}` : '',
    row.port,
    row.warehouse_name,
    BARO_INCOMING_STATUS_LABEL[row.status],
  ].join(' ').toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

// BARO 전용 — 단가/환율/원가 없이 입고예정과 ETA만 보는 공급예정 보드
export default function IncomingBoardPage() {
  const [rows, setRows] = useState<BaroIncomingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>('open');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope });
      if (statusFilter) params.set('status', statusFilter);
      const list = await fetchWithAuth<BaroIncomingItem[]>(
        `/api/v1/baro/incoming?${params.toString()}`,
      );
      setRows(list);
    } catch (e) {
      console.error('[BARO 입고예정 로드 실패]', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [scope, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, query)),
    [rows, query],
  );

  const summary = useMemo(() => {
    const openRows = rows.filter((row) => !['completed', 'erp_done'].includes(row.status));
    const totalKw = openRows.reduce((sum, row) => sum + row.capacity_kw, 0);
    const due7 = openRows.filter((row) => {
      const d = daysUntil(row.sales_available_date ?? row.eta);
      return d != null && d >= 0 && d <= 7;
    }).length;
    const arrived = openRows.filter((row) => row.status === 'arrived' || row.status === 'customs').length;
    return { totalKw, due7, arrived, lineCount: openRows.length };
  }, [rows]);

  const columns: Column<BaroIncomingItem>[] = [
    {
      key: 'sales_available_date',
      label: '예상일',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium tabular-nums">{formatDate(row.sales_available_date ?? row.eta ?? '')}</span>
          <span className="text-[11px] text-muted-foreground">{etaLabel(row)}</span>
        </span>
      ),
    },
    {
      key: 'product_code',
      label: '품목',
      sortable: true,
      render: (row) => (
        <span className="flex min-w-[220px] flex-col">
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
      key: 'quantity',
      label: '수량',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col text-right tabular-nums">
          <span className="font-medium">{row.quantity.toLocaleString('ko-KR')}장</span>
          <span className="text-[11px] text-muted-foreground">{formatCapacity(row.capacity_kw)}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col gap-1">
          <Badge variant={statusVariant[row.status]} className="w-fit text-[11px]">
            {BARO_INCOMING_STATUS_LABEL[row.status]}
          </Badge>
          <span className="text-[11px] text-muted-foreground">{BARO_INCOMING_TYPE_LABEL[row.inbound_type]}</span>
        </span>
      ),
    },
    {
      key: 'eta',
      label: '선적 일정',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col text-xs">
          <span><span className="text-muted-foreground">ETD</span> {formatDate(row.etd ?? '')}</span>
          <span><span className="text-muted-foreground">ETA</span> {formatDate(row.eta ?? '')}</span>
          <span><span className="text-muted-foreground">입고</span> {formatDate(row.actual_arrival ?? '')}</span>
        </span>
      ),
    },
    {
      key: 'warehouse_name',
      label: '도착지',
      render: (row) => (
        <span className="flex flex-col text-xs">
          <span>{row.warehouse_name ?? row.port ?? '—'}</span>
          <span className="text-muted-foreground">{row.company_name ?? '—'} · {row.bl_number}</span>
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Ship className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">입고예정</h1>
          <span className="truncate text-xs text-muted-foreground">
            BARO 전용 — 영업 응대에 필요한 ETA와 공급예정 수량만 표시합니다.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> 새로 고침
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">입고예정 용량</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatCapacity(summary.totalKw)}</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">진행 품목</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.lineCount.toLocaleString('ko-KR')}건</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">7일 내 ETA</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.due7.toLocaleString('ko-KR')}건</div>
        </div>
        <div className="rounded-md border bg-card px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">입항/통관중</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.arrived.toLocaleString('ko-KR')}건</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="품번, 제조사, B/L, 도착지 검색"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <span className="flex-1 text-left truncate">{scope === 'open' ? '진행중만' : '전체'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">진행중만</SelectItem>
              <SelectItem value="all">전체</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter || '__all__'}
            onValueChange={(v) => setStatusFilter(((v ?? '__all__') === '__all__' ? '' : (v as BaroIncomingStatus)))}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <span className="flex-1 text-left truncate">
                {statusFilter ? BARO_INCOMING_STATUS_LABEL[statusFilter] : '전체 상태'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 상태</SelectItem>
              {(Object.keys(BARO_INCOMING_STATUS_LABEL) as BaroIncomingStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {BARO_INCOMING_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border bg-card">
        <DataTable
          data={filteredRows}
          columns={columns}
          loading={loading}
          emptyMessage="표시할 입고예정이 없습니다."
          defaultSort={{ key: 'sales_available_date', direction: 'asc' }}
        />
      </div>
    </div>
  );
}
