// 전체 화면 검색 페이지 (Step 31)
import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { useSearch } from '@/hooks/useSearch';
import { MasterConsole } from '@/components/command/MasterConsole';
import { RailBlock, Sparkline } from '@/components/command/MockupPrimitives';
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

  const resultCount = result?.results.length ?? 0;
  const warningCount = result?.warnings.length ?? 0;
  const keywordCount = result?.parsed.keywords.length ?? 0;

  return (
    <MasterConsole
      eyebrow="GLOBAL SEARCH"
      title="검색"
      description="재고, L/C, 입고, 출고, 거래처를 자연어로 찾아 업무 화면으로 이동합니다."
      tableTitle="검색 워크벤치"
      tableSub={query ? `"${query}"` : '자연어 질의 대기'}
      metrics={[
        { label: '결과', value: resultCount.toLocaleString(), sub: result?.intent || '검색 전', tone: resultCount > 0 ? 'solar' : 'ink', spark: [1, 3, 2, 5, Math.max(resultCount, 1)] },
        { label: '키워드', value: keywordCount.toLocaleString(), sub: result?.parsed.keywords.join(', ') || '없음', tone: 'info' },
        { label: '경고', value: warningCount.toLocaleString(), sub: error ?? '정상', tone: warningCount || error ? 'warn' : 'pos' },
        { label: '상태', value: loading ? 'LOAD' : result ? 'DONE' : 'READY', sub: loading ? '검색 중' : '입력 가능', tone: loading ? 'warn' : 'pos' },
      ]}
      rail={
        <>
          <RailBlock title="검색 예시" accent="var(--solar-3)" count="natural">
            <div className="space-y-2 text-[11px] leading-5 text-[var(--ink-3)]">
              <p>진코 640 재고</p>
              <p>LC 만기</p>
              <p>이번 달 출고</p>
            </div>
          </RailBlock>
          <RailBlock title="검색 신호" count={result?.calculated_at ? 'synced' : 'idle'}>
            <Sparkline data={[8, 12, 10, 18, 16, 22]} color="var(--solar-3)" area />
            <div className="mt-2 text-[11px] leading-5 text-[var(--ink-3)]">법인 선택 상태에 맞춰 계산 API가 결과를 병합합니다.</div>
          </RailBlock>
        </>
      }
    >
      <div className="mx-auto max-w-3xl space-y-6">

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
    </MasterConsole>
  );
}
