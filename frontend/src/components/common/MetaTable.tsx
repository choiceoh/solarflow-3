import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef as TSColumnDef,
  type ColumnPinningState,
  type ColumnOrderState,
  type FilterFn,
  type Column,
  type VisibilityState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from './EmptyState';
import { cn } from '@/lib/utils';
import { buildTableSummary, type TableSummaryMode } from '@/lib/tableSummary';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import { useColumnWidths, type ColumnSizingState } from '@/lib/columnWidths';
import { useColumnSort, type SortingState } from '@/lib/columnSort';
import type { ColumnPinningState as SfColumnPinningState } from '@/lib/columnPinning';
import { useColumnOrder, resolveOrder } from '@/lib/columnOrder';
import { useColumnReorderMode } from '@/lib/columnReorderMode';

export interface ColumnDef<T> extends ColumnVisibilityMeta {
  cell: (item: T) => ReactNode;
  /** 헤더 셀 커스텀 렌더 — 기본 라벨(+정렬 아이콘) 대신 이 결과를 사용.
   * 예: 모두선택 체크박스. headerCell 이 있으면 정렬 옵트인은 무시됨. */
  headerCell?: () => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  /** 폭 조절 가능 여부 — 기본 true. actions 같은 고정 폭 컬럼만 false 권장. */
  resizable?: boolean;
  /** 사용자 순서 변경(드래그) 가능 여부 — 기본 true. */
  reorderable?: boolean;
  /** 사용자 고정(pin) 가능 여부 — 기본 true. 액션·셀렉트 컬럼은 false 권장. */
  pinnable?: boolean;
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
  /**
   * 글로벌 검색 시 매칭 대상 텍스트. 미지정이면 cell 결과 텍스트화 fallback (오버헤드 큼).
   * 명시하면 검색이 정확하고 빠름. 예) globalFilterText: (ob) => ob.product_name ?? ''
   */
  globalFilterText?: (item: T) => string;
  /**
   * 하단 합계 줄. 미지정 시 컬럼 key/label 기준으로 합산 가능한 숫자만 자동 합산.
   * 단가·환율·규격·일수처럼 더하면 안 되는 값은 자동 제외한다.
   */
  summary?: TableSummaryMode;
  summaryAccessor?: (item: T) => number | null | undefined;
  summaryFormatter?: (value: number, rows: T[]) => ReactNode;
}

export interface MetaTableProps<T> {
  /** localStorage scope — 컬럼 폭/정렬/고정/순서 영속 저장에 사용. 미지정 시 영속 비활성. */
  tableId?: string;
  columns: ColumnDef<T>[];
  hidden: Set<string>;
  items: T[];
  getRowKey: (item: T) => string;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  /** 페이지가 직접 구성한 하단 요약 행. 미지정 시 MetaTable 이 자동 합계를 만든다. */
  footer?: ReactNode;
  /** 단순 테이블 호환용 — 컬럼 폭 합계 대신 부모 폭을 채운다. */
  fillWidth?: boolean;
  rowClassName?: (item: T) => string | undefined;
  tableClassName?: string;
  /** 글로벌 검색어 — 외부(예: ToolbarBar 검색 input)에서 제어. */
  globalFilter?: string;
  /** 글로벌 검색 적용 후 행 갯수 변동 시 호출. tableSub 같은 외부 카운트 표시용. */
  onFilteredRowCountChange?: (count: number) => void;
  /** 컬럼 고정 상태 — ColumnVisibilityMenu 와 공유하도록 페이지가 보유.
   *  미지정 시 고정 비활성. */
  pinning?: SfColumnPinningState;
  /** 고정 상태 변경 콜백 — TanStack 의 onColumnPinningChange 시그니처. */
  onPinningChange?: (next: SfColumnPinningState) => void;
}

function alignClass(align?: 'left' | 'right' | 'center'): string | undefined {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return undefined;
}

/** 고정 컬럼 sticky 위치 계산 — 같은 사이드의 누적 폭. */
function getPinnedStyle<T>(column: Column<T>): CSSProperties | undefined {
  const isPinned = column.getIsPinned();
  if (!isPinned) return undefined;
  if (isPinned === 'left') {
    return {
      position: 'sticky',
      left: column.getStart('left'),
      zIndex: 2,
      background: 'var(--background, #fff)',
    };
  }
  return {
    position: 'sticky',
    right: column.getAfter('right'),
    zIndex: 2,
    background: 'var(--background, #fff)',
  };
}

