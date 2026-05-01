import { ArrowUp, ArrowDown, Minus, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, shortMfgName } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import type { PriceHistory } from '@/types/procurement';

function PriceChange({ prev, next }: { prev?: number; next: number }) {
  if (prev == null) return <span style={{ color: 'var(--sf-ink-4)' }}>—</span>;
  if (next > prev) return <span className="sf-pill neg"><ArrowUp className="inline h-3 w-3" /> 인상</span>;
  if (next < prev) return <span className="sf-pill pos"><ArrowDown className="inline h-3 w-3" /> 인하</span>;
  return <span className="sf-pill ghost"><Minus className="inline h-3 w-3" /> 동일</span>;
}

interface Props { items: PriceHistory[]; onEdit: (ph: PriceHistory) => void; onNew: () => void; }

export default function PriceHistoryTable({ items, onEdit, onNew }: Props) {
  if (items.length === 0) return <EmptyState message="단가이력이 없습니다" actionLabel="새로 등록" onAction={onNew} />;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader><TableRow>
          <TableHead>제조사</TableHead><TableHead>품명/규격</TableHead><TableHead>변경일</TableHead>
          <TableHead className="text-right">이전단가(USD/Wp)</TableHead><TableHead className="text-right">변경단가(USD/Wp)</TableHead>
          <TableHead>변화</TableHead><TableHead>사유</TableHead><TableHead>관련PO</TableHead><TableHead className="w-10"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((ph) => (
            <TableRow key={ph.price_history_id}>
              <TableCell>{shortMfgName(ph.manufacturer_name)}</TableCell>
              <TableCell>{ph.product_name ? `${ph.product_name}${ph.spec_wp ? ` (${ph.spec_wp}Wp)` : ''}` : '—'}</TableCell>
              <TableCell>{formatDate(ph.change_date)}</TableCell>
              <TableCell className="text-right tabular-nums">{ph.previous_price != null ? `$${ph.previous_price.toFixed(4)}` : '—'}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>${ph.new_price.toFixed(4)}</TableCell>
              <TableCell><PriceChange prev={ph.previous_price} next={ph.new_price} /></TableCell>
              <TableCell>{ph.reason ?? '—'}</TableCell>
              <TableCell className="font-mono">{ph.related_po_number || '—'}</TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(ph)}><Pencil className="h-3 w-3" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
