import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatKRW } from '@/lib/utils';
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs';
import type { Expense } from '@/types/customs';

interface Props {
  items: Expense[];
  onEdit: (e: Expense) => void;
  onNew: () => void;
}

export default function ExpenseListTable({ items, onEdit }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">등록된 부대비용이 없습니다</p>;
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((e) => (
          <TableRow
            key={e.expense_id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onEdit(e)}
          >
            <TableCell className="text-xs">
              {e.bl_number || e.bl_id?.slice(0, 8) || e.month || '—'}
            </TableCell>
            <TableCell className="text-xs">{e.company_name || '—'}</TableCell>
            <TableCell className="text-xs">{EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] || e.expense_type}</TableCell>
            <TableCell className="text-xs text-right">{formatKRW(e.amount)}</TableCell>
            <TableCell className="text-xs text-right">{e.vat != null ? formatKRW(e.vat) : '—'}</TableCell>
            <TableCell className="text-xs text-right font-medium">{formatKRW(e.total)}</TableCell>
            <TableCell className="text-xs">{e.vendor || '—'}</TableCell>
            <TableCell className="text-xs max-w-[120px] truncate">{e.memo || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
