import { useMemo, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef as TSColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from './EmptyState';
import { cn } from '@/lib/utils';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import { useColumnWidths, type ColumnSizingState } from '@/lib/columnWidths';

export interface ColumnDef<T> extends ColumnVisibilityMeta {
  cell: (item: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  /** 폭 조절 가능 여부 — 기본 true. actions 같은 고정 폭 컬럼만 false 권장. */
  resizable?: boolean;
  /** 기본 폭(px). 미지정이면 TanStack 기본 150. */
  defaultWidth?: number;
  /** 최소 폭(px). 미지정 40. */
  minWidth?: number;
  /** 최대 폭(px). 미지정 800. */
  maxWidth?: number;
}

export interface MetaTableProps<T> {
  /** localStorage scope — 컬럼 폭 영속 저장에 사용. 미지정 시 폭 영속 비활성. */
  tableId?: string;
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
  tableId, columns, hidden, items, getRowKey, onRowClick,
  emptyMessage, emptyAction, rowClassName, tableClassName,
}: MetaTableProps<T>) {
  // ─── 컬럼 폭 (localStorage 영속) — tableId 없으면 비영속 무시 ─────────────
  // 폭 hook 은 항상 호출하되 tableId 없으면 빈 상태로 동작 (Hooks 규칙)
  const widths = useColumnWidths(tableId ?? '');
  const sizingEnabled = !!tableId;

  // ─── visibility state — 외부에서 받은 hidden Set 을 TanStack 형태로 변환 ─
  const columnVisibility: VisibilityState = useMemo(() => {
    const v: VisibilityState = {};
    for (const c of columns) v[c.key] = !hidden.has(c.key);
    return v;
  }, [columns, hidden]);

  // ─── TanStack column defs ────────────────────────────────────────────────
  const tsColumns = useMemo<TSColumnDef<T>[]>(() => columns.map((c) => ({
    id: c.key,
    header: c.label,
    cell: ({ row }) => c.cell(row.original),
    enableHiding: c.hideable ?? false,
    enableResizing: c.resizable !== false,  // 기본 true
    size: c.defaultWidth ?? 150,
    minSize: c.minWidth ?? 40,
    maxSize: c.maxWidth ?? 800,
    meta: { align: c.align, className: c.className, headerClassName: c.headerClassName } as { align?: 'left' | 'right' | 'center'; className?: string; headerClassName?: string },
  })), [columns]);

  // ─── useReactTable ───────────────────────────────────────────────────────
  const table = useReactTable({
    data: items,
    columns: tsColumns,
    state: { columnVisibility, columnSizing: sizingEnabled ? widths.sizing : {} },
    onColumnSizingChange: sizingEnabled
      ? (updater) => {
          // updater 는 함수 또는 객체 — useColumnWidths 가 둘 다 지원
          widths.setSizing(updater as ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState));
        }
      : undefined,
    columnResizeMode: 'onChange',
    enableColumnResizing: sizingEnabled,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => getRowKey(row),
  });

  if (items.length === 0) {
    return (
      <EmptyState
        message={emptyMessage}
        actionLabel={emptyAction?.label}
        onAction={emptyAction?.onClick}
      />
    );
  }

  return (
    <Table className={cn('text-xs', tableClassName)} style={{ width: table.getTotalSize(), tableLayout: 'fixed' }}>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((header) => {
              const meta = header.column.columnDef.meta as { align?: 'left' | 'right' | 'center'; headerClassName?: string } | undefined;
              const canResize = header.column.getCanResize();
              return (
                <TableHead
                  key={header.id}
                  className={cn('relative', alignClass(meta?.align), meta?.headerClassName)}
                  style={{ width: header.getSize() }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {canResize && (
                    <span
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'sf-col-resizer',
                        header.column.getIsResizing() && 'sf-col-resizer-active',
                      )}
                      role="separator"
                      aria-orientation="vertical"
                    />
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
          >
            {row.getVisibleCells().map((cell) => {
              const meta = cell.column.columnDef.meta as { align?: 'left' | 'right' | 'center'; className?: string } | undefined;
              return (
                <TableCell
                  key={cell.id}
                  className={cn(alignClass(meta?.align), meta?.className)}
                  style={{ width: cell.column.getSize() }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default MetaTable;
