import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatKRW } from '@/lib/utils';
import { EXPENSE_TYPE_LABEL, type ExpenseType } from '@/types/customs';
import type { Expense } from '@/types/customs';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const EXPENSE_TABLE_ID = 'expense-list';

interface Props {
  items: Expense[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
}

function buildColumns(): ColumnDef<Expense>[] {
  return [
    { key: 'bl_or_month', label: 'B/L / 월', className: 'text-xs', cell: (e) => e.bl_number || e.bl_id?.slice(0, 8) || e.month || '—', sortAccessor: (e) => e.bl_number || e.month || '' },
    { key: 'expense_type', label: '비용유형', hideable: true, className: 'text-xs', cell: (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] || e.expense_type, sortAccessor: (e) => EXPENSE_TYPE_LABEL[e.expense_type as ExpenseType] || e.expense_type },
    { key: 'vendor', label: '거래처', hideable: true, className: 'text-xs', cell: (e) => e.vendor || '—', sortAccessor: (e) => e.vendor || '' },
    {
      key: 'total', label: '합계', align: 'right', className: 'text-xs font-semibold tabular-nums',
      cell: (e) => <span style={{ color: 'var(--sf-ink)' }}>{formatKRW(e.total)}</span>,
      sortAccessor: (e) => e.total,
    },
    { key: 'amount', label: '금액', hideable: true, align: 'right', className: 'text-xs tabular-nums', cell: (e) => formatKRW(e.amount), sortAccessor: (e) => e.amount },
    { key: 'vat', label: 'VAT', hideable: true, align: 'right', className: 'text-xs tabular-nums', cell: (e) => e.vat != null ? formatKRW(e.vat) : '—', sortAccessor: (e) => e.vat ?? 0 },
    { key: 'company_name', label: '법인', hideable: true, className: 'text-xs', cell: (e) => e.company_name || '—', sortAccessor: (e) => e.company_name || '' },
    { key: 'memo', label: '메모', hideable: true, className: 'text-xs max-w-[120px] truncate', cell: (e) => e.memo || '—', sortAccessor: (e) => e.memo || '' },
  ];
}

export const EXPENSE_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns().map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

export default function ExpenseListTable({ items, hidden, pinning, onPinningChange }: Props) {
  return (
    <MetaTable
      tableId={EXPENSE_TABLE_ID}
      columns={buildColumns()}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      getRowKey={(e) => e.expense_id}
      rowClassName={() => 'hover:bg-muted/50'}
      emptyMessage="등록된 부대비용이 없습니다"
    />
  );
}
