import StatusPill from "@/components/common/StatusPill"
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, type OrderStatus } from "@/types/orders"

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <StatusPill label={ORDER_STATUS_LABEL[status]} colorClassName={ORDER_STATUS_COLOR[status]} />
  )
}
