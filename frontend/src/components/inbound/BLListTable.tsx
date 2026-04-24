import { useState, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, moduleLabel } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InboundStatusBadge from './InboundStatusBadge';
import { INBOUND_TYPE_LABEL, type BLShipment, type BLLineItem } from '@/types/inbound';
import { fetchWithAuth } from '@/lib/api';

interface BLAgg {
  firstLine?: { name: string; spec: string };
  extraCount: number;
  avgCentsPerWp: number;
  totalMw: number;
}

interface Props {
  items: BLShipment[];
  onSelect: (bl: BLShipment) => void;
  onNew: () => void;
  onDelete?: (blId: string) => Promise<void>;
}

export default function BLListTable({ items, onSelect, onNew, onDelete }: Props) {
  const [agg, setAgg] = useState<Record<string, BLAgg>>({});
  const [deleteTarget, setDeleteTarget] = useState<BLShipment | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.bl_id);
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  if (items.length === 0) return <EmptyState message="등록된 입고 건이 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="p-3 text-left font-medium text-muted-foreground">B/L 정보</th>
              <th className="p-3 text-left font-medium text-muted-foreground">품목</th>
              <th className="p-3 text-left font-medium text-muted-foreground">구분 / 현황</th>
              <th className="p-3 text-left font-medium text-muted-foreground">선적 일정</th>
              <th className="p-3 text-center font-medium text-muted-foreground w-[70px]">작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((bl) => {
              const a = agg[bl.bl_id];
              return (
                <tr key={bl.bl_id} className="border-t hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => onSelect(bl)}>
                  {/* B/L 정보 */}
                  <td className="p-3 align-top">
                    <div className="font-mono font-semibold">{bl.bl_number}</div>
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
                    <div className="font-medium">{moduleLabel(bl.manufacturer_name)}</div>
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
                    <div className="text-[10px] text-muted-foreground mb-1.5">
                      {INBOUND_TYPE_LABEL[bl.inbound_type]}
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
                  <td className="p-3 text-center align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="수정"
                        onClick={() => onSelect(bl)}>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                      </Button>
                      {onDelete && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="삭제"
                          onClick={() => setDeleteTarget(bl)}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title="입고 삭제"
        description={deleteTarget ? `"${deleteTarget.bl_number}" 입고 건을 삭제하시겠습니까?` : ''}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </>
  );
}
