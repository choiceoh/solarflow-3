/**
 * StrategicSummaryCards — 전략 뷰 요약 카드 (flag 기반 조건부 렌더)
 *
 * 비유: "방문자 배지별 보여주는 안내판 — 없는 건 자리도 없앰"
 *
 * 기본 4개: 총재고·가용·미착품·총확보 (전 strategic 역할 공통)
 * 조건부:
 *   - showSales=true → 최근 매출 카드 (최근 3개월 합)
 *   - showReceivable=true → 미수금 카드
 *   - showLcLimit=true → LC 가용 카드
 *
 * 마스킹보다 카드 제거가 더 명확 — "0원"으로 보이는 혼동 제거.
 */
import { Package, PackageCheck, Truck, Shield, DollarSign, Wallet, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { formatUSD, formatKRW } from '@/lib/utils';
import type { DashboardSummary, MonthlyRevenue } from '@/types/dashboard';

interface Props {
  summary: DashboardSummary;
  revenue: MonthlyRevenue | null;
  flags: {
    showSales: boolean;
    showReceivable: boolean;
    showLcLimit: boolean;
  };
}

function recentMonthsRevenueKrw(revenue: MonthlyRevenue | null, nMonths: number): number {
  if (!revenue?.months?.length) return 0;
  const lastN = revenue.months.slice(-nMonths);
  return lastN.reduce((s, m) => s + (m.revenue_krw || 0), 0);
}

export default function StrategicSummaryCards({ summary, revenue, flags }: Props) {
  const baseCards = [
    { key: 'physical',  label: '총재고', value: `${summary.physical_mw.toFixed(1)}MW`,  icon: Package,      color: 'text-blue-600 bg-blue-50',     to: '/inventory' },
    { key: 'available', label: '가용',   value: `${summary.available_mw.toFixed(1)}MW`, icon: PackageCheck, color: 'text-green-600 bg-green-50',   to: '/inventory' },
    { key: 'incoming',  label: '미착품', value: `${summary.incoming_mw.toFixed(1)}MW`,  icon: Truck,        color: 'text-yellow-600 bg-yellow-50', to: '/inbound' },
    { key: 'secured',   label: '총확보', value: `${summary.secured_mw.toFixed(1)}MW`,   icon: Shield,       color: 'text-purple-600 bg-purple-50', to: '/inventory' },
  ];

  const optionalCards: typeof baseCards = [];

  if (flags.showSales) {
    const sales3m = recentMonthsRevenueKrw(revenue, 3);
    optionalCards.push({
      key: 'sales',
      label: '최근 3개월 매출',
      value: formatKRW(sales3m),
      icon: Receipt,
      color: 'text-indigo-600 bg-indigo-50',
      to: '/orders',
    });
  }
  if (flags.showReceivable) {
    optionalCards.push({
      key: 'receivable',
      label: '미수금',
      value: formatKRW(summary.outstanding_krw),
      icon: DollarSign,
      color: 'text-red-600 bg-red-50',
      to: '/orders?tab=receipts',
    });
  }
  if (flags.showLcLimit) {
    optionalCards.push({
      key: 'lc',
      label: 'LC 가용',
      value: formatUSD(summary.lc_available_usd),
      icon: Wallet,
      color: 'text-sky-600 bg-sky-50',
      to: '/banking',
    });
  }

  const cards = [...baseCards, ...optionalCards];
  // 카드 수에 맞춰 xl 열 개수 조정 (4~7개)
  const colClass: Record<number, string> = {
    4: 'xl:grid-cols-4',
    5: 'xl:grid-cols-5',
    6: 'xl:grid-cols-6',
    7: 'xl:grid-cols-7',
  };
  const cols = colClass[cards.length] ?? 'xl:grid-cols-4';

  return (
    <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${cols}`}>
      {cards.map(({ key, label, value, icon: Icon, color, to }) => (
        <Link key={key} to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
          <Card className="transition-shadow group-hover:shadow-md group-hover:border-border/80 cursor-pointer">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-base font-semibold">{value}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
