import { useState, useEffect } from 'react';
import { formatDate, moduleLabel } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import SortableTH from '@/components/common/SortableTH';
import InboundStatusBadge from './InboundStatusBadge';
import { INBOUND_TYPE_LABEL, type BLShipment, type BLLineItem } from '@/types/inbound';
import type { Manufacturer } from '@/types/masters';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import { useSort } from '@/hooks/useSort';

interface BLAgg {
  firstLine?: { name: string; spec: string; specWp?: number };
  extraCount: number;
  avgCentsPerWp: number;
  totalMw: number;
}

interface Props {
  items: BLShipment[];
  onSelect: (bl: BLShipment) => void;
}

export default function BLListTable({ items, onSelect }: Props) {
  const companies = useAppStore((s) => s.companies);
  const companyMap = Object.fromEntries(companies.map((c) => [c.company_id, c.company_name]));
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const mfgMap = Object.fromEntries(manufacturers.map((m) => [m.manufacturer_id, m.name_kr]));
  const [agg, setAgg] = useState<Record<string, BLAgg>>({});

  // 제조사 목록 1회 로드 (manufacturer_id → name_kr 룩업용)
  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setAgg({}); return; }
    (async () => {
      try {
        const result: Record<string, BLAgg> = {};
        await Promise.all(items.map(async (bl) => {
          try {
            const lines = await fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`).catch(() => [] as BLLineItem[]);
            const totalInvoice = (lines ?? []).reduce((s, l) => s + (l.invoice_amount_usd ?? 0), 0);
            const totalWp = (lines ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0) * 1000, 0);
            const avgCentsPerWp = totalWp > 0 ? (totalInvoice / totalWp) * 100 : 0;
            const totalMw = (lines ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000;
            const first = (lines ?? [])[0];
            result[bl.bl_id] = {
              firstLine: first ? {
                name: first.product_name ?? first.products?.product_name ?? '—',
                spec: first.product_code ?? first.products?.product_code ?? '—',
                specWp: first.products?.spec_wp,
              } : undefined,
              extraCount: Math.max(0, (lines?.length ?? 0) - 1),
              avgCentsPerWp,
              totalMw,
            };
          } catch { /* skip */ }
        }));
        if (!cancelled) setAgg(result);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((bl) => bl.bl_id).join(',')]);

  const { sorted, headerProps } = useSort<BLShipment>(items, (b, f) => {
    switch (f) {
      case 'bl_number': return b.bl_number ?? '';
      case 'manufacturer': return b.manufacturer_name ?? mfgMap[b.manufacturer_id] ?? '';
      case 'inbound_type': return b.inbound_type;
      case 'etd': return b.etd ?? '';
      default: return null;
    }
  });

  if (items.length === 0) return <EmptyState message="등록된 입고 건이 없습니다" />;

  const totalMw = sorted.reduce((sum, bl) => sum + (agg[bl.bl_id]?.totalMw ?? 0), 0);

  return (
    <div className="rounded-md border overflow-x-auto">
        <table className="w-full min-w-[800px] text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <SortableTH {...headerProps('bl_number')} className="p-3 font-medium text-muted-foreground">B/L 정보</SortableTH>
              <SortableTH {...headerProps('manufacturer')} className="p-3 font-medium text-muted-foreground">품목</SortableTH>
              <SortableTH {...headerProps('inbound_type')} className="p-3 font-medium text-muted-foreground">구분 / 현황</SortableTH>
              <SortableTH {...headerProps('etd')} className="p-3 font-medium text-muted-foreground">선적 일정</SortableTH>
            </tr>
          </thead>
          <tbody>
            {sorted.map((bl) => {
              const a = agg[bl.bl_id];
              return (
                <tr key={bl.bl_id} className="border-t hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => onSelect(bl)}>
                  {/* B/L 정보 */}
                  <td className="p-3 align-top">
                    {companyMap[bl.company_id] && (
                      <div className="text-[10px] text-muted-foreground mb-0.5">{companyMap[bl.company_id]}</div>
                    )}
                    <div className="sf-mono font-semibold" style={{ color: 'var(--sf-ink)' }}>{bl.bl_number}</div>
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
            </tr>
          </tfoot>
        </table>
    </div>
  );
}
