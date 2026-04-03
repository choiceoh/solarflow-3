// 전체 화면 검색 페이지 (Step 31)
import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useSearch } from '@/hooks/useSearch';
import SearchResultPanel from '@/components/search/SearchResultPanel';
import SearchHistory from '@/components/search/SearchHistory';

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const { result, loading, error, search, clear } = useSearch();

  // URL 파라미터로 전달된 검색어 자동 실행
  useEffect(() => {
    if (initialQuery) search(initialQuery);
  }, [initialQuery, search]);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (q.trim()) search(q);
    else clear();
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Search className="h-5 w-5" />검색
      </h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10 h-10"
          placeholder="자연어로 검색하세요 (예: 진코 640 재고, LC 만기)"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(query); }}
          autoFocus
        />
      </div>

      {(result || loading || error) ? (
        <div className="border rounded-lg">
          <SearchResultPanel result={result} loading={loading} error={error} />
        </div>
      ) : (
        <SearchHistory onSelect={handleSearch} />
      )}
    </div>
  );
}
