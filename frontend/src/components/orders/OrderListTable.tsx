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
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="p-3 text-left font-medium text-muted-foreground">수주 정보</th>
            <th className="p-3 text-left font-medium text-muted-foreground">품목</th>
            <th className="p-3 text-right font-medium">수량 / 단가</th>
            <th className="p-3 text-left font-medium text-muted-foreground">납기 / 현장</th>
            <th className="p-3 text-center font-medium text-muted-foreground w-[80px]">상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => {
            const remaining = o.remaining_qty ?? (o.quantity - (o.shipped_qty ?? 0));
            return (
              <tr key={o.order_id} className="border-t hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => onSelect(o)}>
                {/* 수주 정보 */}
                <td className="p-3 align-top">
                  <div className="font-mono font-semibold">{o.order_number || '—'}</div>
                  <div className="font-medium mt-0.5">{o.customer_name ?? '—'}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(o.order_date)}</div>
                </td>

                {/* 품목 */}
                <td className="p-3 align-top min-w-[180px]">
                  <div className="font-medium">{o.product_name ?? '—'}</div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {o.spec_wp ? `${o.spec_wp}` : '—'}
                    {o.capacity_kw ? ` · ${formatKw(o.capacity_kw)}` : ''}
                  </div>
                  <div className="mt-1">
                    <FulfillmentSourceBadge source={o.fulfillment_source} />
                  </div>
                </td>

                {/* 수량 / 단가 */}
                <td className="p-3 text-right align-top min-w-[120px]">
                  <div className="font-semibold tabular-nums">{formatNumber(o.quantity)} EA</div>
                  {remaining > 0 && (
                    <div className="text-[10px] text-amber-600 tabular-nums mt-0.5">
                      잔량 {formatNumber(remaining)}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5 font-mono">
                    {formatNumber(o.unit_price_wp)} ₩/Wp
                  </div>
                </td>

                {/* 납기 / 현장 */}
                <td className="p-3 align-top">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px]">
                      {MANAGEMENT_CATEGORY_LABEL[o.management_category] ?? o.management_category}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    납기: {o.delivery_due ? formatDate(o.delivery_due) : '—'}
                  </div>
                  {o.site_name && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[160px]">
                      현장: {o.site_name}
                    </div>
                  )}
                </td>

                {/* 상태 */}
                <td className="p-3 text-center align-top">
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
