import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDate, formatNumber } from '@/lib/utils';
import type { OutstandingItem } from '@/types/orders';

interface Props {
  items: OutstandingItem[];
  selectedIds: Set<string>;
  onToggle: (outboundId: string) => void;
}

export default function OutstandingTable({ items, selectedIds, onToggle }: Props) {
  if (items.length === 0) {
    return <div className="py-6 text-center text-sm" style={{ color: 'var(--sf-ink-3)' }}>미수금 내역이 없습니다</div>;
  }

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>출고일</TableHead>
            <TableHead>현장명</TableHead>
            <TableHead>모듈</TableHead>
            <TableHead className="text-right">총액</TableHead>
            <TableHead className="text-right">기매칭</TableHead>
            <TableHead className="text-right">미수금</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.outbound_id}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => onToggle(item.outbound_id)}
            >
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(item.outbound_id)}
                  onCheckedChange={() => onToggle(item.outbound_id)}
                />
              </TableCell>
              <TableCell>{item.outbound_date ? formatDate(item.outbound_date) : '—'}</TableCell>
              <TableCell>{item.site_name ?? '—'}</TableCell>
              <TableCell>
                {item.product_name ?? '—'}
                {item.spec_wp ? ` ${item.spec_wp}Wp` : ''}
                {item.quantity ? ` x${item.quantity}` : ''}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(item.total_amount)}</TableCell>
              <TableCell className="text-right tabular-nums" style={{ color: 'var(--sf-ink-3)' }}>{formatNumber(item.matched_amount)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums" style={{ color: 'var(--sf-warn)' }}>{formatNumber(item.outstanding_amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
