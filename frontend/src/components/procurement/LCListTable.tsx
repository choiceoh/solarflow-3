import { useState, useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatDate, formatUSD, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { fetchWithAuth } from '@/lib/api';
import { LC_STATUS_LABEL, LC_STATUS_COLOR, type LCRecord, type PurchaseOrder, type POLineItem } from '@/types/procurement';

interface LCAgg {
  manufacturerName: string;
  firstLine?: { name: string; spec: string };
  extraCount: number;
  avgCentsPerWp: number;
  totalMw: number;
}

function MaturityBadge({ date }: { date?: string }) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return <Badge variant="destructive" className="text-[10px]">만기초과</Badge>;
  if (diff <= 7) return <Badge variant="destructive" className="text-[10px]">만기임박</Badge>;
  return null;
}

interface Props {
  items: LCRecord[];
  onEdit: (lc: LCRecord) => void;
  onNew: () => void;
  onDelete?: (lcId: string) => Promise<void>;
}

export default function LCListTable({ items, onEdit, onNew, onDelete }: Props) {
  const [agg, setAgg] = useState<Record<string, LCAgg>>({});
  const [deleteTarget, setDeleteTarget] = useState<LCRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setAgg({}); return; }
    (async () => {
      try {
        // PO별로 중복 제거하여 한 번씩만 조회
        const poIds = [...new Set(items.map((lc) => lc.po_id).filter(Boolean))];
        const poData: Record<string, LCAgg> = {};

        await Promise.all(poIds.map(async (poId) => {
          try {
            const [po, lines] = await Promise.all([
              fetchWithAuth<PurchaseOrder>(`/api/v1/pos/${poId}`).catch(() => null as PurchaseOrder | null),
              fetchWithAuth<POLineItem[]>(`/api/v1/pos/${poId}/lines`).catch(() => [] as POLineItem[]),
            ]);
            const totalUsd = (lines ?? []).reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
            const totalWp = (lines ?? []).reduce((s, l) => s + (l.quantity ?? 0) * (l.products?.spec_wp ?? l.spec_wp ?? 0), 0);
            const avgCentsPerWp = totalWp > 0 ? (totalUsd / totalWp) * 100 : 0;
            const totalMw = totalWp / 1_000_000;
            const first = (lines ?? [])[0];
            poData[poId] = {
              manufacturerName: po?.manufacturer_name ?? '—',
              firstLine: first ? {
                name: first.products?.product_name ?? first.product_name ?? '—',
                spec: first.products?.product_code ?? first.product_code ?? '—',
              } : undefined,
              extraCount: Math.max(0, (lines?.length ?? 0) - 1),
              avgCentsPerWp,
              totalMw,
            };
          } catch { /* skip */ }
        }));

        if (!cancelled) {
          const result: Record<string, LCAgg> = {};
          items.forEach((lc) => {
            result[lc.lc_id] = poData[lc.po_id] ?? { manufacturerName: '—', extraCount: 0, avgCentsPerWp: 0, totalMw: 0 };
          });
          setAgg(result);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((lc) => lc.lc_id).join(',')]);

  const handleDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.lc_id);
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다');
    } finally {
      setDeleting(false);
    }
  };

  if (items.length === 0) return <EmptyState message="등록된 LC가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table className="text-xs">
          <TableHeader><TableRow>
            <TableHead>LC번호</TableHead>
            <TableHead>PO번호</TableHead>
            <TableHead>은행</TableHead>
            <TableHead>법인</TableHead>
            <TableHead>제조사</TableHead>
            <TableHead>품명/규격</TableHead>
            <TableHead className="text-right">단가(¢/Wp)</TableHead>
            <TableHead className="text-right">용량(MW)</TableHead>
            <TableHead>개설일</TableHead>
            <TableHead className="text-right">금액(USD)</TableHead>
            <TableHead className="text-right">대상수량</TableHead>
            <TableHead>Usance</TableHead>
            <TableHead>만기일</TableHead>
            <TableHead>결제예정일</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((lc) => {
              const a = agg[lc.lc_id];
              return (
                <TableRow key={lc.lc_id} className="cursor-pointer hover:bg-accent/50" onClick={() => onEdit(lc)}>
                  <TableCell className="font-mono">{lc.lc_number || '—'}</TableCell>
                  <TableCell className="font-mono">{lc.po_number || '—'}</TableCell>
                  <TableCell>{lc.bank_name ?? '—'}</TableCell>
                  <TableCell>{lc.company_name ?? '—'}</TableCell>
                  <TableCell>{a?.manufacturerName ?? '—'}</TableCell>
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
                  <TableCell>{formatDate(lc.open_date ?? '')}</TableCell>
                  <TableCell className="text-right">{formatUSD(lc.amount_usd)}</TableCell>
                  <TableCell className="text-right">{lc.target_qty != null ? formatNumber(lc.target_qty) : '—'}</TableCell>
                  <TableCell>{lc.usance_days != null ? `${lc.usance_days}일` : '—'}</TableCell>
                  <TableCell><div className="flex items-center gap-1">{formatDate(lc.maturity_date ?? '')}<MaturityBadge date={lc.maturity_date} /></div></TableCell>
                  <TableCell>{formatDate(lc.settlement_date ?? '')}</TableCell>
                  <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', LC_STATUS_COLOR[lc.status])}>{LC_STATUS_LABEL[lc.status]}</span></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(lc)}><Pencil className="h-3 w-3" /></Button>
                      {onDelete && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget(lc)}>
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
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
        title="LC 삭제"
        description={deleteTarget ? `LC "${deleteTarget.lc_number ?? ''}"를 삭제하시겠습니까?` : ''}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </>
  );
}
