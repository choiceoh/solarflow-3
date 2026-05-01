import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { formatDate, formatNumber } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { SaleListItem } from '@/types/outbound';

interface Props {
  items: SaleListItem[];
  onInvoice?: (item: SaleListItem) => void;
}

export default function SaleListTable({ items, onInvoice }: Props) {
  if (items.length === 0) return <EmptyState message="매출 데이터가 없습니다" />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>기준일</TableHead>
            <TableHead>구분</TableHead>
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
            <TableRow key={item.sale_id}>
              <TableCell>{formatDate(item.outbound_date ?? item.order_date ?? '')}</TableCell>
              <TableCell>
                <span className={item.outbound_id ? 'sf-pill pos' : 'sf-pill info'}>
                  {item.outbound_id ? '출고' : '수주'}
                </span>
              </TableCell>
              <TableCell>{item.sale.customer_name ?? '—'}</TableCell>
              <TableCell>{item.product_name ?? '—'}</TableCell>
              <TableCell>{item.spec_wp ? `${item.spec_wp}` : '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(item.quantity)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(item.sale.unit_price_wp)}</TableCell>
              <TableCell className="text-right tabular-nums">{item.sale.supply_amount ? formatNumber(item.sale.supply_amount) : '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{item.sale.vat_amount ? formatNumber(item.sale.vat_amount) : '—'}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
                {item.sale.total_amount ? formatNumber(item.sale.total_amount) : '—'}
              </TableCell>
              <TableCell>
                {item.sale.tax_invoice_date ? (
                  <button
                    type="button"
                    onClick={() => onInvoice?.(item)}
                    disabled={!onInvoice}
                    className={cn('sf-pill pos', onInvoice && 'cursor-pointer', !onInvoice && 'cursor-default')}
                    title="계산서 수정"
                  >
                    {formatDate(item.sale.tax_invoice_date)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onInvoice?.(item)}
                    disabled={!onInvoice}
                    className={cn('sf-pill warn', onInvoice && 'cursor-pointer', !onInvoice && 'cursor-default')}
                    title="계산서 발행"
                  >
                    미발행
                  </button>
                )}
              </TableCell>
              <TableCell>
                <span className={item.sale.erp_closed ? 'sf-pill pos' : 'sf-pill ghost'}>
                  {item.sale.erp_closed ? '마감' : '미마감'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
