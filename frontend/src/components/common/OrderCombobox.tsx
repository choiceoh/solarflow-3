import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, CheckIcon, SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/orders';

interface Props {
  orders: Order[];
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  includeNoneOption?: boolean;
  noneLabel?: string;
}

function numOrZero(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function remainingQty(o: Order): number {
  return Math.max(numOrZero(o.quantity) - numOrZero(o.shipped_qty), 0);
}

function orderShortNo(o: Order): string {
  return o.order_number ?? o.order_id?.slice(0, 8) ?? '—';
}

function orderTriggerLabel(o: Order): string {
  return `${orderShortNo(o)} · 잔량 ${remainingQty(o).toLocaleString('ko-KR')}EA`;
}

function orderOptionLabel(o: Order): string {
  const product = o.product_name ?? o.product_code ?? '';
  return `${orderShortNo(o)} · ${product} · 잔량 ${remainingQty(o).toLocaleString('ko-KR')}EA`;
}

function orderKeywords(o: Order): string {
  return [
    o.order_number,
    o.product_name,
    o.product_code,
    o.customer_name,
    o.site_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function OrderCombobox({
  orders,
  value,
  onChange,
  error,
  placeholder = '수주 검색…',
  triggerRef,
  includeNoneOption = false,
  noneLabel = '연결 안함',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = orders.find((o) => o.order_id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => orderKeywords(o).includes(q));
  }, [orders, search]);

  const noneOffset = includeNoneOption ? 1 : 0;
  const optionCount = filtered.length + noneOffset;

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

  function handleSelect(orderId: string) {
    onChange(orderId);
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
    if (optionCount === 0) return;
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
      if (includeNoneOption && activeIndex === 0) {
        handleSelect('');
        return;
      }
      const orderIndex = activeIndex - noneOffset;
      if (orderIndex >= 0 && orderIndex < filtered.length) {
        handleSelect(filtered[orderIndex].order_id);
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
          'flex w-full items-center justify-between gap-1.5 rounded-md border border-input bg-background h-9 py-2 pr-2 pl-2.5 text-sm shadow-sm transition-colors outline-none select-none hover:border-foreground/20',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45',
          'dark:bg-input/30 dark:hover:bg-input/50',
          error && 'border-destructive ring-2 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex-1 text-left truncate">
          {selected ? orderTriggerLabel(selected) : placeholder}
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground shrink-0 pointer-events-none" />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 w-full min-w-[16rem] overflow-hidden rounded-md border border-border/70 bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border">
            <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="주문번호/품명/거래처/현장 검색"
              className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {includeNoneOption && (
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(0)}
                onClick={() => handleSelect('')}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                  activeIndex === 0 && 'bg-accent text-accent-foreground',
                  value === '' && 'bg-accent/40',
                )}
              >
                <span className="size-3.5 shrink-0 flex items-center justify-center">
                  {value === '' && <CheckIcon className="size-3.5" />}
                </span>
                <span className="flex-1 truncate text-muted-foreground">{noneLabel}</span>
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
            ) : (
              filtered.map((o, index) => (
                <button
                  key={o.order_id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index + noneOffset)}
                  onClick={() => handleSelect(o.order_id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                    activeIndex === index + noneOffset && 'bg-accent text-accent-foreground',
                    value === o.order_id && 'bg-accent/40',
                  )}
                >
                  <span className="size-3.5 shrink-0 flex items-center justify-center">
                    {value === o.order_id && <CheckIcon className="size-3.5" />}
                  </span>
                  <span className="flex-1 truncate">{orderOptionLabel(o)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
