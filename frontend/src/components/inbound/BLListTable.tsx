import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { formatDate, moduleLabel } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import SortableTH from '@/components/common/SortableTH';
import InboundStatusBadge from './InboundStatusBadge';
import { INBOUND_TYPE_LABEL, type BLShipment } from '@/types/inbound';
import type { Manufacturer } from '@/types/masters';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { useSort } from '@/hooks/useSort';

type WorkChipTone = 'danger' | 'warn' | 'info' | 'muted';

interface BLAgg {
  firstLine?: { name: string; spec: string; specWp?: number };
  lineCount?: number;
  extraCount: number;
  avgCentsPerWp: number;
  totalMw: number;
}

interface WorkChip {
  label: string;
  tone: WorkChipTone;
}

interface Props {
  items: BLShipment[];
  onSelect: (bl: BLShipment) => void;
  sortField?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (field: string) => void;
}

const DONE_STATUSES = new Set<BLShipment['status']>(['completed', 'erp_done']);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(date?: string): number | null {
  if (!date) return null;
  const due = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / MS_PER_DAY);
}

function dueText(date?: string): string {
  const days = daysUntil(date);
  if (days == null) return 'ETA 미정';
  if (days < 0) return `ETA ${Math.abs(days)}일 지연`;
  if (days === 0) return 'ETA 오늘';
  return `ETA D-${days}`;
}

function workChipClass(tone: WorkChipTone): string {
  switch (tone) {
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'warn':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'info':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-muted bg-muted/30 text-muted-foreground';
  }
}

function aggFromBL(bl: BLShipment): BLAgg {
  const lineCount = typeof bl.line_count === 'number' ? bl.line_count : undefined;
  const productCode = bl.first_product_code ?? '';
  const productName = bl.first_product_name ?? '';
  return {
    firstLine: productCode || productName
      ? {
          name: productName || '—',
          spec: productCode || '—',
          specWp: bl.first_spec_wp,
        }
      : undefined,
    lineCount,
    extraCount: lineCount == null ? 0 : Math.max(0, lineCount - 1),
    avgCentsPerWp: Number(bl.avg_cents_per_wp ?? 0),
    totalMw: Number(bl.total_mw ?? 0),
  };
}

function buildWorkChips(bl: BLShipment, agg?: BLAgg): WorkChip[] {
  const chips: WorkChip[] = [];
  const days = daysUntil(bl.eta);
  const isDone = DONE_STATUSES.has(bl.status);

  if (agg?.lineCount === 0) {
    chips.push({ label: '품목 없음', tone: 'danger' });
  }
  if (!isDone) {
    if (days == null) {
      chips.push({ label: 'ETA 미정', tone: 'warn' });
    } else if (days < 0) {
      chips.push({ label: `ETA ${Math.abs(days)}일 지연`, tone: 'danger' });
    } else if (days <= 7) {
      chips.push({ label: 'ETA 임박', tone: 'warn' });
    }
  }
  if (bl.status === 'arrived') {
    chips.push({ label: '입고 확인', tone: 'info' });
  }
  if (bl.status === 'customs') {
    chips.push({ label: '통관 처리', tone: 'info' });
  }
  if (bl.inbound_type === 'import' && bl.status === 'customs' && !bl.declaration_number && !bl.cif_amount_krw) {
    chips.push({ label: '면장 확인', tone: 'warn' });
  }
  if (bl.status === 'completed' && bl.erp_registered !== true) {
    chips.push({ label: 'ERP 미등록', tone: 'warn' });
  }

  return chips;
}

