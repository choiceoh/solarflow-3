import { useState, useMemo, useCallback, useRef, type ReactNode } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import SearchInput from './SearchInput';
import EmptyState from './EmptyState';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
}

// 가상 스크롤 옵션 — 테이블이 크면(>=200행 수준) 활성화
export interface VirtualizeOption {
  enabled: boolean;
  estimateSize?: number; // 한 행 추정 높이 (px)
  height?: number;       // 스크롤 영역 높이 (px)
  overscan?: number;     // 미리 그릴 행 수
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataTableProps<T extends Record<string, any>> {
  columns: Column<T>[];
  data: T[];
  loading: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  actions?: (row: T) => ReactNode;
  emptyMessage?: string;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  virtualize?: VirtualizeOption;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
  searchable,
  searchPlaceholder,
  onSearch,
  actions,
  emptyMessage,
  defaultSort,
  virtualize,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSort?.key ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.direction ?? 'asc');

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }, [sortKey]);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp = 0;
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv, 'ko');
      } else {
        cmp = (av as number) - (bv as number);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) {
      return (
        <ArrowUpDown
          className="ml-1 inline h-3 w-3"
          style={{ color: 'var(--sf-ink-5)' }}
        />
      );
    }
    const Icon = sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <Icon
        className="ml-1 inline h-3 w-3"
        style={{ color: 'var(--sf-solar-3)' }}
      />
    );
  };

  const useVirtual = virtualize?.enabled && !loading && sorted.length > 0;
  const colSpan = columns.length + (actions ? 1 : 0);

  return (
    <div className="space-y-3">
      {searchable && onSearch && (
        <SearchInput placeholder={searchPlaceholder} onChange={onSearch} />
      )}
      <div className="rounded-md border">
        {useVirtual ? (
          <VirtualizedTableBody
            columns={columns}
            actions={actions}
            sorted={sorted}
            virtualize={virtualize}
            handleSort={handleSort}
            SortIcon={SortIcon}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={col.sortable ? 'cursor-pointer select-none' : ''}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    {col.label}
                    {col.sortable && <SortIcon col={col.key} />}
                  </TableHead>
                ))}
                {actions && <TableHead className="w-20">수정</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col, ci) => (
                      <TableCell key={col.key}>
                        <div className="sf-skeleton h-4" style={{ width: `${88 - ((i + ci) % 4) * 4}%` }} />
                      </TableCell>
                    ))}
                    {actions && <TableCell><div className="sf-skeleton h-4 w-12" /></TableCell>}
                  </TableRow>
                ))
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan}>
                    <EmptyState message={emptyMessage} />
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row, idx) => (
                  <TableRow key={(row as Record<string, unknown>)['id'] as string ?? idx}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                      </TableCell>
                    ))}
                    {actions && <TableCell>{actions(row)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// 가상 스크롤 본문 — `<table>` 시맨틱을 유지하면서 visible rows만 렌더링
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface VirtualizedTableBodyProps<T extends Record<string, any>> {
  columns: Column<T>[];
  actions?: (row: T) => ReactNode;
  sorted: T[];
  virtualize: VirtualizeOption;
  handleSort: (key: string) => void;
  SortIcon: (props: { col: string }) => ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VirtualizedTableBody<T extends Record<string, any>>({
  columns,
  actions,
  sorted,
  virtualize,
  handleSort,
  SortIcon,
}: VirtualizedTableBodyProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const estimateSize = virtualize.estimateSize ?? 40;
  const height = virtualize.height ?? 600;
  const overscan = virtualize.overscan ?? 8;

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = items.length > 0 ? items[0].start : 0;
  const paddingBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0;

  return (
    <div ref={containerRef} style={{ height, overflow: 'auto' }}>
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={col.sortable ? 'cursor-pointer select-none' : ''}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                {col.label}
                {col.sortable && <SortIcon col={col.key} />}
              </TableHead>
            ))}
            {actions && <TableHead className="w-20">수정</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <tr style={{ height: paddingTop }} aria-hidden="true">
              <td colSpan={columns.length + (actions ? 1 : 0)} />
            </tr>
          )}
          {items.map((virtualRow) => {
            const row = sorted[virtualRow.index];
            return (
              <TableRow
                key={(row as Record<string, unknown>)['id'] as string ?? virtualRow.index}
                style={{ height: estimateSize }}
              >
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                  </TableCell>
                ))}
                {actions && <TableCell>{actions(row)}</TableCell>}
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr style={{ height: paddingBottom }} aria-hidden="true">
              <td colSpan={columns.length + (actions ? 1 : 0)} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
