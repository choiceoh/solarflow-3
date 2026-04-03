import { DollarSign, Wallet, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatUSD } from '@/lib/utils';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import LCDemandByPOTable from './LCDemandByPOTable';
import LCDemandMonthlyTable from './LCDemandMonthlyTable';
import { useLCDemand } from '@/hooks/useLCDemand';

export default function LCDemandForecast() {
  const { demandByPO, monthlyForecast, totalLCNeeded, totalAvailable, shortage, loading, error } = useLCDemand();

  if (loading) return <LoadingSpinner />;
  if (error) return <p className="text-sm text-red-500 text-center py-6">{error}</p>;

  const shortageColor = shortage < 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50';
  const shortageLabel = shortage < 0 ? '부족' : '충분';

  return (
    <div className="space-y-4">
      {/* 요약 카드 3개 */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-orange-600 bg-orange-50">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">LC 미개설 총액</p>
              <p className="text-lg font-semibold">{formatUSD(totalLCNeeded)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-green-600 bg-green-50">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">가용한도</p>
              <p className="text-lg font-semibold">{formatUSD(totalAvailable)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${shortageColor}`}>
              <TrendingDown className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">과부족</p>
              <p className={`text-lg font-semibold ${shortage < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {shortage >= 0 ? '+' : ''}{formatUSD(shortage)}
              </p>
              <p className={`text-[10px] ${shortage < 0 ? 'text-red-500' : 'text-green-500'}`}>{shortageLabel}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PO별 LC 수요 */}
      <div>
        <h3 className="text-sm font-semibold mb-2">PO별 LC 수요</h3>
        <LCDemandByPOTable items={demandByPO} />
      </div>

      <Separator />

      {/* 3개월 예측 */}
      <div>
        <h3 className="text-sm font-semibold mb-2">3개월 예측</h3>
        <LCDemandMonthlyTable items={monthlyForecast} />
      </div>
    </div>
  );
}
