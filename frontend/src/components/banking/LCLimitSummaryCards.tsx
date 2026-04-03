import { DollarSign, CreditCard, Wallet, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatUSD } from '@/lib/utils';
import type { BankSummary } from '@/types/banking';

interface Props {
  bankSummaries: BankSummary[];
}

export default function LCLimitSummaryCards({ bankSummaries }: Props) {
  const totalLimit = bankSummaries.reduce((s, b) => s + b.limit, 0);
  const totalUsed = bankSummaries.reduce((s, b) => s + b.used, 0);
  const totalAvailable = bankSummaries.reduce((s, b) => s + b.available, 0);
  const usageRate = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;

  // 사용률 색상: 0~70% 초록, 70~90% 노란, 90~100% 빨간
  const usageColor = usageRate >= 90 ? 'text-red-600' : usageRate >= 70 ? 'text-yellow-600' : 'text-green-600';
  const usageBarColor = usageRate >= 90 ? 'bg-red-500' : usageRate >= 70 ? 'bg-yellow-500' : 'bg-green-500';

  const cards = [
    { label: '총한도', value: formatUSD(totalLimit), icon: DollarSign, color: 'text-blue-600 bg-blue-50' },
    { label: '개설잔액', value: formatUSD(totalUsed), icon: CreditCard, color: 'text-orange-600 bg-orange-50' },
    { label: '가용한도', value: formatUSD(totalAvailable), icon: Wallet, color: 'text-green-600 bg-green-50' },
    { label: '사용률', value: `${usageRate.toFixed(1)}%`, icon: TrendingUp, color: `${usageColor} bg-gray-50` },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 사용률 Progress bar */}
      <div className="px-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>LC 사용률</span>
          <span className={usageColor}>{usageRate.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={`h-2 rounded-full transition-all ${usageBarColor}`}
            style={{ width: `${Math.min(usageRate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
