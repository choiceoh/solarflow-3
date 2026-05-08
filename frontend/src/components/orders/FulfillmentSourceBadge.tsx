import StatusPill from "@/components/common/StatusPill"
import {
  FULFILLMENT_SOURCE_LABEL,
  FULFILLMENT_SOURCE_COLOR,
  type FulfillmentSource,
} from "@/types/orders"

export default function FulfillmentSourceBadge({
  source,
}: {
  source?: FulfillmentSource | string | null
}) {
  const knownSource = source === "stock" || source === "incoming" ? source : null

  return (
    <StatusPill
      label={knownSource ? FULFILLMENT_SOURCE_LABEL[knownSource] : "—"}
      colorClassName={knownSource ? FULFILLMENT_SOURCE_COLOR[knownSource] : "sf-tone-muted"}
    />
  )
}
