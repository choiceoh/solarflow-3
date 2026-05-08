import StatusPill from "@/components/common/StatusPill"
import { OUTBOUND_STATUS_LABEL, OUTBOUND_STATUS_COLOR, type OutboundStatus } from "@/types/outbound"

export default function OutboundStatusBadge({ status }: { status: OutboundStatus }) {
  return (
    <StatusPill
      label={OUTBOUND_STATUS_LABEL[status]}
      colorClassName={OUTBOUND_STATUS_COLOR[status]}
    />
  )
}
