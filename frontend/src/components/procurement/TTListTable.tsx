import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatDate, formatUSD, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { TT_STATUS_LABEL, TT_STATUS_COLOR, type TTRemittance } from '@/types/procurement';

interface Props { items: TTRemittance[]; onEdit: (tt: TTRemittance) => void; onNew: () => void; }

export default function TTListTable({ items, onEdit, onNew }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 TT가 없습니다" actionLabel="새로 등록" onAction={onNew} />;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader><TableRow>
          <TableHead>PO번호</TableHead><TableHead>제조사</TableHead><TableHead>송금일</TableHead>
          <TableHead className="text-right">금액(USD)</TableHead><TableHead className="text-right">원화(KRW)</TableHead>
          <TableHead className="text-right">환율</TableHead><TableHead>목적</TableHead><TableHead>상태</TableHead>
          <TableHead>은행</TableHead><TableHead className="w-10"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((tt) => (
            <TableRow key={tt.tt_id}>
              <TableCell className="font-mono">{tt.po_number || '—'}</TableCell>
              <TableCell>{tt.manufacturer_name ?? '—'}</TableCell>
              <TableCell>{formatDate(tt.remit_date ?? '')}</TableCell>
              <TableCell className="text-right">{formatUSD(tt.amount_usd)}</TableCell>
              <TableCell className="text-right">{tt.amount_krw != null ? `${formatNumber(tt.amount_krw)}원` : '—'}</TableCell>
              <TableCell className="text-right">{tt.exchange_rate?.toFixed(2) ?? '—'}</TableCell>
              <TableCell>{tt.purpose ?? '—'}</TableCell>
              <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TT_STATUS_COLOR[tt.status])}>{TT_STATUS_LABEL[tt.status]}</span></TableCell>
              <TableCell>{tt.bank_name ?? '—'}</TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(tt)}><Pencil className="h-3 w-3" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
