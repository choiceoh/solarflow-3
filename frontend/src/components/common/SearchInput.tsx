import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface SearchInputProps {
  placeholder?: string;
  onChange: (value: string) => void;
}

export default function SearchInput({ placeholder = '검색...', onChange }: SearchInputProps) {
  const [value, setValue] = useState('');
  const onChangeRef = useRef(onChange);

  // ref 갱신은 effect에서 (렌더 중 ref.current 쓰기 = react-hooks/refs 위반)
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const debouncedChange = useCallback((val: string) => {
    onChangeRef.current(val);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => debouncedChange(value), 300);
    return () => clearTimeout(timer);
  }, [value, debouncedChange]);

  return (
    <div className="relative w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sf-ink-4)]" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => setValue('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--sf-ink-4)] transition-colors hover:text-[var(--sf-ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
