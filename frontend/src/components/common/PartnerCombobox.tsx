import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, CheckIcon, SearchIcon, PlusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchWithAuth } from '@/lib/api';
import type { Partner } from '@/types/masters';

interface Props {
  partners: Partner[];
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  creatable?: boolean;
  createType?: 'supplier' | 'customer' | 'both';
  onCreated?: (partner: Partner) => void;
}

export function PartnerCombobox({
  partners,
  value,
  onChange,
  error,
  placeholder = '선택',
  creatable = false,
  createType = 'customer',
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = partners.find((p) => p.partner_id === value);
  const filtered = search
    ? partners.filter((p) => p.partner_name.toLowerCase().includes(search.toLowerCase()))
    : partners;
  const hasCreateAction = creatable && !creating;
  const optionCount = filtered.length + (hasCreateAction ? 1 : 0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
        setCreating(false);
        setCreateError('');
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
  }, [search, creating]);

  useEffect(() => {
    if (optionCount === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= optionCount) setActiveIndex(optionCount - 1);
  }, [activeIndex, optionCount]);

  function handleSelect(partnerId: string) {
    onChange(partnerId);
    setOpen(false);
    setSearch('');
    setCreating(false);
    setCreateError('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setSearch('');
      setCreating(false);
      return;
    }
    if (creating || optionCount === 0) return;
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
      if (activeIndex < filtered.length) {
        handleSelect(filtered[activeIndex].partner_id);
        return;
      }
      if (hasCreateAction) {
        setCreating(true);
        setNewName(search.trim());
        setCreateError('');
      }
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;

    const existing = partners.find((p) => p.partner_name.trim() === name);
    if (existing) {
      handleSelect(existing.partner_id);
      return;
    }

    setSaving(true);
    setCreateError('');
    try {
      const created = await fetchWithAuth<Partner>('/api/v1/partners', {
        method: 'POST',
        body: JSON.stringify({
          partner_name: name,
          partner_type: createType,
        }),
      });
      onCreated?.(created);
      handleSelect(created.partner_id);
      setNewName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '거래처 등록에 실패했습니다');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setSearch('');
            setCreating(false);
          }
        }}
        aria-expanded={open}
        aria-invalid={error}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent h-8 py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'dark:bg-input/30 dark:hover:bg-input/50',
          error && 'border-destructive ring-3 ring-destructive/20 dark:border-destructive/50 dark:ring-destructive/40',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex-1 text-left truncate">{selected?.partner_name ?? placeholder}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground shrink-0 pointer-events-none" />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full mt-1 w-full min-w-[12rem] rounded-lg border border-border bg-popover text-popover-foreground shadow-md overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border">
            <SearchIcon className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..."
              className="flex-1 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
            ) : (
              filtered.map((p, index) => (
                <button
                  key={p.partner_id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => handleSelect(p.partner_id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                    activeIndex === index && 'bg-accent text-accent-foreground',
                    value === p.partner_id && 'bg-accent/40',
                  )}
                >
                  <span className="size-3.5 shrink-0 flex items-center justify-center">
                    {value === p.partner_id && <CheckIcon className="size-3.5" />}
                  </span>
                  <span className="flex-1 truncate">{p.partner_name}</span>
                </button>
              ))
            )}
          </div>
          {creatable && !creating && (
            <button
              type="button"
              onMouseEnter={() => setActiveIndex(filtered.length)}
              onClick={() => {
                setCreating(true);
                setNewName(search.trim());
                setCreateError('');
              }}
              className={cn(
                'flex w-full items-center gap-2 border-t px-2.5 py-2 text-sm text-primary transition-colors hover:bg-accent',
                activeIndex === filtered.length && 'bg-accent',
              )}
            >
              <PlusIcon className="size-3.5" />
              신규 거래처 등록{search.trim() ? ` "${search.trim()}"` : ''}
            </button>
          )}
          {creatable && creating && (
            <div className="space-y-2 border-t bg-muted/20 p-2.5">
              <div className="text-xs font-medium text-muted-foreground">신규 거래처 등록</div>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCreate();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setCreating(false);
                    setCreateError('');
                  }
                }}
                placeholder="거래처명 *"
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring"
              />
              {createError && <div className="text-xs text-destructive">{createError}</div>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || saving}
                  className="flex-1 rounded bg-primary py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? '등록 중...' : '등록'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setCreateError(''); }}
                  className="rounded border border-input px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
