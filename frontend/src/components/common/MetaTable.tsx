import { useMemo, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef as TSColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from './EmptyState';
import { cn } from '@/lib/utils';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import { useColumnWidths, type ColumnSizingState } from '@/lib/columnWidths';
import { useColumnSort, type SortingState } from '@/lib/columnSort';

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
  /**
   * 정렬 옵트인 — 함수가 주어지면 해당 컬럼 헤더가 클릭 정렬 가능해짐.
   * cell 이 자유 JSX 라 정렬에 쓸 원본 값을 명시 (string | number | Date | null).
   * 예) sortAccessor: (ob) => ob.outbound_date
   */
  sortAccessor?: (item: T) => string | number | Date | null | undefined;
}

export interface MetaTableProps<T> {
  /** localStorage scope — 컬럼 폭/정렬 영속 저장에 사용. 미지정 시 영속 비활성. */
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
  // ─── 영속 hooks — tableId 없으면 빈 scope 로 비영속 동작 ──────────────────
  const widths = useColumnWidths(tableId ?? '');
  const sortPersist = useColumnSort(tableId ?? '');
  const persistEnabled = !!tableId;

  // ─── visibility — 외부에서 받은 hidden Set 을 TanStack 형태로 변환 ───────
  const columnVisibility: VisibilityState = useMemo(() => {
    const v: VisibilityState = {};
    for (const c of columns) v[c.key] = !hidden.has(c.key);
    return v;
  }, [columns, hidden]);

  // ─── TanStack column defs ────────────────────────────────────────────────
  const tsColumns = useMemo<TSColumnDef<T>[]>(() => columns.map((c) => {
    const accessor = c.sortAccessor;
    return {
      id: c.key,
      header: c.label,
      cell: ({ row }) => c.cell(row.original),
      // 정렬: accessor 가 있으면 enableSorting + accessorFn 으로 값 추출
      enableSorting: !!accessor,
      accessorFn: accessor ? (row: T) => {
        const v = accessor(row);
        // Date 는 timestamp 로, null/undefined 는 정렬 시 뒤로 가도록 빈 문자열로
        if (v == null) return '';
        if (v instanceof Date) return v.getTime();
        return v;
      } : undefined,
      sortUndefined: 'last' as const,
      enableHiding: c.hideable ?? false,
      enableResizing: c.resizable !== false,
      size: c.defaultWidth ?? 150,
      minSize: c.minWidth ?? 40,
      maxSize: c.maxWidth ?? 800,
      meta: { align: c.align, className: c.className, headerClassName: c.headerClassName } as { align?: 'left' | 'right' | 'center'; className?: string; headerClassName?: string },
    };
  }), [columns]);

  // ─── useReactTable ───────────────────────────────────────────────────────
  const table = useReactTable({
    data: items,
    columns: tsColumns,
    state: {
      columnVisibility,
      columnSizing: persistEnabled ? widths.sizing : {},
      sorting: persistEnabled ? sortPersist.sorting : [],
    },
    onColumnSizingChange: persistEnabled
      ? (updater) => widths.setSizing(updater as ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState))
      : undefined,
    onSortingChange: persistEnabled
      ? (updater) => sortPersist.setSorting(updater as SortingState | ((prev: SortingState) => SortingState))
      : undefined,
    columnResizeMode: 'onChange',
    enableColumnResizing: persistEnabled,
    enableSortingRemoval: true,  // 두 번째 클릭 후 한 번 더 클릭하면 정렬 해제
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
              return (
                <TableHead
                  key={header.id}
                  className={cn('relative', alignClass(meta?.align), meta?.headerClassName)}
                  style={{ width: header.getSize() }}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        'inline-flex items-center gap-1 select-none',
                        'hover:text-foreground transition-colors',
                        sorted ? 'text-foreground font-semibold' : 'text-muted-foreground',
                        meta?.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon className={cn('h-3 w-3 shrink-0', !sorted && 'opacity-40')} />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
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
