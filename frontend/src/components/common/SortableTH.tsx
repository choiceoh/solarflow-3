import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortDirection } from '@/hooks/useSort';

export function SortIcon({ direction, className }: { direction: SortDirection; className?: string }) {
  const Icon = direction === 'asc' ? ChevronUp : direction === 'desc' ? ChevronDown : ChevronsUpDown;
  return <Icon className={cn('h-3 w-3 shrink-0', direction ? 'text-foreground' : 'text-muted-foreground/40', className)} />;
}

interface Props extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> {
  sortKey: string;
  direction: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
  children: React.ReactNode;
}

export default function SortableTH({
  sortKey, direction, onSort, align = 'left', className, children, ...rest
}: Props) {
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      {...rest}
      className={cn('cursor-pointer select-none hover:bg-muted/70 transition-colors', className)}
      onClick={() => onSort(sortKey)}
    >
      <span className={cn('inline-flex items-center gap-1', justify)}>
        {children}
        <SortIcon direction={direction} />
      </span>
    </th>
  );
}
