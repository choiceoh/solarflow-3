/**
 * MoverListCard — 회전율 Top/Slow Movers 리스트
 *
 * 비유: "잘 돌고 있는 품목 / 정체된 품목 진열대"
 * - top: 재발주 후보
 * - slow: 처분 타겟
 *
 * 권한: MW·EA·회전율만 노출 (금액 없음) → strategic 전역 공개 가능.
 *   showDetail=false 역할(manager/viewer)은 상위 N개만 제품명 없이 표시(쇼룸용 스파크 느낌)
 *   — 하지만 동일한 데이터를 그대로 노출해도 가격 정보가 없으므로 여기서는 전체 공개.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { moduleLabel } from '@/lib/utils';
import type { TurnoverByProduct } from '@/types/turnover';

interface Props {
  kind: 'top' | 'slow';
  items: TurnoverByProduct[];
  showDetail: boolean;
}

export default function MoverListCard({ kind, items, showDetail }: Props) {
  const isTop = kind === 'top';
  const title = isTop ? '빠르게 도는 품목 Top 10' : '정체된 품목 Bottom 10';
  const Icon = isTop ? TrendingUp : TrendingDown;
  const accent = isTop ? 'text-emerald-600' : 'text-rose-600';

  // showDetail=false: 제품코드 마스킹, 제조사/출력만
  const displayItems = items.slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accent}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">데이터 없음</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">품목</th>
                <th className="py-2 px-2 text-right font-medium">재고</th>
                <th className="py-2 px-2 text-right font-medium">90일 출고</th>
                <th className="py-2 pl-3 text-right font-medium">
                  {isTop ? '회전율' : '재고일수'}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((p) => (
                <tr key={p.product_id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="py-2 pr-3">
                    {showDetail ? (
                      <>
                        <div className="font-medium truncate max-w-[220px]">{p.product_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {moduleLabel(p.manufacturer_name, p.spec_wp)}
                        </div>
                      </>
                    ) : (
                      <div className="font-medium">{moduleLabel(p.manufacturer_name, p.spec_wp)}</div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    <div className="font-medium">{(p.inventory_kw / 1000).toFixed(2)}MW</div>
                    <div className="text-[11px] text-muted-foreground">{p.inventory_ea.toLocaleString()}장</div>
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    <div>{(p.outbound_kw / 1000).toFixed(2)}MW</div>
                    <div className="text-[11px] text-muted-foreground">{p.outbound_ea.toLocaleString()}장</div>
                  </td>
                  <td className={`py-2 pl-3 text-right whitespace-nowrap font-semibold ${accent}`}>
                    {isTop
                      ? (p.turnover_ratio < 999 ? `${p.turnover_ratio.toFixed(1)}회/년` : '신규')
                      : (p.dio_days < 999 ? `${p.dio_days.toFixed(0)}일` : '정지')
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
