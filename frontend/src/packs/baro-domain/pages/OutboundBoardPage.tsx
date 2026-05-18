import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, RefreshCw, Search, Truck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import DataTable, { type Column } from '@/components/common/DataTable';
import { fetchWithAuth } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { BaroOutboundItem } from '@/types/baro-outbound';
import {
  OUTBOUND_STATUS_LABEL,
  USAGE_CATEGORY_LABEL,
  type OutboundStatus,
  type UsageCategory,
} from '@/types/outbound';

// BARO 출고 보드 — module 계열(탑솔라/디원/화신)이 등록한 출고를 가격 마스킹 후
// BARO 창고팀이 같이 본다. 피킹·배송·검수 준비를 위한 sanitized 보드 (D-039).
// 가격/원가/매출 정보는 백엔드에서 응답에 포함되지 않음 (D-116 패턴).

type Scope = 'open' | 'all';
type StatusFilter = '' | OutboundStatus;
type UsageFilter = '' | UsageCategory;

const STATUS_VARIANT: Record<OutboundStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  cancel_pending: 'secondary',
  cancelled: 'outline',
};

function formatCapacity(kw: number): string {
  if (!Number.isFinite(kw) || kw <= 0) return '0 kW';
  if (kw >= 1000) return `${(kw / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MW`;
  return `${Math.round(kw).toLocaleString('ko-KR')} kW`;
}

function matchesSearch(row: BaroOutboundItem, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = [
    row.site_name,
    row.site_address,
    row.product_code,
    row.product_name,
    row.warehouse_name,
    row.order_number,
    row.erp_outbound_no,
    row.company_name,
    row.target_company_name,
    row.spec_wp ? `${row.spec_wp}w` : '',
  ].join(' ').toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

// 4 체크박스를 한 줄로 요약. 켜진 것 ✓, 꺼진 것 ◯.
function WorkflowDots({ row }: { row: BaroOutboundItem }) {
  const items: Array<[boolean, string]> = [
    [row.tx_statement_ready, '거래명세서'],
    [row.inspection_request_sent, '인수검수'],
    [row.approval_requested, '결재요청'],
    [row.tax_invoice_issued, '계산서'],
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map(([on, label]) => (
        <span key={label} className="flex items-center gap-1 text-[11px]" title={`${label} ${on ? '완료' : '대기'}`}>
          {on
            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className={on ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        </span>
      ))}
    </div>
  );
}

export default function OutboundBoardPage() {
  const [rows, setRows] = useState<BaroOutboundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<Scope>('open');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope });
      if (statusFilter) params.set('status', statusFilter);
      if (usageFilter) params.set('usage_category', usageFilter);
      const list = await fetchWithAuth<BaroOutboundItem[]>(
        `/api/v1/baro/outbounds?${params.toString()}`,
      );
      setRows(list);
    } catch (e) {
      console.error('[BARO 출고 보드 로드 실패]', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [scope, statusFilter, usageFilter]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, query)),
    [rows, query],
  );

  const summary = useMemo(() => {
    const open = rows.filter((row) => row.status === 'active');
    const totalKw = open.reduce((sum, row) => sum + row.capacity_kw, 0);
    const pendingShipDoc = open.filter((row) => !row.tx_statement_ready).length;
    const pendingInspection = open.filter((row) => !row.inspection_request_sent).length;
    return { totalKw, pendingShipDoc, pendingInspection, lineCount: open.length };
  }, [rows]);

  const columns: Column<BaroOutboundItem>[] = [
    {
      key: 'outbound_date',
      label: '출고일',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium tabular-nums">{formatDate(row.outbound_date)}</span>
          {row.erp_outbound_no
            ? <span className="text-[11px] text-muted-foreground">ERP {row.erp_outbound_no}</span>
            : null}
        </span>
      ),
    },
    {
      key: 'site_name',
      label: '현장',
      sortable: true,
      render: (row) => (
        <span className="flex min-w-[220px] flex-col">
          <span className="font-medium">{row.site_name ?? '—'}</span>
          <span className="truncate text-xs text-muted-foreground">
            {row.site_address ?? '—'}
          </span>
        </span>
      ),
    },
    {
      key: 'product_code',
      label: '품번',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col">
          <span className="font-medium font-mono text-[12px]">{row.product_code ?? '—'}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {row.product_name ?? '—'}
            {row.spec_wp ? ` · ${row.spec_wp}W` : ''}
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
          <span className="text-[11px] text-muted-foreground">
            {formatCapacity(row.capacity_kw)}
            {row.spare_qty ? ` · SP ${row.spare_qty}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'warehouse_name',
      label: '창고 · 법인',
      render: (row) => (
        <span className="flex flex-col text-xs">
          <span className="font-medium">{row.warehouse_name ?? '—'}</span>
          <span className="text-muted-foreground">{row.company_name ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: '상태',
      sortable: true,
      render: (row) => (
        <span className="flex flex-col gap-1">
          <Badge variant={STATUS_VARIANT[row.status]} className="w-fit text-[11px]">
            {OUTBOUND_STATUS_LABEL[row.status]}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {USAGE_CATEGORY_LABEL[row.usage_category]}
          </span>
        </span>
      ),
    },
    {
      key: 'tx_statement_ready',
      label: '워크플로우',
      render: (row) => <WorkflowDots row={row} />,
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">출고 보드</h1>
          <span className="truncate text-xs text-muted-foreground">
            module 직원이 등록한 출고 — 가격 정보 없이 창고 작업용 정보만 표시
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-[11px] text-muted-foreground">진행 중 출고</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.lineCount.toLocaleString('ko-KR')}건</div>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-[11px] text-muted-foreground">총 용량</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatCapacity(summary.totalKw)}</div>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-[11px] text-muted-foreground">거래명세서 미준비</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.pendingShipDoc.toLocaleString('ko-KR')}건</div>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-[11px] text-muted-foreground">인수검수 미발송</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{summary.pendingInspection.toLocaleString('ko-KR')}건</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="현장/주소/품번/창고 검색"
            className="h-8 w-[280px] pl-7 text-[12px]"
          />
        </div>
        <Select value={scope} onValueChange={(v) => setScope((v ?? 'open') as Scope)}>
          <SelectTrigger className="h-8 w-[120px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">진행 중</SelectItem>
            <SelectItem value="all">취소 포함</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || 'all'}
          onValueChange={(v) => setStatusFilter((v === 'all' ? '' : v) as StatusFilter)}
        >
          <SelectTrigger className="h-8 w-[140px] text-[12px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">상태 전체</SelectItem>
            {(Object.entries(OUTBOUND_STATUS_LABEL) as [OutboundStatus, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={usageFilter || 'all'}
          onValueChange={(v) => setUsageFilter((v === 'all' ? '' : v) as UsageFilter)}
        >
          <SelectTrigger className="h-8 w-[160px] text-[12px]">
            <SelectValue placeholder="용도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">용도 전체</SelectItem>
            {(Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {filteredRows.length.toLocaleString('ko-KR')} / {rows.length.toLocaleString('ko-KR')}건
        </span>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
        <DataTable
          columns={columns}
          data={filteredRows}
          loading={loading}
          emptyMessage="등록된 출고가 없습니다"
        />
      </div>
    </div>
  );
}
