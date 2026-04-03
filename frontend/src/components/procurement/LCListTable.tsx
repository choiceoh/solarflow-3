import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatDate, formatUSD, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { LC_STATUS_LABEL, LC_STATUS_COLOR, type LCRecord } from '@/types/procurement';

function MaturityBadge({ date }: { date?: string }) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return <Badge variant="destructive" className="text-[10px]">만기초과</Badge>;
  if (diff <= 7) return <Badge variant="destructive" className="text-[10px]">만기임박</Badge>;
  return null;
}

interface Props { items: LCRecord[]; onEdit: (lc: LCRecord) => void; onNew: () => void; }

export default function LCListTable({ items, onEdit, onNew }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 LC가 없습니다" actionLabel="새로 등록" onAction={onNew} />;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="text-xs">
        <TableHeader><TableRow>
          <TableHead>LC번호</TableHead><TableHead>PO번호</TableHead><TableHead>은행</TableHead><TableHead>법인</TableHead>
          <TableHead>개설일</TableHead><TableHead className="text-right">금액(USD)</TableHead><TableHead className="text-right">대상수량</TableHead>
          <TableHead>Usance</TableHead><TableHead>만기일</TableHead><TableHead>결제일</TableHead><TableHead>상태</TableHead><TableHead className="w-10"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map((lc) => (
            <TableRow key={lc.lc_id}>
              <TableCell className="font-mono">{lc.lc_number || '—'}</TableCell>
              <TableCell className="font-mono">{lc.po_number || '—'}</TableCell>
              <TableCell>{lc.bank_name ?? '—'}</TableCell>
              <TableCell>{lc.company_name ?? '—'}</TableCell>
              <TableCell>{formatDate(lc.open_date ?? '')}</TableCell>
              <TableCell className="text-right">{formatUSD(lc.amount_usd)}</TableCell>
              <TableCell className="text-right">{lc.target_qty != null ? formatNumber(lc.target_qty) : '—'}</TableCell>
              <TableCell>{lc.usance_days != null ? `${lc.usance_days}일` : '—'}</TableCell>
              <TableCell><div className="flex items-center gap-1">{formatDate(lc.maturity_date ?? '')}<MaturityBadge date={lc.maturity_date} /></div></TableCell>
              <TableCell>{formatDate(lc.settlement_date ?? '')}</TableCell>
              <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', LC_STATUS_COLOR[lc.status])}>{LC_STATUS_LABEL[lc.status]}</span></TableCell>
              <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(lc)}><Pencil className="h-3 w-3" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
