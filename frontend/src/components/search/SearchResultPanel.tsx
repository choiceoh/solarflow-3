// 검색 결과 드롭다운 패널 (Step 31)
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import SearchResultCard from './SearchResultCard';

interface Props {
  result: SearchResponse | null;
  loading: boolean;
  error: string | null;
  onNavigate?: () => void;
}

export default function SearchResultPanel({ result, loading, error, onNavigate }: Props) {
  if (loading) {
    return (
      <div className="p-4 text-center">
        <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="p-3 text-sm text-red-600">{error}</div>;
  }

  if (!result) return null;

  return (
    <div className="space-y-1">
      {/* 의도 표시 */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b">
        의도: {result.intent}
        {result.parsed.manufacturer && ` | 제조사: ${result.parsed.manufacturer}`}
        {result.parsed.spec_wp && ` | 규격: ${result.parsed.spec_wp}Wp`}
      </div>

      {/* 경고 */}
      {result.warnings.length > 0 && (
        <div className="px-3 py-1.5">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1 mb-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />{w}
            </div>
          ))}
        </div>
      )}

      {/* 결과 목록 */}
      {result.results.length === 0 ? (
        <div className="px-3 py-4 text-center text-sm text-muted-foreground">검색 결과가 없습니다</div>
      ) : (
        <div className="py-1">
          {result.results.map((r, i) => (
            <SearchResultCard key={i} result={r} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
