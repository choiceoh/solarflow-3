import { BrainCircuit } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { AIMatchSuggestion } from '@/types/orders';

interface Props {
  suggestion: AIMatchSuggestion;
}

export default function AIMatchSuggestionPanel({ suggestion }: Props) {
  const hasCandidates = suggestion.candidates.length > 0;
  return (
    <div className="rounded-md border border-violet-300 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-800/50 dark:bg-violet-950/20 dark:text-violet-100">
      <div className="flex items-start gap-2">
        <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{suggestion.summary}</div>
          {hasCandidates ? (
            <div className="mt-2 space-y-1">
              {suggestion.candidates.map((candidate) => (
                <div key={candidate.outbound_id} className="flex justify-between gap-2 border-t border-violet-200/70 pt-1 dark:border-violet-800/40">
                  <span className="min-w-0 truncate">
                    {candidate.site_name ?? '현장 미지정'} · {candidate.product_name}
                    <span className="ml-1 text-violet-700/80 dark:text-violet-200/80">
                      {Math.round(candidate.confidence * 100)}%
                    </span>
                    {candidate.is_partial && (
                      <span className="ml-1 rounded-sm bg-violet-100 px-1 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-100">
                        부분
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold">{formatNumber(candidate.match_amount)}원</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-violet-200/70 pt-1 font-semibold dark:border-violet-800/40">
                <span>AI 후보 합계</span>
                <span>{formatNumber(suggestion.total_suggested)}원</span>
              </div>
            </div>
          ) : (
            <div className="mt-1 text-violet-700/80 dark:text-violet-200/80">확정할 만한 후보가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
