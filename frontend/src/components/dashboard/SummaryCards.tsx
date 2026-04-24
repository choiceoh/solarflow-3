import { Package, PackageCheck, Truck, Shield, DollarSign, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { formatUSD, formatKRW } from '@/lib/utils';
import type { DashboardSummary } from '@/types/dashboard';

interface Props {
  summary: DashboardSummary;
}

export default function SummaryCards({ summary }: Props) {
  const cards = [
    { label: '총재고',  value: `${summary.physical_mw.toFixed(1)}MW`,  icon: Package,     color: 'text-blue-600 bg-blue-50',   to: '/inventory' },
    { label: '가용',    value: `${summary.available_mw.toFixed(1)}MW`, icon: PackageCheck, color: 'text-green-600 bg-green-50',  to: '/inventory' },
    { label: '미착품',  value: `${summary.incoming_mw.toFixed(1)}MW`,  icon: Truck,        color: 'text-yellow-600 bg-yellow-50', to: '/inbound' },
    { label: '총확보',  value: `${summary.secured_mw.toFixed(1)}MW`,   icon: Shield,       color: 'text-purple-600 bg-purple-50', to: '/inventory' },
    { label: '미수금',  value: formatKRW(summary.outstanding_krw),     icon: DollarSign,   color: 'text-red-600 bg-red-50',      to: '/orders?tab=receipts' },
    { label: 'LC가용',  value: formatUSD(summary.lc_available_usd),    icon: Wallet,       color: 'text-sky-600 bg-sky-50',      to: '/banking' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map(({ label, value, icon: Icon, color, to }) => (
        <Link key={label} to={to} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
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
