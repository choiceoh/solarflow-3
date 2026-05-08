import StatusPill from "@/components/common/StatusPill"
import { formatKw } from "@/lib/utils"
import {
  ORDER_FULFILLMENT_RISK_COLOR,
  ORDER_FULFILLMENT_RISK_LABEL,
  type OrderFulfillmentRiskItem,
} from "@/types/orders"

export default function OrderFulfillmentRiskBadge({ risk }: { risk?: OrderFulfillmentRiskItem }) {
  if (!risk) {
    return <span className="text-[11px] text-muted-foreground">—</span>
  }

  const title = [
    risk.reason,
    `필요 ${formatKw(risk.need_kw)}`,
    `배정 전 ${formatKw(risk.available_before_kw)}`,
    risk.shortage_kw > 0 ? `부족 ${formatKw(risk.shortage_kw)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <StatusPill
      colorClassName={ORDER_FULFILLMENT_RISK_COLOR[risk.risk] ?? ORDER_FULFILLMENT_RISK_COLOR.check}
      label={ORDER_FULFILLMENT_RISK_LABEL[risk.risk] ?? ORDER_FULFILLMENT_RISK_LABEL.check}
      title={title}
    />
  )
}
