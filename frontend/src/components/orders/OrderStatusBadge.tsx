import { cn } from '@/lib/utils';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, type OrderStatus } from '@/types/orders';

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
      ORDER_STATUS_COLOR[status]
    )}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
