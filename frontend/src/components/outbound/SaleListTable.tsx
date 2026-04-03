import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { formatDate, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Outbound, Sale } from '@/types/outbound';

interface Props {
  items: (Outbound & { sale: Sale })[];
}

export default function SaleListTable({ items }: Props) {
  if (items.length === 0) return <EmptyState message="매출 데이터가 없습니다" />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>출고일</TableHead>
            <TableHead>거래처</TableHead>
            <TableHead>품명</TableHead>
            <TableHead>규격</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">Wp단가</TableHead>
            <TableHead className="text-right">공급가</TableHead>
            <TableHead className="text-right">부가세</TableHead>
            <TableHead className="text-right">합계</TableHead>
            <TableHead>계산서일</TableHead>
            <TableHead>ERP마감</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.outbound_id}>
              <TableCell>{formatDate(item.outbound_date)}</TableCell>
              <TableCell>{item.sale.customer_name ?? '—'}</TableCell>
              <TableCell>{item.product_name ?? '—'}</TableCell>
              <TableCell>{item.spec_wp ? `${item.spec_wp}Wp` : '—'}</TableCell>
              <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
              <TableCell className="text-right">{formatNumber(item.sale.unit_price_wp)}</TableCell>
              <TableCell className="text-right">{item.sale.supply_amount ? formatNumber(item.sale.supply_amount) : '—'}</TableCell>
              <TableCell className="text-right">{item.sale.vat_amount ? formatNumber(item.sale.vat_amount) : '—'}</TableCell>
              <TableCell className="text-right font-medium">{item.sale.total_amount ? formatNumber(item.sale.total_amount) : '—'}</TableCell>
              <TableCell>
                {item.sale.tax_invoice_date ? (
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', 'bg-green-100 text-green-700')}>
                    {formatDate(item.sale.tax_invoice_date)}
                  </span>
                ) : (
                  <span className="rounded-full bg-yellow-100 text-yellow-700 px-1.5 py-0.5 text-[10px] font-medium">미발행</span>
                )}
              </TableCell>
              <TableCell>
                {item.sale.erp_closed ? (
                  <span className="text-green-600 text-[10px]">마감</span>
                ) : (
                  <span className="text-muted-foreground text-[10px]">미마감</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
