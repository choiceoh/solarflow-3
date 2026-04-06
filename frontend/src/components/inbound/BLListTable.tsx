import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import InboundStatusBadge from './InboundStatusBadge';
import { INBOUND_TYPE_LABEL, type BLShipment } from '@/types/inbound';

interface Props {
  items: BLShipment[];
  onSelect: (bl: BLShipment) => void;
  onNew: () => void;
}

export default function BLListTable({ items, onSelect, onNew }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 입고 건이 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>입고번호</TableHead>
            <TableHead>입고유형</TableHead>
            <TableHead>제조사</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>ETD</TableHead>
            <TableHead>ETA</TableHead>
            <TableHead>실제입항</TableHead>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
