import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import FulfillmentSourceBadge from './FulfillmentSourceBadge';
import { cn } from '@/lib/utils';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, MANAGEMENT_CATEGORY_LABEL,
  type Order, type OrderStatus,
} from '@/types/orders';

interface Props {
  items: Order[];
  onSelect: (item: Order) => void;
  onNew: () => void;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', ORDER_STATUS_COLOR[status])}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

export default function OrderListTable({ items, onSelect, onNew }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 수주가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>발주번호</TableHead>
            <TableHead>거래처</TableHead>
            <TableHead>수주일</TableHead>
            <TableHead>관리구분</TableHead>
            <TableHead>충당소스</TableHead>
            <TableHead>품명</TableHead>
            <TableHead>규격</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">잔량</TableHead>
            <TableHead className="text-right">용량</TableHead>
            <TableHead className="text-right">Wp단가</TableHead>
            <TableHead>납기일</TableHead>
            <TableHead>현장명</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((o) => {
            const remaining = o.remaining_qty ?? (o.quantity - (o.shipped_qty ?? 0));
            return (
              <TableRow key={o.order_id} className="cursor-pointer hover:bg-accent/50" onClick={() => onSelect(o)}>
                <TableCell className="font-mono">{o.order_number || '—'}</TableCell>
                <TableCell>{o.customer_name ?? '—'}</TableCell>
                <TableCell>{formatDate(o.order_date)}</TableCell>
                <TableCell>{MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category}</TableCell>
                <TableCell><FulfillmentSourceBadge source={o.fulfillment_source} /></TableCell>
                <TableCell>{o.product_name ?? '—'}</TableCell>
                <TableCell>{o.spec_wp ? `${o.spec_wp}Wp` : '—'}</TableCell>
                <TableCell className="text-right">{formatNumber(o.quantity)}</TableCell>
                <TableCell className="text-right">{formatNumber(remaining)}</TableCell>
                <TableCell className="text-right">{o.capacity_kw ? formatKw(o.capacity_kw) : '—'}</TableCell>
                <TableCell className="text-right">{formatNumber(o.unit_price_wp)}</TableCell>
                <TableCell>{o.delivery_due ? formatDate(o.delivery_due) : '—'}</TableCell>
                <TableCell>{o.site_name ?? '—'}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
