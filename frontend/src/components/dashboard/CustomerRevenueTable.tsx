/**
 * CustomerRevenueTable — 거래처별 매출·이익 테이블
 *
 * 비유: "거래처 성적표"
 *
 * 권한 매트릭스:
 *   - executive: 매출 + 이익 + 이익률 (전체 노출)
 *   - manager:   showSales=true + showMargin=false → 매출 총액만, 이익/이익률 마스킹
 *                showDetail=false → 상위 5개만 표시 (드릴다운 억제)
 *   - viewer:    showSales=false → 아예 비표시 (부모에서 차단)
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKRW } from '@/lib/utils';

interface CustomerRow {
  customer_id?: string;
  customer_name: string;
  revenue_krw?: number;
  margin_krw?: number;
  margin_rate?: number;
}

interface Props {
  customers: CustomerRow[];
  showMargin: boolean;
  showDetail: boolean;
}

export default function CustomerRevenueTable({ customers, showMargin, showDetail }: Props) {
  // showDetail=false → 상위 5개만
  const rows = showDetail ? customers.slice(0, 10) : customers.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">거래처별 매출 {showMargin ? '·이익' : ''}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">데이터 없음</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">거래처</th>
                <th className="py-2 px-2 text-right font-medium">매출</th>
                {showMargin && (
                  <>
                    <th className="py-2 px-2 text-right font-medium">이익</th>
                    <th className="py-2 pl-3 text-right font-medium">이익률</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.customer_id ?? `${c.customer_name}-${i}`} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="py-2 pr-3 font-medium truncate max-w-[220px]">{c.customer_name}</td>
                  <td className="py-2 px-2 text-right">{formatKRW(c.revenue_krw ?? 0)}</td>
                  {showMargin && (
                    <>
                      <td className="py-2 px-2 text-right">{formatKRW(c.margin_krw ?? 0)}</td>
                      <td className="py-2 pl-3 text-right font-semibold">
                        {((c.margin_rate ?? 0)).toFixed(1)}%
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!showDetail && customers.length > rows.length && (
          <p className="text-[11px] text-muted-foreground mt-3">
            ※ 상위 {rows.length}개 거래처만 표시됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
