import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { buildTableSummary, type TableSummaryMode } from '@/lib/tableSummary';
import EmptyState from './EmptyState';

type Align = 'left' | 'right' | 'center';

export interface GroupedMiniTableColumn<T> {
  key: string;
  label: ReactNode;
  align?: Align;
  className?: string;
  headerClassName?: string;
  summary?: TableSummaryMode;
  summaryAccessor?: (item: T) => number | null | undefined;
  summaryFormatter?: (value: number, rows: T[]) => ReactNode;
  render: (item: T, index: number) => ReactNode;
}

export interface GroupedMiniTableFooterCell {
  key?: string;
  content?: ReactNode;
  colSpan?: number;
  align?: Align;
  className?: string;
}

interface GroupedMiniTableProps<T> {
  columns: GroupedMiniTableColumn<T>[];
  data: T[];
  getRowKey: (item: T, index: number) => string;
  emptyMessage: string;
  footerCells?: GroupedMiniTableFooterCell[];
  minWidthClassName?: string;
  className?: string;
  tableClassName?: string;
  rowClassName?: string | ((item: T, index: number) => string | undefined);
  onRowClick?: (item: T, index: number) => void;
  rowTitle?: string | ((item: T, index: number) => string | undefined);
  renderAfterRow?: (item: T, index: number) => ReactNode;
}

function alignClass(align: Align | undefined) {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

export default function GroupedMiniTable<T>({
  columns,
  data,
  getRowKey,
  emptyMessage,
  footerCells,
  minWidthClassName,
  className,
  tableClassName,
  rowClassName,
  onRowClick,
  rowTitle,
  renderAfterRow,
}: GroupedMiniTableProps<T>) {
  if (data.length === 0) return <EmptyState message={emptyMessage} />;

  const summaryCells = buildTableSummary(columns, data, (column, item) => (item as Record<string, unknown>)[column.key]);
  const resolvedFooterCells: GroupedMiniTableFooterCell[] | undefined = footerCells && footerCells.length > 0
    ? footerCells
    : summaryCells.size > 0
      ? columns.map((column, index) => ({
          key: column.key,
          content: index === 0 ? (
            <span className="whitespace-nowrap font-medium">
              합계 · {data.length.toLocaleString('ko-KR')}건
            </span>
          ) : summaryCells.get(column.key) ?? null,
          align: column.align,
          className: summaryCells.has(column.key) ? 'font-mono font-medium tabular-nums' : undefined,
        }))
      : undefined;

  return (
    <div className={cn('rounded-md border overflow-x-auto', className)}>
      <table className={cn('w-full text-xs', minWidthClassName, tableClassName)}>
        <thead>
          <tr className="border-b bg-muted/20">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-3 py-1.5 font-medium text-muted-foreground',
                  alignClass(column.align),
                  column.headerClassName,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            const rowKey = getRowKey(item, index);
            const resolvedRowClassName = typeof rowClassName === 'function'
              ? rowClassName(item, index)
              : rowClassName;
            const resolvedRowTitle = typeof rowTitle === 'function'
              ? rowTitle(item, index)
              : rowTitle;
            return (
              <Fragment key={rowKey}>
                <tr
                  className={cn('border-t hover:bg-muted/10', onRowClick && 'cursor-pointer', resolvedRowClassName)}
                  onClick={onRowClick ? () => onRowClick(item, index) : undefined}
                  title={resolvedRowTitle}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn('px-3 py-2', alignClass(column.align), column.className)}
                    >
                      {column.render(item, index)}
                    </td>
                  ))}
                </tr>
                {renderAfterRow?.(item, index)}
              </Fragment>
            );
          })}
        </tbody>
        {resolvedFooterCells && resolvedFooterCells.length > 0 && (
          <tfoot>
            <tr className="border-t bg-muted/20">
              {resolvedFooterCells.map((cell, index) => (
                <td
                  key={cell.key ?? index}
                  colSpan={cell.colSpan}
                  className={cn('px-3 py-1.5', alignClass(cell.align), cell.className)}
                >
                  {cell.content}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
