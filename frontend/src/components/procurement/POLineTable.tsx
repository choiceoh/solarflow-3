import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatNumber, formatUSD, formatWp } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import type { POLineItem } from '@/types/procurement';

interface Props { items: POLineItem[]; onEdit: (line: POLineItem) => void; }

export default function POLineTable({ items, onEdit }: Props) {
  if (items.length === 0) return <EmptyState message="라인아이템이 없습니다" />;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader><TableRow>
          <TableHead>품번</TableHead><TableHead>품명</TableHead><TableHead className="text-right">규격</TableHead>
          <TableHead className="text-right">수량</TableHead><TableHead className="text-right">USD/Wp</TableHead>
          <TableHead className="text-right">총액(USD)</TableHead><TableHead className="w-10"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((l) => (
            <TableRow key={l.po_line_id}>
              <TableCell className="font-mono">{l.product_code ?? '—'}</TableCell>
              <TableCell>{l.product_name ?? '—'}</TableCell>
              <TableCell className="text-right">{l.spec_wp ? formatWp(l.spec_wp) : '—'}</TableCell>
              <TableCell className="text-right">{formatNumber(l.quantity)}</TableCell>
              <TableCell className="text-right">{l.unit_price_usd != null ? `$${l.unit_price_usd.toFixed(4)}` : '—'}</TableCell>
              <TableCell className="text-right font-medium">{l.total_amount_usd != null ? formatUSD(l.total_amount_usd) : '—'}</TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(l)}><Pencil className="h-3 w-3" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
