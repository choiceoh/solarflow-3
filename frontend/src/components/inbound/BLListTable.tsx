import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InboundStatusBadge from './InboundStatusBadge';
import { INBOUND_TYPE_LABEL, type BLShipment } from '@/types/inbound';

interface Props {
  items: BLShipment[];
  onSelect: (bl: BLShipment) => void;
  onNew: () => void;
  onDelete?: (blId: string) => Promise<void>;
}

export default function BLListTable({ items, onSelect, onNew, onDelete }: Props) {
  const [deleteTarget, setDeleteTarget] = useState<BLShipment | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      <div className="rounded-md border">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>B/L번호</TableHead>
              <TableHead>입고구분</TableHead>
              <TableHead>공급사</TableHead>
              <TableHead>입고현황</TableHead>
              <TableHead>ETD</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>실제입항</TableHead>
              <TableHead className="w-20 text-center">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((bl) => (
              <TableRow key={bl.bl_id} className="cursor-pointer hover:bg-accent/50" onClick={() => onSelect(bl)}>
                <TableCell className="font-mono font-medium">{bl.bl_number}</TableCell>
                <TableCell>{INBOUND_TYPE_LABEL[bl.inbound_type]}</TableCell>
                <TableCell>{bl.manufacturer_name ?? '—'}</TableCell>
                <TableCell><InboundStatusBadge status={bl.status} /></TableCell>
                <TableCell>{formatDate(bl.etd ?? '')}</TableCell>
                <TableCell>{formatDate(bl.eta ?? '')}</TableCell>
                <TableCell>{formatDate(bl.actual_arrival ?? '')}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="수정"
                      onClick={(e) => { e.stopPropagation(); onSelect(bl); }}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                    {onDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="삭제"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(bl); }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
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
