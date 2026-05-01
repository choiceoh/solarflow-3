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
      <div className="px-3 py-6 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-[var(--sf-solar)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--sf-neg)]">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-0">
      {/* 의도 분석 — eyebrow + mono 토큰 */}
      <div className="flex items-center gap-2 border-b border-[var(--sf-line)] bg-[var(--sf-bg-2)] px-3 py-2">
        <span className="sf-eyebrow">의도</span>
        <span className="sf-mono text-[10.5px] font-semibold text-[var(--sf-ink-2)]">{result.intent}</span>
        {result.parsed.manufacturer && (
          <>
            <span className="text-[var(--sf-line-2)]">·</span>
            <span className="sf-eyebrow">제조사</span>
            <span className="sf-mono text-[10.5px] font-semibold text-[var(--sf-ink-2)]">{result.parsed.manufacturer}</span>
          </>
        )}
        {result.parsed.spec_wp && (
          <>
            <span className="text-[var(--sf-line-2)]">·</span>
            <span className="sf-eyebrow">규격</span>
            <span className="sf-mono text-[10.5px] font-semibold text-[var(--sf-ink-2)]">{result.parsed.spec_wp}Wp</span>
          </>
        )}
      </div>

      {/* 경고 — sf-pill warn 패턴 */}
      {result.warnings.length > 0 && (
        <div className="flex flex-col gap-1 border-b border-[var(--sf-line)] px-3 py-2">
          {result.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded bg-[var(--sf-warn-bg)] px-2 py-1 text-[11px] leading-snug text-[var(--sf-warn)]"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* 결과 목록 */}
      {result.results.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-[var(--sf-ink-3)]">
          검색 결과가 없습니다
        </div>
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
