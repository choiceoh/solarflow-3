import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, CheckIcon, SearchIcon } from 'lucide-react';
import { cn, moduleLabel, shortMfgName } from '@/lib/utils';
import type { Product } from '@/types/masters';

interface Props {
  products: Product[];
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

function productLabel(p: Product): string {
  return `${moduleLabel(p.manufacturers ?? p.manufacturer_name, p.spec_wp)} | ${p.product_code} | ${p.product_name}`;
}

function productKeywords(p: Product): string {
  const mfg = p.manufacturers
    ? [p.manufacturers.name_kr, p.manufacturers.short_name, p.manufacturers.name_en].filter(Boolean).join(' ')
    : (p.manufacturer_name ?? '');
  const mfgShort = shortMfgName(mfg);
  return `${p.product_code} ${p.product_name} ${mfg} ${mfgShort} ${p.spec_wp}Wp`.toLowerCase();
}

export function ProductCombobox({
  products,
  value,
  onChange,
  error,
  placeholder = '품번 검색…',
  triggerRef,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = products.find((p) => p.product_id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => productKeywords(p).includes(q));
  }, [products, search]);

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

  function handleSelect(productId: string) {
    onChange(productId);
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
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((idx) => (idx + 1) % filtered.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((idx) => (idx - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSelect(filtered[activeIndex].product_id);
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
        <span className="flex-1 text-left truncate">{selected ? productLabel(selected) : placeholder}</span>
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
              placeholder="품번/품명/제조사/규격 검색"
              className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
            ) : (
              filtered.map((p, index) => (
                <button
                  key={p.product_id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(p.product_id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                    activeIndex === index && 'bg-accent text-accent-foreground',
                    value === p.product_id && 'bg-accent/40',
                  )}
                >
                  <span className="size-3.5 shrink-0 flex items-center justify-center">
                    {value === p.product_id && <CheckIcon className="size-3.5" />}
                  </span>
                  <span className="flex-1 truncate">{productLabel(p)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
