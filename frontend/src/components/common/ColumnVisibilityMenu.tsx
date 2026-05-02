import { Columns } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

export interface ColumnVisibilityMenuProps {
  columns: ColumnVisibilityMeta[];
  hidden: Set<string>;
  setHidden: (next: Set<string>) => void;
}

export function ColumnVisibilityMenu({ columns, hidden, setHidden }: ColumnVisibilityMenuProps) {
  const hideable = columns.filter((c) => c.hideable);
  if (hideable.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground shadow-sm transition-all hover:bg-muted">
        <Columns className="h-3 w-3" />컬럼
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>컬럼 표시</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((c) => {
          const visible = !hidden.has(c.key);
          return (
            <DropdownMenuCheckboxItem
              key={c.key}
              checked={visible}
              onCheckedChange={(checked) => {
                const next = new Set(hidden);
                if (checked) next.delete(c.key); else next.add(c.key);
                setHidden(next);
              }}
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ColumnVisibilityMenu;
