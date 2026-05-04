import { memo } from 'react';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import FulfillmentSourceBadge from './FulfillmentSourceBadge';
import OrderStatusBadge from './OrderStatusBadge';
import { cn, formatDate, formatNumber, formatKw } from '@/lib/utils';
import { MANAGEMENT_CATEGORY_LABEL, type FulfillmentSource, type Order } from '@/types/orders';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const ORDER_TABLE_ID = 'order-list';

interface Props {
  items: Order[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
  onSelect: (item: Order) => void;
  onCancelToReservation?: (item: Order) => void;
  sourceOverrides?: Record<string, FulfillmentSource>;
}

const EMPTY_OVERRIDES: Record<string, FulfillmentSource> = {};

interface BuildOpts {
  onCancelToReservation?: (item: Order) => void;
  sourceOverrides: Record<string, FulfillmentSource>;
}

function buildColumns({ onCancelToReservation, sourceOverrides }: BuildOpts): ColumnDef<Order>[] {
  const columns: ColumnDef<Order>[] = [
    { key: 'order_date', label: '수주일', cell: (o) => formatDate(o.order_date), sortAccessor: (o) => o.order_date ?? '' },
    { key: 'customer_name', label: '거래처', hideable: true, cell: (o) => o.customer_name ?? '—', sortAccessor: (o) => o.customer_name ?? '' },
    { key: 'site_name', label: '현장', hideable: true, className: 'max-w-[160px] truncate', cell: (o) => o.site_name ?? '—', sortAccessor: (o) => o.site_name ?? '' },
    { key: 'product_name', label: '품명', hideable: true, cell: (o) => o.product_name ?? '—', sortAccessor: (o) => o.product_name ?? '' },
    { key: 'spec_wp', label: '규격', hideable: true, cell: (o) => o.spec_wp ?? '—', sortAccessor: (o) => o.spec_wp ?? 0 },
    {
      key: 'quantity', label: '수량', hideable: true, align: 'right', className: 'tabular-nums',
      cell: (o) => {
        const remaining = o.remaining_qty ?? (o.quantity - (o.shipped_qty ?? 0));
        return (
          <>
            {formatNumber(o.quantity)}
            {remaining > 0 && remaining !== o.quantity && (
              <span className="ml-1 text-[10px] text-amber-600">({formatNumber(remaining)})</span>
            )}
          </>
        );
      },
      sortAccessor: (o) => o.quantity,
    },
    { key: 'capacity_kw', label: '용량', hideable: true, align: 'right', className: 'tabular-nums', cell: (o) => formatKw(o.capacity_kw), sortAccessor: (o) => o.capacity_kw ?? 0 },
    { key: 'order_number', label: '수주번호', hideable: true, className: 'font-mono', cell: (o) => o.order_number ?? '—', sortAccessor: (o) => o.order_number ?? '' },
    { key: 'management_category', label: '구분', hideable: true, cell: (o) => MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category, sortAccessor: (o) => MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category },
    { key: 'fulfillment_source', label: '충당', hideable: true, cell: (o) => <FulfillmentSourceBadge source={sourceOverrides[o.order_id] ?? o.fulfillment_source} />, sortAccessor: (o) => sourceOverrides[o.order_id] ?? o.fulfillment_source ?? '' },
    { key: 'unit_price_wp', label: '단가', hideable: true, align: 'right', className: 'tabular-nums font-mono', cell: (o) => formatNumber(o.unit_price_wp), sortAccessor: (o) => o.unit_price_wp ?? 0 },
    { key: 'delivery_due', label: '납기', hideable: true, cell: (o) => o.delivery_due ? formatDate(o.delivery_due) : '—', sortAccessor: (o) => o.delivery_due ?? '' },
    { key: 'status', label: '상태', cell: (o) => <OrderStatusBadge status={o.status} />, sortAccessor: (o) => o.status },
  ];

  if (onCancelToReservation) {
    columns.push({
      key: 'actions', label: '연결', align: 'right',
      cell: (o) => {
        const canReturnReservation = (o.shipped_qty ?? 0) <= 0 && o.status !== 'cancelled';
        return (
          <div className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] text-sky-700 hover:text-sky-700"
              title={canReturnReservation ? '예약으로 복귀' : '출고된 수주는 예약으로 복귀할 수 없습니다'}
              disabled={!canReturnReservation}
              onClick={() => onCancelToReservation(o)}
            >
              <Undo2 className="mr-1 h-3 w-3" />예약복귀
            </Button>
          </div>
        );
      },
    });
  }

  return columns;
}

export const ORDER_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({ sourceOverrides: EMPTY_OVERRIDES }).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function OrderListTable({ items, hidden, pinning, onPinningChange, onSelect, onCancelToReservation, sourceOverrides = EMPTY_OVERRIDES }: Props) {
  return (
    <MetaTable
      tableId={ORDER_TABLE_ID}
      columns={buildColumns({ onCancelToReservation, sourceOverrides })}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      getRowKey={(o) => o.order_id}
      onRowClick={onSelect}
      rowClassName={(o) => cn('hover:bg-accent/50', o.status === 'cancelled' && 'bg-gray-50 text-muted-foreground line-through')}
      emptyMessage="등록된 수주가 없습니다"
      pageSize={50}
    />
  );
}

export default memo(OrderListTable);
