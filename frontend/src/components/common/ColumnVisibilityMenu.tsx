import { Columns, Pin, PinOff } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export interface ColumnVisibilityMenuProps {
  columns: ColumnVisibilityMeta[];
  hidden: Set<string>;
  setHidden: (next: Set<string>) => void;
  /** 영속 가능한 컬럼 고정 — 미지정 시 pin UI 숨김 */
  pinning?: ColumnPinningState;
  pinLeft?: (columnId: string) => void;
  pinRight?: (columnId: string) => void;
  unpin?: (columnId: string) => void;
}

export function ColumnVisibilityMenu({
  columns, hidden, setHidden, pinning, pinLeft, pinRight, unpin,
}: ColumnVisibilityMenuProps) {
  const hideable = columns.filter((c) => c.hideable);
  const pinningEnabled = !!(pinning && pinLeft && pinRight && unpin);
  if (hideable.length === 0 && !pinningEnabled) return null;

  const isPinnedLeft = (key: string) => pinning?.left.includes(key) ?? false;
  const isPinnedRight = (key: string) => pinning?.right.includes(key) ?? false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="sf-toolbar-trigger">
        <Columns style={{ width: 12, height: 12, color: 'var(--ink-3)' }} />
        <span>컬럼</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>컬럼 표시</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hideable.map((c) => {
          const visible = !hidden.has(c.key);
          const left = isPinnedLeft(c.key);
          const right = isPinnedRight(c.key);
          return (
            <div key={c.key} className="flex items-center gap-1 px-1">
              <DropdownMenuCheckboxItem
                className="flex-1"
                checked={visible}
                onCheckedChange={(checked) => {
                  const next = new Set(hidden);
                  if (checked) next.delete(c.key); else next.add(c.key);
                  setHidden(next);
                }}
                onSelect={(e) => e.preventDefault()}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
              {pinningEnabled && (
                <>
                  <button
                    type="button"
                    title={left ? '왼쪽 고정 해제' : '왼쪽 고정'}
                    aria-label={left ? '왼쪽 고정 해제' : '왼쪽 고정'}
                    className={
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ' +
                      (left ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'text-muted-foreground hover:bg-muted')
                    }
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); left ? unpin!(c.key) : pinLeft!(c.key); }}
                  >
                    <Pin className="h-3 w-3 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    title={right ? '오른쪽 고정 해제' : '오른쪽 고정'}
                    aria-label={right ? '오른쪽 고정 해제' : '오른쪽 고정'}
                    className={
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors ' +
                      (right ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'text-muted-foreground hover:bg-muted')
                    }
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); right ? unpin!(c.key) : pinRight!(c.key); }}
                  >
                    <Pin className="h-3 w-3 rotate-90" />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {pinningEnabled && (pinning!.left.length > 0 || pinning!.right.length > 0) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                [...pinning!.left, ...pinning!.right].forEach((id) => unpin!(id));
              }}
              className="text-xs text-muted-foreground"
            >
              <PinOff className="mr-2 h-3 w-3" />모든 고정 해제
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ColumnVisibilityMenu;
