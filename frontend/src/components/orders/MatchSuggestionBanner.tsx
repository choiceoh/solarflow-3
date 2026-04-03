import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';
import type { MatchSuggestion } from '@/types/orders';

interface Props {
  suggestion: MatchSuggestion;
}

const MESSAGE: Record<MatchSuggestion['match_type'], string> = {
  exact: '정확히 일치하는 미수금을 찾았습니다',
  closest: '가장 가까운 조합입니다',
  single: '단건 매칭합니다',
};

export default function MatchSuggestionBanner({ suggestion }: Props) {
  const isExact = suggestion.match_type === 'exact';
  return (
    <div className={cn(
      'rounded-md border p-3 text-xs',
      isExact ? 'border-green-300 bg-green-50 text-green-800' : 'border-blue-300 bg-blue-50 text-blue-800'
    )}>
      <p className="font-medium">{MESSAGE[suggestion.match_type]}</p>
      {suggestion.difference !== 0 && (
        <p className="mt-0.5">차액: {formatNumber(Math.abs(suggestion.difference))}원</p>
      )}
    </div>
  );
}