export function MetaTable<T>({
  tableId, columns, hidden, items, getRowKey, defaultSort, onRowClick,
  emptyMessage, emptyAction, footer, fillWidth, rowClassName, tableClassName, globalFilter,
  onFilteredRowCountChange, pinning, onPinningChange,
}: MetaTableProps<T>) {
  // ─── 영속 hooks — tableId 없으면 빈 scope 로 비영속 동작 ──────────────────
  // 폭/정렬/순서는 MetaTable 이 보유. pinning 은 ColumnVisibilityMenu 와 공유 필요해
  // 페이지가 보유하고 prop 으로 받음.
  const widths = useColumnWidths(tableId ?? '');
  const sortPersist = useColumnSort(tableId ?? '');
  const orderPersist = useColumnOrder(tableId ?? '');
  const reorderMode = useColumnReorderMode(tableId ?? '');
  const persistEnabled = !!tableId;
  const pinningEnabled = !!pinning;

  // 헤더 드래그 임시 상태 — 드롭 대상 표시용
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [localSorting, setLocalSorting] = useState<SortingState>(() => (
    defaultSort ? [{ id: defaultSort.key, desc: defaultSort.direction === 'desc' }] : []
  ));

  // ─── visibility — 외부에서 받은 hidden Set 을 TanStack 형태로 변환 ───────
  const columnVisibility: VisibilityState = useMemo(() => {
    const v: VisibilityState = {};
    for (const c of columns) v[c.key] = !hidden.has(c.key);
    return v;
  }, [columns, hidden]);

  // ─── 컬럼 순서 해결 (저장값 + 현재 컬럼 병합) ────────────────────────────
  const defaultIds = useMemo(() => columns.map((c) => c.key), [columns]);
  const resolvedOrder: ColumnOrderState = useMemo(
    () => persistEnabled ? resolveOrder(orderPersist.order, defaultIds) : defaultIds,
    [persistEnabled, orderPersist.order, defaultIds],
  );

  // ─── TanStack column defs ────────────────────────────────────────────────
  const tsColumns = useMemo<TSColumnDef<T>[]>(() => columns.map((c) => {
    const accessor = c.sortAccessor;
    return {
      id: c.key,
      header: c.label,
      cell: ({ row }) => c.cell(row.original),
      enableSorting: !!accessor,
      accessorFn: accessor ? (row: T) => {
        const v = accessor(row);
        if (v == null) return '';
        if (v instanceof Date) return v.getTime();
        return v;
      } : undefined,
      sortUndefined: 'last' as const,
      enableHiding: c.hideable ?? false,
      enableResizing: c.resizable !== false,
      enablePinning: c.pinnable !== false,
      size: c.defaultWidth ?? 150,
      minSize: c.minWidth ?? 40,
      maxSize: c.maxWidth ?? 800,
      meta: {
        align: c.align,
        className: c.className,
        headerClassName: c.headerClassName,
        headerCell: c.headerCell,
        reorderable: c.reorderable !== false,
        globalFilterText: c.globalFilterText,
      } as { align?: 'left' | 'right' | 'center'; className?: string; headerClassName?: string; headerCell?: () => ReactNode; reorderable?: boolean; globalFilterText?: (item: T) => string },
    };
  }), [columns]);

  // ─── 글로벌 필터 함수 — 모든 컬럼의 globalFilterText 결과를 OR 매치 ──────
  const globalFilterFn: FilterFn<T> = useMemo(() => (row, _columnId, filterValue: string) => {
    if (!filterValue) return true;
    const q = String(filterValue).toLowerCase();
    for (const c of columns) {
      if (!c.globalFilterText) continue;
      const text = c.globalFilterText(row.original).toLowerCase();
      if (text.includes(q)) return true;
    }
    return false;
  }, [columns]);

  // ─── useReactTable ───────────────────────────────────────────────────────
  const table = useReactTable({
    data: items,
    columns: tsColumns,
    state: {
      columnVisibility,
      columnSizing: persistEnabled ? widths.sizing : {},
      sorting: persistEnabled ? sortPersist.sorting : localSorting,
      columnPinning: (pinning as ColumnPinningState | undefined) ?? { left: [], right: [] },
      columnOrder: resolvedOrder,
      globalFilter: globalFilter ?? '',
    },
    onColumnSizingChange: persistEnabled
      ? (updater) => widths.setSizing(updater as ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState))
      : undefined,
    onSortingChange: persistEnabled
      ? (updater) => sortPersist.setSorting(updater as SortingState | ((prev: SortingState) => SortingState))
      : (updater) => {
          setLocalSorting((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            return next as SortingState;
          });
        },
    onColumnPinningChange: pinningEnabled && onPinningChange
      ? (updater) => {
          const prev = pinning ?? { left: [], right: [] };
          const tsNext = typeof updater === 'function' ? updater({ left: prev.left, right: prev.right }) : updater;
          onPinningChange({ left: tsNext.left ?? [], right: tsNext.right ?? [] });
        }
      : undefined,
    onColumnOrderChange: persistEnabled
      ? (updater) => orderPersist.setOrder(updater as ColumnOrderState | ((prev: ColumnOrderState) => ColumnOrderState))
      : undefined,
    columnResizeMode: 'onChange',
    enableColumnResizing: persistEnabled,
    enableColumnPinning: pinningEnabled,
    enableSortingRemoval: true,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => getRowKey(row),
  });

  // 필터된 행 갯수 변동 시 외부 알림 (tableSub 카운트 표시 등)
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const filteredRows = table.getFilteredRowModel().rows.map((row) => row.original);
  const summaryCells = useMemo(
    () => buildTableSummary(columns, filteredRows, (column, row) => {
      const source = columns.find((c) => c.key === column.key);
      if (source?.sortAccessor) return source.sortAccessor(row);
      return (row as Record<string, unknown>)[column.key];
    }),
    [columns, filteredRows],
  );
  useEffect(() => {
    onFilteredRowCountChange?.(filteredRowCount);
  }, [filteredRowCount, onFilteredRowCountChange]);

  if (items.length === 0) {
    return (
      <EmptyState
        message={emptyMessage}
        actionLabel={emptyAction?.label}
        onAction={emptyAction?.onClick}
      />
    );
  }

  // 헤더 드래그 핸들러
  const onHeaderDragStart = (e: React.DragEvent, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/sf-col', columnId);
  };
  const onHeaderDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== columnId) setDragOverId(columnId);
  };
  const onHeaderDragLeave = () => setDragOverId(null);
  const onHeaderDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const sourceId = e.dataTransfer.getData('text/sf-col');
    if (!sourceId || sourceId === targetId) return;
    if (!persistEnabled) return;
    orderPersist.setOrder(() => {
      const current = resolvedOrder.length ? resolvedOrder : defaultIds;
      const without = current.filter((x) => x !== sourceId);
      const idx = without.indexOf(targetId);
      if (idx === -1) return [...without, sourceId];
      return [...without.slice(0, idx), sourceId, ...without.slice(idx)];
    });
  };

  return (
    <Table
      className={cn('text-xs', tableClassName)}
      style={
        fillWidth
          ? { width: '100%', minWidth: table.getTotalSize(), tableLayout: 'fixed' }
          : { width: table.getTotalSize(), tableLayout: 'fixed' }
      }
    >
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((header) => {
              const meta = header.column.columnDef.meta as { align?: 'left' | 'right' | 'center'; headerClassName?: string; headerCell?: () => ReactNode; reorderable?: boolean } | undefined;
              const canResize = header.column.getCanResize();
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
              const reorderable = persistEnabled && (meta?.reorderable !== false);
              // 폭 조정 핸들과 충돌 방지 — 토글 ON 동안만 헤더 draggable.
              const dragActive = reorderable && reorderMode.enabled;
              const pinSide = header.column.getIsPinned() as 'left' | 'right' | false;
              const pinnedStyle = getPinnedStyle(header.column);
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    'relative',
                    alignClass(meta?.align),
                    meta?.headerClassName,
                    dragOverId === header.id && 'sf-col-drop-target',
                    dragActive && 'sf-col-reorder-active',
                    pinSide === 'left' && 'sf-col-pinned-left',
                    pinSide === 'right' && 'sf-col-pinned-right',
                  )}
                  style={{ width: header.getSize(), ...pinnedStyle }}
                  draggable={dragActive}
                  onDragStart={dragActive ? (e) => onHeaderDragStart(e, header.id) : undefined}
                  onDragOver={dragActive ? (e) => onHeaderDragOver(e, header.id) : undefined}
                  onDragLeave={dragActive ? onHeaderDragLeave : undefined}
                  onDrop={dragActive ? (e) => onHeaderDrop(e, header.id) : undefined}
                >
                  {meta?.headerCell ? (
                    meta.headerCell()
                  ) : canSort ? (
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
              const pinSide = cell.column.getIsPinned() as 'left' | 'right' | false;
              const pinnedStyle = getPinnedStyle(cell.column);
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    alignClass(meta?.align),
                    meta?.className,
                    pinSide === 'left' && 'sf-col-pinned-left',
                    pinSide === 'right' && 'sf-col-pinned-right',
                  )}
                  style={{ width: cell.column.getSize(), ...pinnedStyle }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
      {filteredRowCount > 0 && (footer || summaryCells.size > 0) && (
        <TableFooter>
          {footer ?? (
            <TableRow>
              {table.getVisibleLeafColumns().map((column, idx) => {
                const meta = column.columnDef.meta as { align?: 'left' | 'right' | 'center'; className?: string } | undefined;
                const pinSide = column.getIsPinned() as 'left' | 'right' | false;
                const pinnedStyle = getPinnedStyle(column);
                const content = summaryCells.get(column.id);
                const hasSummary = idx !== 0 && content != null;
                return (
                  <TableCell
                    key={column.id}
                    className={cn(
                      alignClass(meta?.align),
                      hasSummary && 'tabular-nums font-medium',
                      hasSummary && !meta?.align && 'text-right',
                      pinSide === 'left' && 'sf-col-pinned-left',
                      pinSide === 'right' && 'sf-col-pinned-right',
                    )}
                    style={{ width: column.getSize(), ...pinnedStyle }}
                  >
                    {idx === 0 ? (
                      <span className="whitespace-nowrap font-medium">
                        합계 · {filteredRowCount.toLocaleString('ko-KR')}건
                      </span>
                    ) : content ?? null}
                  </TableCell>
                );
              })}
            </TableRow>
          )}
        </TableFooter>
      )}
    </Table>
  );
}

export default MetaTable;
