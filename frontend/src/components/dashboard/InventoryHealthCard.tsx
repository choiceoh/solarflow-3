/**
 * InventoryHealthCard — 재고 건강검진 요약 카드
 *
 * 비유: "재고 대시보드 상단 체크업 리포트"
 * - 전체 회전율 (회/년)
 * - 평균 재고일수 (DIO)
 * - 총 재고 MW
 * - 90일 출고 MW
 *
 * 권한: 금액/단가를 노출하지 않으므로 모든 strategic 역할에서 표시 가능
 * (MW·일수·회전율만 — 역산 불가)
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Calendar, Package, TrendingUp } from 'lucide-react';
import type { TurnoverTotal } from '@/types/turnover';

interface Props {
  total: TurnoverTotal;
  windowDays: number;
}

export default function InventoryHealthCard({ total, windowDays }: Props) {
  const invMw = total.inventory_kw / 1000;
  const outMw = total.outbound_kw / 1000;

  // 건강 판정: DIO 기준
  // - 60일 미만: 매우 빠른 회전 (excellent)
  // - 60~120일: 정상 (good)
  // - 120~240일: 주의 (warning)
  // - 240일 초과: 재검토 (critical)
  const dio = total.dio_days;
  const healthLabel =
    dio < 60 ? '매우 빠름' : dio < 120 ? '정상' : dio < 240 ? '느림' : '정체';
  const healthColor =
    dio < 60 ? 'text-emerald-600 bg-emerald-50' :
    dio < 120 ? 'text-green-600 bg-green-50' :
    dio < 240 ? 'text-amber-600 bg-amber-50' :
    'text-rose-600 bg-rose-50';

  const cards = [
    {
      label: '회전율',
      value: `${total.turnover_ratio.toFixed(1)}회/년`,
      icon: Activity,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '평균 재고일수',
      value: `${dio < 999 ? dio.toFixed(0) : '—'}일`,
      icon: Calendar,
      color: healthColor,
      sub: healthLabel,
    },
    {
      label: '현재고',
      value: `${invMw.toFixed(1)}MW`,
      icon: Package,
      color: 'text-slate-600 bg-slate-50',
    },
    {
      label: `${windowDays}일 출고`,
      value: `${outMw.toFixed(1)}MW`,
      icon: TrendingUp,
      color: 'text-indigo-600 bg-indigo-50',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">재고 건강검진</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(({ label, value, icon: Icon, color, sub }) => (
            <div key={label} className="flex items-center gap-3 rounded-lg border p-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-base font-semibold truncate">{value}</p>
                {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
