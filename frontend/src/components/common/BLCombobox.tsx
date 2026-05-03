import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, CheckIcon, SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusLabel, type BLShipment } from '@/types/inbound';

interface Props {
  bls: BLShipment[];
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  // 부모가 product/order 컨텍스트로 풍부 라벨을 만들고 싶을 때 주입.
  // 미주입 시 BL 자체 정보(manufacturer_name)로 라벨 구성.
  formatModule?: (bl: BLShipment) => string;
}

function blDate(b: BLShipment): string {
  return b.actual_arrival?.slice(0, 10) ?? b.eta?.slice(0, 10) ?? '—';
}

function defaultModule(b: BLShipment): string {
  return b.manufacturer_name ?? '—';
}

function blKeywords(b: BLShipment): string {
  return [
    b.bl_number,
    b.manufacturer_name,
    b.port,
    b.forwarder,
    statusLabel(b.inbound_type, b.status),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function BLCombobox({
  bls,
  value,
  onChange,
  error,
  placeholder = '— B/L 선택 —',
  triggerRef,
  formatModule,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const moduleOf = formatModule ?? defaultModule;
  const selected = bls.find((b) => b.bl_id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bls;
    return bls.filter((b) => blKeywords(b).includes(q));
  }, [bls, search]);

  const optionCount = filtered.length + 1; // + "선택 안함"

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  function handleSelect(blId: string) {
    onChange(blId);
    setOpen(false);
    setSearch('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setSearch('');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((idx) => (idx + 1) % optionCount);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((idx) => (idx - 1 + optionCount) % optionCount);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (activeIndex === 0) {
        handleSelect('');
        return;
      }
      const blIndex = activeIndex - 1;
      if (blIndex >= 0 && blIndex < filtered.length) {
        handleSelect(filtered[blIndex].bl_id);
      }
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setSearch('');
          }
        }}
        aria-expanded={open}
        aria-invalid={error}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 rounded-md border border-input bg-background h-8 py-1 pr-2 pl-2.5 text-xs shadow-sm transition-colors outline-none select-none hover:border-foreground/20',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45',
          'dark:bg-input/30 dark:hover:bg-input/50',
          error && 'border-destructive ring-2 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex-1 text-left truncate">
          {selected
            ? `${moduleOf(selected)} | ${selected.bl_number} | ${blDate(selected)} | ${statusLabel(selected.inbound_type, selected.status)}`
            : placeholder}
        </span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground shrink-0 pointer-events-none" />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 w-full min-w-[18rem] overflow-hidden rounded-md border border-border/70 bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border">
            <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="BL번호/제조사/항구/포워더/상태 검색"
              className="flex-1 text-xs outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              onMouseEnter={() => setActiveIndex(0)}
              onClick={() => handleSelect('')}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                activeIndex === 0 && 'bg-accent text-accent-foreground',
                value === '' && 'bg-accent/40',
              )}
            >
              <span className="size-3.5 shrink-0 flex items-center justify-center">
                {value === '' && <CheckIcon className="size-3.5" />}
              </span>
              <span className="flex-1 truncate text-muted-foreground">— 선택 안함 —</span>
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">결과 없음</div>
            ) : (
              filtered.map((b, index) => {
                const isCompleted = ['completed', 'erp_done'].includes(b.status);
                const stKo = statusLabel(b.inbound_type, b.status);
                return (
                  <button
                    key={b.bl_id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index + 1)}
                    onClick={() => handleSelect(b.bl_id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                      activeIndex === index + 1 && 'bg-accent text-accent-foreground',
                      value === b.bl_id && 'bg-accent/40',
                    )}
                  >
                    <span className="size-3.5 shrink-0 flex items-center justify-center">
                      {value === b.bl_id && <CheckIcon className="size-3.5" />}
                    </span>
                    <span className="flex-1 truncate">
                      <span className={`font-medium mr-1.5 ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}>
                        [{stKo}]
                      </span>
                      {moduleOf(b)} | {b.bl_number} | {blDate(b)}
                      {(b.port || b.forwarder) && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {b.port ? ` · ${b.port}` : ''}{b.forwarder ? ` · ${b.forwarder}` : ''}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
