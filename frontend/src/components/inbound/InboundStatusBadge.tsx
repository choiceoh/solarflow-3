import StatusPill from "@/components/common/StatusPill"
import { BL_STATUS_LABEL, BL_STATUS_COLOR, type BLStatus } from "@/types/inbound"

export default function InboundStatusBadge({ status }: { status: BLStatus }) {
  return <StatusPill label={BL_STATUS_LABEL[status]} colorClassName={BL_STATUS_COLOR[status]} />
}
