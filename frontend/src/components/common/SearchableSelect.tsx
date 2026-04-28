import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  keywords?: string;
}

interface Props {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '선택',
  searchPlaceholder = '검색...',
  emptyMessage = '결과 없음',
  disabled = false,
  error = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.keywords ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, search]);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 드롭다운 open 시 활성 인덱스 초기화 (open prop 동기화)
      setActiveIndex(0);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 검색어 변경 시 활성 인덱스 초기화 (search 동기화)
    setActiveIndex(0);
  }, [search]);

  useEffect(() => {
    if (filtered.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 필터링 결과 비었을 때 인덱스 0으로 (filtered.length 동기화)
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= filtered.length) setActiveIndex(filtered.length - 1);
  }, [activeIndex, filtered.length]);

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setSearch('');
  }

  function handleOpenKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
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
      handleSelect(filtered[activeIndex].value);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleOpenKeyDown}
        aria-expanded={open}
        aria-invalid={error}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors hover:border-foreground/20',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive ring-2 ring-destructive/20',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex-1 truncate text-left">{selected?.label ?? placeholder}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full min-w-[16rem] overflow-hidden rounded-md border border-border/70 bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
          onKeyDown={handleListKeyDown}
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
            ) : (
              filtered.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                    activeIndex === index && 'bg-accent text-accent-foreground',
                    value === option.value && 'bg-accent/40',
                  )}
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {value === option.value && <CheckIcon className="size-3.5" />}
                  </span>
                  <span className="flex-1 truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
