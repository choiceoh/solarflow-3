import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from './EmptyState';
import { cn } from '@/lib/utils';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

export interface ColumnDef<T> extends ColumnVisibilityMeta {
  cell: (item: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
}

export interface MetaTableProps<T> {
  columns: ColumnDef<T>[];
  hidden: Set<string>;
  items: T[];
  getRowKey: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  rowClassName?: (item: T) => string | undefined;
  tableClassName?: string;
}

function alignClass(align?: 'left' | 'right' | 'center'): string | undefined {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return undefined;
}

export function MetaTable<T>({
  columns, hidden, items, getRowKey, onRowClick,
  emptyMessage, emptyAction, rowClassName, tableClassName,
}: MetaTableProps<T>) {
  if (items.length === 0) {
    return (
      <EmptyState
        message={emptyMessage}
        actionLabel={emptyAction?.label}
        onAction={emptyAction?.onClick}
      />
    );
  }
  const visible = columns.filter((c) => !hidden.has(c.key));
  return (
    <Table className={cn('text-xs', tableClassName)}>
      <TableHeader>
        <TableRow>
          {visible.map((c) => (
            <TableHead key={c.key} className={cn(alignClass(c.align), c.headerClassName)}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow
            key={getRowKey(item)}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            className={cn(onRowClick && 'cursor-pointer', rowClassName?.(item))}
          >
            {visible.map((c) => (
              <TableCell key={c.key} className={cn(alignClass(c.align), c.className)}>
                {c.cell(item)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default MetaTable;
