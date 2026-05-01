// 검색 결과 개별 카드 (Step 31)
import { useNavigate } from 'react-router-dom';
import {
  Package, FileText, Truck, Landmark, Users, Ship,
  HardHat, StickyNote, ScrollText,
} from 'lucide-react';
import type { SearchResult } from '@/types/search';
import { SEARCH_MODULE_ROUTE } from '@/types/search';

// result_type 기준 아이콘 — 색상은 mockup 5톤(info/warn/pos/neg/ink-3)으로 통일
const TYPE_ICON: Record<string, React.ReactNode> = {
  product:           <Package className="h-4 w-4" style={{ color: 'var(--sf-info)' }} />,
  compare:           <Package className="h-4 w-4" style={{ color: 'var(--sf-info)' }} />,
  inventory:         <Package className="h-4 w-4" style={{ color: 'var(--sf-info)' }} />,
  po:                <FileText className="h-4 w-4" style={{ color: 'var(--sf-info)' }} />,
  po_payment:        <FileText className="h-4 w-4" style={{ color: 'var(--sf-info)' }} />,
  bl:                <Ship className="h-4 w-4" style={{ color: 'var(--sf-info)' }} />,
  lc_maturity:       <Landmark className="h-4 w-4" style={{ color: 'var(--sf-warn)' }} />,
  lc:                <Landmark className="h-4 w-4" style={{ color: 'var(--sf-warn)' }} />,
  outbound:          <Truck className="h-4 w-4" style={{ color: 'var(--sf-pos)' }} />,
  outstanding:       <Users className="h-4 w-4" style={{ color: 'var(--sf-neg)' }} />,
  partner:           <Users className="h-4 w-4" style={{ color: 'var(--sf-ink-3)' }} />,
  construction_site: <HardHat className="h-4 w-4" style={{ color: 'var(--sf-warn)' }} />,
  memo_po:           <StickyNote className="h-4 w-4" style={{ color: 'var(--sf-ink-3)' }} />,
  memo_order:        <StickyNote className="h-4 w-4" style={{ color: 'var(--sf-ink-3)' }} />,
  memo_outbound:     <StickyNote className="h-4 w-4" style={{ color: 'var(--sf-ink-3)' }} />,
  order:             <ScrollText className="h-4 w-4" style={{ color: 'var(--sf-pos)' }} />,
};

// result_type → 사람이 읽는 한국어 레이블
const TYPE_LABEL: Record<string, string> = {
  product:           '제품',
  compare:           '규격 비교',
  inventory:         '재고',
  po:                '발주(P/O)',
  po_payment:        '발주',
  bl:                'B/L 입고',
  lc_maturity:       'L/C',
  lc:                'L/C',
  outbound:          '출고',
  outstanding:       '미수금',
  partner:           '거래처',
  construction_site: '공사현장',
  memo_po:           '발주 메모',
  memo_order:        '수주 메모',
  memo_outbound:     '출고 메모',
  order:             '수주',
};

interface Props {
  result: SearchResult;
  onNavigate?: () => void;
}

export default function SearchResultCard({ result, onNavigate }: Props) {
  const navigate = useNavigate();
  const route = SEARCH_MODULE_ROUTE[result.link.module] ?? '/';

  const handleClick = () => {
    navigate(route);
    onNavigate?.();
  };

  // 메모 타입: 미리보기 텍스트 표시
  const data = result.data as Record<string, unknown> | null;
  const memoText = data?.memo as string | undefined;
  const subtitle = memoText
    ? `메모: ${memoText.length > 60 ? memoText.slice(0, 60) + '…' : memoText}`
    : (data?.subtitle as string | undefined)
      ?? (data?.location as string | undefined)
      ?? TYPE_LABEL[result.result_type]
      ?? result.result_type;

  return (
    <button
      className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors flex items-start gap-2.5"
      onClick={handleClick}
    >
      <span className="mt-0.5 shrink-0">
        {TYPE_ICON[result.result_type] ?? <FileText className="h-4 w-4 text-muted-foreground" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.title}</p>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
    </button>
  );
}
