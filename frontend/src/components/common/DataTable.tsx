import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
    // 비활성: 옅은 잉크-5, 활성: 솔라-3 강조
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

  return (
    <div className="space-y-3">
      {searchable && onSearch && (
        <SearchInput placeholder={searchPlaceholder} onChange={onSearch} />
      )}
      <div className="rounded-md border">
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
                <TableCell colSpan={columns.length + (actions ? 1 : 0)}>
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
      </div>
    </div>
  );
}
