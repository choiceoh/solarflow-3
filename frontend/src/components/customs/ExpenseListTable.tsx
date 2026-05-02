import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatKRW } from '@/lib/utils';
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs';
import type { Expense } from '@/types/customs';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

export const EXPENSE_TABLE_ID = 'expense-list';

interface Props {
  items: Expense[];
  hidden: Set<string>;
  onEdit: (e: Expense) => void;
  onNew: () => void;
  onDelete?: (e: Expense) => void;
}

interface BuildOpts {
  onEdit: (e: Expense) => void;
  onDelete?: (e: Expense) => void;
}

function buildColumns({ onEdit, onDelete }: BuildOpts): ColumnDef<Expense>[] {
  return [
    { key: 'bl_or_month', label: 'B/L / 월', className: 'text-xs', cell: (e) => e.bl_number || e.bl_id?.slice(0, 8) || e.month || '—' },
    { key: 'company_name', label: '법인', hideable: true, className: 'text-xs', cell: (e) => e.company_name || '—' },
    { key: 'expense_type', label: '비용유형', hideable: true, className: 'text-xs', cell: (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] || e.expense_type },
    { key: 'amount', label: '금액', hideable: true, align: 'right', className: 'text-xs tabular-nums', cell: (e) => formatKRW(e.amount) },
    { key: 'vat', label: 'VAT', hideable: true, align: 'right', className: 'text-xs tabular-nums', cell: (e) => e.vat != null ? formatKRW(e.vat) : '—' },
    {
      key: 'total', label: '합계', align: 'right', className: 'text-xs font-semibold tabular-nums',
      cell: (e) => <span style={{ color: 'var(--sf-ink)' }}>{formatKRW(e.total)}</span>,
    },
    { key: 'vendor', label: '거래처', hideable: true, className: 'text-xs', cell: (e) => e.vendor || '—' },
    { key: 'memo', label: '메모', hideable: true, className: 'text-xs max-w-[120px] truncate', cell: (e) => e.memo || '—' },
    {
      key: 'actions', label: '작업', align: 'right',
      cell: (e) => (
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
      ),
    },
  ];
}

export const EXPENSE_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({ onEdit: () => {} }).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

export default function ExpenseListTable({ items, hidden, onEdit, onDelete }: Props) {
  return (
    <MetaTable
      columns={buildColumns({ onEdit, onDelete })}
      hidden={hidden}
      items={items}
      getRowKey={(e) => e.expense_id}
      rowClassName={() => 'hover:bg-muted/50'}
      emptyMessage="등록된 부대비용이 없습니다"
    />
  );
}
