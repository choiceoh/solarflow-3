// 검색 이력 + 인기 예시 (Step 31)
import { Clock, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSearchHistory, clearSearchHistory } from '@/hooks/useSearch';

const EXAMPLES = [
  '진코 640 재고',
  'LC 만기 이번달',
  '미수금 60일',
  '트리나 출고 현황',
  '라이젠 단가',
];

interface Props {
  onSelect: (query: string) => void;
}

export default function SearchHistory({ onSelect }: Props) {
  const history = getSearchHistory();

  return (
    <div className="space-y-4">
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />최근 검색
            </h3>
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => { clearSearchHistory(); window.location.reload(); }}>
              <X className="h-3 w-3 mr-0.5" />지우기
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((q, i) => (
              <button
                key={i}
                className="px-2.5 py-1 text-xs rounded-full border hover:bg-muted transition-colors"
                onClick={() => onSelect(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium flex items-center gap-1.5 mb-2">
          <Sparkles className="h-3.5 w-3.5" />검색 예시
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((q, i) => (
            <button
              key={i}
              className="px-2.5 py-1 text-xs rounded-full border border-primary/20 text-primary hover:bg-primary/5 transition-colors"
              onClick={() => onSelect(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
