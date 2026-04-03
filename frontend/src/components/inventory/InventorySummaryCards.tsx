import { Package, PackageCheck, Truck, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatKw, formatMW } from '@/lib/utils';
import type { InventorySummary } from '@/types/inventory';

interface Props {
  summary: InventorySummary;
}

const cards = [
  { key: 'total_physical_kw' as const, label: '물리적 재고', icon: Package, color: 'text-blue-600 bg-blue-50' },
  { key: 'total_available_kw' as const, label: '가용재고', icon: PackageCheck, color: 'text-green-600 bg-green-50' },
  { key: 'total_incoming_kw' as const, label: '미착품', icon: Truck, color: 'text-yellow-600 bg-yellow-50' },
  { key: 'total_secured_kw' as const, label: '총확보량', icon: Shield, color: 'text-purple-600 bg-purple-50' },
];

export default function InventorySummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ key, label, icon: Icon, color }) => (
        <Card key={key}>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{formatKw(summary[key])}</p>
              <p className="text-[10px] text-muted-foreground">{formatMW(summary[key])}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
