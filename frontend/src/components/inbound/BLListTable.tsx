import { useState, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
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
      <div className="rounded-md border overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>B/L번호</TableHead>
              <TableHead>PO번호</TableHead>
              <TableHead>LC번호</TableHead>
              <TableHead>입고구분</TableHead>
              <TableHead>공급사</TableHead>
              <TableHead>품명/규격</TableHead>
              <TableHead className="text-right">단가(¢/Wp)</TableHead>
              <TableHead className="text-right">용량(MW)</TableHead>
              <TableHead>입고현황</TableHead>
              <TableHead>ETD</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>실제입항</TableHead>
              <TableHead className="w-20 text-center">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((bl) => {
              const a = agg[bl.bl_id];
              return (
                <TableRow key={bl.bl_id} className="cursor-pointer hover:bg-accent/50" onClick={() => onSelect(bl)}>
                  <TableCell className="font-mono font-medium">{bl.bl_number}</TableCell>
                  <TableCell className="font-mono">{bl.po_number ?? (bl.po_id ? bl.po_id.slice(0, 8) : '—')}</TableCell>
                  <TableCell className="font-mono">{bl.lc_number ?? (bl.lc_id ? bl.lc_id.slice(0, 8) : '—')}</TableCell>
                  <TableCell>{INBOUND_TYPE_LABEL[bl.inbound_type]}</TableCell>
                  <TableCell>{bl.manufacturer_name ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {a?.firstLine ? (
                      <>
                        <div className="truncate max-w-[160px]">{a.firstLine.name}</div>
                        <div className="text-muted-foreground truncate max-w-[160px]">{a.firstLine.spec}{a.extraCount > 0 ? ` 외 ${a.extraCount}건` : ''}</div>
                      </>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{a && a.avgCentsPerWp > 0 ? a.avgCentsPerWp.toFixed(2) : '—'}</TableCell>
                  <TableCell className="text-right font-mono">{a && a.totalMw > 0 ? a.totalMw.toFixed(2) : '—'}</TableCell>
                  <TableCell><InboundStatusBadge status={bl.status} /></TableCell>
                  <TableCell>{formatDate(bl.etd ?? '')}</TableCell>
                  <TableCell>{formatDate(bl.eta ?? '')}</TableCell>
                  <TableCell>{formatDate(bl.actual_arrival ?? '')}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
