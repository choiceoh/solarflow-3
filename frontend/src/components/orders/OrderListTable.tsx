import { memo } from 'react';
import { Pencil, Trash2, Truck } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/common/EmptyState';
import FulfillmentSourceBadge from './FulfillmentSourceBadge';
import OrderStatusBadge from './OrderStatusBadge';
import { cn, formatDate, formatNumber, formatKw } from '@/lib/utils';
import { MANAGEMENT_CATEGORY_LABEL, type FulfillmentSource, type Order } from '@/types/orders';

interface Props {
  items: Order[];
  onSelect: (item: Order) => void;
  onNew: () => void;
  onEdit?: (item: Order) => void;
  onDelete?: (item: Order) => void;
  onCreateOutbound?: (item: Order) => void;
  onCancelToReservation?: (item: Order) => void;
  sourceOverrides?: Record<string, FulfillmentSource>;
}

const EMPTY_OVERRIDES: Record<string, FulfillmentSource> = {};

function OrderListTable({ items, onSelect, onNew, onEdit, onDelete, onCreateOutbound, onCancelToReservation, sourceOverrides = EMPTY_OVERRIDES }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 수주가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>수주일</TableHead>
            <TableHead>수주번호</TableHead>
            <TableHead>거래처</TableHead>
            <TableHead>품명</TableHead>
            <TableHead>규격</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">용량</TableHead>
            <TableHead className="text-right">단가</TableHead>
            <TableHead>충당</TableHead>
            <TableHead>구분</TableHead>
            <TableHead>납기</TableHead>
            <TableHead>현장</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((o) => {
            const remaining = o.remaining_qty ?? (o.quantity - (o.shipped_qty ?? 0));
            const canReturnReservation = (o.shipped_qty ?? 0) <= 0 && o.status !== 'cancelled';
            const canCreateOutbound = remaining > 0 && o.status !== 'cancelled';
            const displaySource = sourceOverrides[o.order_id] ?? o.fulfillment_source;
            const isCancelled = o.status === 'cancelled';
            return (
              <TableRow
                key={o.order_id}
                className={cn(
                  'cursor-pointer hover:bg-accent/50',
                  isCancelled && 'bg-gray-50 text-muted-foreground line-through',
                )}
                onClick={() => onSelect(o)}
              >
                <TableCell>{formatDate(o.order_date)}</TableCell>
                <TableCell className="font-mono">{o.order_number ?? '—'}</TableCell>
                <TableCell>{o.customer_name ?? '—'}</TableCell>
                <TableCell>{o.product_name ?? '—'}</TableCell>
                <TableCell>{o.spec_wp ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(o.quantity)}
                  {remaining > 0 && remaining !== o.quantity && (
                    <span className="ml-1 text-[10px] text-amber-600">({formatNumber(remaining)})</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatKw(o.capacity_kw)}</TableCell>
                <TableCell className="text-right tabular-nums font-mono">{formatNumber(o.unit_price_wp)}</TableCell>
                <TableCell><FulfillmentSourceBadge source={displaySource} /></TableCell>
                <TableCell>{MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category}</TableCell>
                <TableCell>{o.delivery_due ? formatDate(o.delivery_due) : '—'}</TableCell>
                <TableCell className="max-w-[160px] truncate">{o.site_name ?? '—'}</TableCell>
                <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center justify-end gap-1">
                    {onEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="수정" onClick={() => onEdit(o)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {onCreateOutbound && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        title={canCreateOutbound ? '출고 등록' : '출고할 잔량이 없습니다'}
                        disabled={!canCreateOutbound}
                        onClick={() => onCreateOutbound(o)}
                      >
                        <Truck className="mr-1 h-3 w-3" />출고
                      </Button>
                    )}
                    {onCancelToReservation && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-sky-700 hover:text-sky-700"
                        title={canReturnReservation ? '예약으로 복귀' : '출고된 수주는 예약으로 복귀할 수 없습니다'}
                        disabled={!canReturnReservation}
                        onClick={() => onCancelToReservation(o)}
                      >
                        예약복귀
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="삭제"
                        onClick={() => onDelete(o)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default memo(OrderListTable);
