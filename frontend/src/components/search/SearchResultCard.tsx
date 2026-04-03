// 검색 결과 개별 카드 (Step 31)
import { useNavigate } from 'react-router-dom';
import { Package, FileText, Truck, Landmark, Users, Ship } from 'lucide-react';
import type { SearchResult } from '@/types/search';
import { SEARCH_MODULE_ROUTE } from '@/types/search';

const ICONS: Record<string, React.ReactNode> = {
  inventory: <Package className="h-4 w-4 text-blue-600" />,
  po: <FileText className="h-4 w-4 text-purple-600" />,
  outbound: <Truck className="h-4 w-4 text-green-600" />,
  lc: <Landmark className="h-4 w-4 text-orange-600" />,
  'customer-analysis': <Users className="h-4 w-4 text-pink-600" />,
  inbound: <Ship className="h-4 w-4 text-cyan-600" />,
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

  return (
    <button
      className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors flex items-start gap-2.5"
      onClick={handleClick}
    >
      <span className="mt-0.5">{ICONS[result.link.module] ?? <FileText className="h-4 w-4" />}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{result.title}</p>
        <p className="text-xs text-muted-foreground truncate">{result.result_type}</p>
      </div>
    </button>
  );
}
