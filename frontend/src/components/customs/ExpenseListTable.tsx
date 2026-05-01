import { Pencil, Trash2 } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatKRW } from '@/lib/utils';
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs';
import type { Expense } from '@/types/customs';

interface Props {
  items: Expense[];
  onEdit: (e: Expense) => void;
  onNew: () => void;
  onDelete?: (e: Expense) => void;
}

export default function ExpenseListTable({ items, onEdit, onDelete }: Props) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--sf-ink-3)]">등록된 부대비용이 없습니다</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>B/L / 월</TableHead>
          <TableHead>법인</TableHead>
          <TableHead>비용유형</TableHead>
          <TableHead className="text-right">금액</TableHead>
          <TableHead className="text-right">VAT</TableHead>
          <TableHead className="text-right">합계</TableHead>
          <TableHead>거래처</TableHead>
          <TableHead>메모</TableHead>
          <TableHead className="text-right">작업</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((e) => (
          <TableRow key={e.expense_id} className="hover:bg-muted/50">
            <TableCell className="text-xs">
              {e.bl_number || e.bl_id?.slice(0, 8) || e.month || '—'}
            </TableCell>
            <TableCell className="text-xs">{e.company_name || '—'}</TableCell>
            <TableCell className="text-xs">{EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] || e.expense_type}</TableCell>
            <TableCell className="text-xs text-right tabular-nums">{formatKRW(e.amount)}</TableCell>
            <TableCell className="text-xs text-right tabular-nums">{e.vat != null ? formatKRW(e.vat) : '—'}</TableCell>
            <TableCell className="text-right text-xs font-semibold tabular-nums text-[var(--sf-ink)]">{formatKRW(e.total)}</TableCell>
            <TableCell className="text-xs">{e.vendor || '—'}</TableCell>
            <TableCell className="text-xs max-w-[120px] truncate">{e.memo || '—'}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon-xs" className="btn xs ghost icon" onClick={() => onEdit(e)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {onDelete && (
                  <Button variant="ghost" size="icon-xs" className="btn xs ghost icon text-destructive hover:text-destructive" onClick={() => onDelete(e)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
