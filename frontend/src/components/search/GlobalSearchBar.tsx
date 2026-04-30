// 헤더 중앙 글로벌 검색 바 (Step 31)
// Ctrl+K (Mac: Cmd+K) → 포커스
import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useSearch } from '@/hooks/useSearch';
import SearchResultPanel from './SearchResultPanel';

export default function GlobalSearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { result, loading, error, debouncedSearch, clear } = useSearch();
  const navigate = useNavigate();

  // Ctrl+K / Cmd+K 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 외부 클릭으로 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (value.trim()) {
      setOpen(true);
      debouncedSearch(value);
    } else {
      clear();
    }
  };

  const handleNavigate = () => {
    setOpen(false);
    setQuery('');
    clear();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query)}`);
      setOpen(false);
    }
  };

  return (
    <div className="sf-global-search relative" ref={panelRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          className="pl-8 pr-16 h-8 text-sm"
          placeholder="검색 (Ctrl+K)"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (query.trim()) setOpen(true); }}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button className="absolute right-8 top-1/2 -translate-y-1/2" onClick={() => { setQuery(''); clear(); setOpen(false); }}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted px-1 rounded">
          {navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'}
        </kbd>
      </div>

      {open && (query.trim() || result) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-50 max-h-[400px] overflow-auto">
          <SearchResultPanel result={result} loading={loading} error={error} onNavigate={handleNavigate} />
        </div>
      )}
    </div>
  );
}
