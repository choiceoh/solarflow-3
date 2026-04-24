import { useMemo } from 'react';
import { Package, Truck, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatMW } from '@/lib/utils';
import type { InventorySummary, InventoryItem } from '@/types/inventory';

interface Props {
  summary: InventorySummary;
  items?: InventoryItem[];   // 전달 시 EA 자동 계산
}

const CARD_DEFS = [
  { key: 'total_physical_kw' as const,   label: '실재고',      icon: Package,     color: 'text-blue-600 bg-blue-50'   },
  { key: 'total_incoming_kw' as const,   label: '미착품',      icon: Truck,        color: 'text-yellow-600 bg-yellow-50' },
  { key: 'total_secured_kw' as const,    label: '가용재고',    icon: Shield,       color: 'text-green-600 bg-green-50'  },
];

const kwToEa = (kw: number, specWp: number) =>
  specWp > 0 ? Math.round((kw * 1000) / specWp) : 0;

export default function InventorySummaryCards({ summary, items }: Props) {
  // 품목별 spec_wp 기반으로 카테고리별 EA 합산
  const eaTotals = useMemo(() => {
    if (!items?.length) return null;
    return {
      total_physical_kw:  items.reduce((s, it) => s + kwToEa(it.physical_kw,       it.spec_wp), 0),
      total_available_kw: items.reduce((s, it) => s + kwToEa(it.available_kw,      it.spec_wp), 0),
      total_incoming_kw:  items.reduce((s, it) => s + kwToEa(it.incoming_kw,       it.spec_wp), 0),
      total_secured_kw:   items.reduce((s, it) => s + kwToEa(it.total_secured_kw,  it.spec_wp), 0),
    };
  }, [items]);

  return (
    <div className="grid grid-cols-3 gap-3">
      {CARD_DEFS.map(({ key, label, icon: Icon, color }) => (
        <Card key={key}>
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              {/* 메인: MW */}
              <p className="text-lg font-semibold leading-tight">{formatMW(summary[key])}</p>
              {/* 보조: kW · EA */}
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {Math.round(summary[key]).toLocaleString('ko-KR')}kW
                {eaTotals != null && (
                  <span className="ml-1">· {eaTotals[key].toLocaleString('ko-KR')}EA</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
