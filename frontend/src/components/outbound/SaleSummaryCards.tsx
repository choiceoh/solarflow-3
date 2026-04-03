import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import type { Outbound, Sale } from '@/types/outbound';

interface Props {
  items: (Outbound & { sale: Sale })[];
}

export default function SaleSummaryCards({ items }: Props) {
  const totalSupply = items.reduce((sum, i) => sum + (i.sale.supply_amount ?? 0), 0);
  const totalVat = items.reduce((sum, i) => sum + (i.sale.vat_amount ?? 0), 0);
  const totalAmount = items.reduce((sum, i) => sum + (i.sale.total_amount ?? 0), 0);
  const count = items.length;
  const issuedCount = items.filter((i) => i.sale.tax_invoice_date).length;
  const issueRate = count > 0 ? Math.round((issuedCount / count) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-[10px] text-muted-foreground">매출 합계 (공급가)</p>
          <p className="text-lg font-bold">{formatNumber(totalSupply)}원</p>
          <p className="text-[10px] text-muted-foreground">부가세 포함: {formatNumber(totalAmount)}원</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-[10px] text-muted-foreground">매출 건수</p>
          <p className="text-lg font-bold">{count}건</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-[10px] text-muted-foreground">계산서 발행률</p>
          <p className="text-lg font-bold">{issueRate}%</p>
          <p className="text-[10px] text-muted-foreground">{issuedCount}/{count}건</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-[10px] text-muted-foreground">부가세 합계</p>
          <p className="text-lg font-bold">{formatNumber(totalVat)}원</p>
        </CardContent>
      </Card>
    </div>
  );
}
