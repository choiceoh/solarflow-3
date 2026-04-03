import { useNavigate } from 'react-router-dom';
import { Package, PackageX, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  warningCount: number;
  criticalCount: number;
}

export default function LongTermStockWarning({ warningCount, criticalCount }: Props) {
  const navigate = useNavigate();

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => navigate('/inventory')}
    >
      <span className="text-xs font-medium text-muted-foreground">장기재고:</span>
      {criticalCount > 0 && (
        <Badge className="bg-red-100 text-red-700 border-red-300 gap-1">
          <PackageX className="h-3 w-3" />초장기(12M+) {criticalCount}건
        </Badge>
      )}
      {warningCount > 0 && (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 gap-1">
          <Package className="h-3 w-3" />장기(6M+) {warningCount}건
        </Badge>
      )}
      {warningCount === 0 && criticalCount === 0 && (
        <Badge className="bg-green-100 text-green-700 border-green-300 gap-1">
          <CheckCircle className="h-3 w-3" />없음
        </Badge>
      )}
    </div>
  );
}
