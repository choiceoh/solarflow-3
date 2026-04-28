import { useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
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
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-8"
      />
    </div>
  );
}
