import { Eye, RotateCcw, Settings2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { KpiVisibilityOption } from '@/hooks/useKpiVisibility';

interface KpiVisibilityMenuProps {
  options: KpiVisibilityOption[];
  hidden: Set<string>;
  onToggle: (id: string, visible: boolean) => void;
  onReset: () => void;
  saving?: boolean;
  isDefault?: boolean;
  defaultVisibleCount?: number;
}

export function KpiVisibilityMenu({
  options,
  hidden,
  onToggle,
  onReset,
  saving,
  isDefault,
  defaultVisibleCount,
}: KpiVisibilityMenuProps) {
  if (options.length <= 1) return null;
  const visibleCount = options.length - hidden.size;
  const resetLabel =
    defaultVisibleCount != null && options.length > defaultVisibleCount
      ? `기본 ${defaultVisibleCount}개로`
      : '기본 표시';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="sf-toolbar-trigger" disabled={saving}>
        <Settings2 className="h-3 w-3 text-[var(--ink-3)]" />
        <span>KPI</span>
        <span className="sf-mono text-[10px] text-[var(--ink-4)]">{visibleCount}/{options.length}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>KPI 표시</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={!hidden.has(option.id)}
            onCheckedChange={(checked) => onToggle(option.id, !!checked)}
            onSelect={(event) => event.preventDefault()}
          >
            <Eye className="mr-2 h-3 w-3" />
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onReset}
          onSelect={(event) => event.preventDefault()}
          disabled={isDefault}
        >
          <RotateCcw className="mr-2 h-3 w-3" />
          {resetLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default KpiVisibilityMenu;