export default function BLListTable({ items, onSelect, sortField, sortDirection, onSort }: Props) {
  const companies = useAppStore((s) => s.companies);
  const companyMap = Object.fromEntries(companies.map((c) => [c.company_id, c.company_name]));
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const mfgMap = Object.fromEntries(manufacturers.map((m) => [m.manufacturer_id, m.name_kr]));
  const agg = useMemo<Record<string, BLAgg>>(() => (
    Object.fromEntries(items.map((bl) => [bl.bl_id, aggFromBL(bl)]))
  ), [items]);

  // 제조사 목록 1회 로드 (manufacturer_id → name_kr 룩업용)
  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list ?? []))
      .catch(() => {});
  }, []);

  const controlled = onSort != null
    ? { sortField: sortField ?? null, sortDirection: sortDirection ?? null, onSort }
    : undefined;
  const { sorted, headerProps } = useSort<BLShipment>(items, (b, f) => {
    switch (f) {
      case 'bl_number': return b.bl_number ?? '';
      case 'manufacturer': return b.manufacturer_name ?? mfgMap[b.manufacturer_id] ?? '';
      case 'inbound_type': return b.inbound_type;
      case 'etd': return b.etd ?? '';
      default: return null;
    }
  }, controlled);

  const totalMw = sorted.reduce((sum, bl) => sum + (agg[bl.bl_id]?.totalMw ?? 0), 0);
  const queueSummary = useMemo(() => {
    const rows = sorted.map((bl) => ({ bl, chips: buildWorkChips(bl, agg[bl.bl_id]) }));
    return {
      attention: rows.filter((row) => row.chips.some((chip) => chip.tone === 'danger' || chip.tone === 'warn')).length,
      etaSoon: rows.filter((row) => {
        const d = daysUntil(row.bl.eta);
        return !DONE_STATUSES.has(row.bl.status) && d != null && d >= 0 && d <= 7;
      }).length,
      erpPending: rows.filter((row) => row.bl.status === 'completed' && row.bl.erp_registered !== true).length,
    };
  }, [sorted, agg]);

  if (items.length === 0) return <EmptyState message="등록된 입고 건이 없습니다" />;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border bg-card px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">처리 필요</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{queueSummary.attention.toLocaleString('ko-KR')}건</div>
        </div>
        <div className="rounded-md border bg-card px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ETA 7일 내</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{queueSummary.etaSoon.toLocaleString('ko-KR')}건</div>
        </div>
        <div className="rounded-md border bg-card px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">ERP 미등록</div>
          <div className="mt-1 text-base font-semibold tabular-nums">{queueSummary.erpPending.toLocaleString('ko-KR')}건</div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full min-w-[960px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <SortableTH {...headerProps('bl_number')} className="p-3 font-medium text-muted-foreground">B/L 정보</SortableTH>
              <SortableTH {...headerProps('manufacturer')} className="p-3 font-medium text-muted-foreground">품목</SortableTH>
              <SortableTH {...headerProps('inbound_type')} className="p-3 font-medium text-muted-foreground">구분 / 현황</SortableTH>
              <SortableTH {...headerProps('etd')} className="p-3 font-medium text-muted-foreground">선적 일정</SortableTH>
              <th className="p-3 text-left font-medium text-muted-foreground">작업</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((bl) => {
              const a = agg[bl.bl_id];
              const chips = buildWorkChips(bl, a);
              return (
                <tr key={bl.bl_id} className="border-t hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => onSelect(bl)}>
                  {/* B/L 정보 */}
                  <td className="p-3 align-top">
                    {companyMap[bl.company_id] && (
                      <div className="text-[10px] text-muted-foreground mb-0.5">{companyMap[bl.company_id]}</div>
                    )}
                    <div className="sf-mono font-semibold text-[13px]" style={{ color: 'var(--sf-ink)' }}>{bl.bl_number}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      PO: {bl.po_number ?? (bl.po_id ? bl.po_id.slice(0, 8) : '—')}
                    </div>
                    {(bl.lc_number || bl.lc_id) && (
                      <div className="text-[10px] text-muted-foreground font-mono">
                        LC: {bl.lc_number ?? bl.lc_id?.slice(0, 8)}
                      </div>
                    )}
                  </td>

                  {/* 품목 */}
                  <td className="p-3 align-top min-w-[180px]">
                    <div className="font-medium">
                      {moduleLabel(bl.manufacturer_name ?? mfgMap[bl.manufacturer_id], a?.firstLine?.specWp)}
                    </div>
                    {a?.firstLine ? (
                      <div className="mt-0.5">
                        <div className="truncate max-w-[200px] text-[11px]">{a.firstLine.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {a.firstLine.spec}{a.extraCount > 0 ? ` 외 ${a.extraCount}건` : ''}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2">
                      {a && a.totalMw > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                          {a.totalMw.toFixed(2)} MW
                        </span>
                      )}
                      {a && a.avgCentsPerWp > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                          {a.avgCentsPerWp.toFixed(2)} ¢/Wp
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 구분 / 현황 */}
                  <td className="p-3 align-top">
                    <div className="mb-1.5">
                      <span className="sf-pill ghost">{INBOUND_TYPE_LABEL[bl.inbound_type]}</span>
                    </div>
                    <InboundStatusBadge status={bl.status} />
                  </td>

                  {/* 선적 일정 */}
                  <td className="p-3 align-top min-w-[130px]">
                    <div className="space-y-0.5">
                      <div className="text-[10px]">
                        <span className="text-muted-foreground w-8 inline-block">ETD</span>
                        <span className="tabular-nums">{formatDate(bl.etd ?? '')}</span>
                      </div>
                      <div className="text-[10px]">
                        <span className="text-muted-foreground w-8 inline-block">ETA</span>
                        <span className="tabular-nums">{formatDate(bl.eta ?? '')}</span>
                      </div>
                      <div className="text-[10px]">
                        <span className="text-muted-foreground w-8 inline-block">입항</span>
                        <span className="tabular-nums">{formatDate(bl.actual_arrival ?? '') || '—'}</span>
                      </div>
                    </div>
                  </td>

                  {/* 작업 */}
                  <td className="p-3 align-top min-w-[190px]">
                    <div className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      <span>{dueText(bl.eta)}</span>
                    </div>
                    {chips.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {chips.map((chip) => (
                          <span
                            key={chip.label}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${workChipClass(chip.tone)}`}
                          >
                            {chip.tone === 'danger' || chip.tone === 'warn' ? <AlertTriangle className="h-3 w-3" /> : null}
                            {chip.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex rounded-full border border-muted bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                        정상
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/20">
              <td className="p-3">
                <span className="whitespace-nowrap font-medium">
                  합계 · {sorted.length.toLocaleString('ko-KR')}건
                </span>
              </td>
              <td className="p-3 font-mono font-medium tabular-nums">{totalMw > 0 ? `${totalMw.toFixed(2)} MW` : '—'}</td>
              <td />
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
