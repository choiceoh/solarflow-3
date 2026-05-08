import StatusPill, { type StatusPillTone } from "@/components/common/StatusPill"
import type { Outbound } from "@/types/outbound"

type InvoiceStatus = "issued" | "pending" | "none"

function getInvoiceStatus(outbound: Outbound): InvoiceStatus {
  if (!outbound.sale) return "none"
  if (outbound.sale.tax_invoice_date) return "issued"
  return "pending"
}

const LABEL: Record<InvoiceStatus, string> = {
  issued: "계산서 발행",
  pending: "계산서 미발행",
  none: "매출 미등록",
}

const TONE: Record<InvoiceStatus, StatusPillTone> = {
  issued: "positive",
  pending: "warning",
  none: "neutral",
}

export default function InvoiceStatusBadge({ outbound }: { outbound: Outbound }) {
  const status = getInvoiceStatus(outbound)
  return <StatusPill label={LABEL[status]} tone={TONE[status]} />
}
