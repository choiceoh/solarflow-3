import { memo } from "react"
import MetaTable, { type ColumnDef } from "@/components/common/MetaTable"
import { formatNumber, formatUSD, formatWp } from "@/lib/utils"
import type { POLineItem } from "@/types/procurement"
import type { ColumnVisibilityMeta } from "@/lib/columnVisibility"
import type { ColumnPinningState } from "@/lib/columnPinning"

export const PO_LINE_TABLE_ID = "po-line"

interface Props {
  items: POLineItem[]
  hidden: Set<string>
  pinning?: ColumnPinningState
  onPinningChange?: (next: ColumnPinningState) => void
  manufacturerName?: string
}

function pCode(l: POLineItem): string {
  return l.product_code ?? l.products?.product_code ?? "—"
}
function pName(l: POLineItem): string {
  return l.product_name ?? l.products?.product_name ?? "—"
}
function pSpec(l: POLineItem): number | undefined {
  return l.spec_wp ?? l.products?.spec_wp
}
function unitPriceCents(l: POLineItem): number | null {
  const spec = pSpec(l)
  if (l.unit_price_usd_wp != null) return l.unit_price_usd_wp * 100
  if (l.unit_price_usd != null && spec) return (l.unit_price_usd / spec) * 100
  return null
}

interface BuildOpts {
  manufacturerName?: string
}

function buildColumns({ manufacturerName }: BuildOpts): ColumnDef<POLineItem>[] {
  return [
    { key: "manufacturer", label: "제조사", hideable: true, cell: () => manufacturerName ?? "—" },
    {
      key: "product_code",
      label: "품번",
      hideable: true,
      className: "font-mono text-[13px]",
      cell: (l) => pCode(l),
      sortAccessor: (l) => pCode(l),
    },
    {
      key: "product_name",
      label: "품명",
      hideable: true,
      className: "text-[13px]",
      cell: (l) => pName(l),
      sortAccessor: (l) => pName(l),
    },
    {
      key: "spec_wp",
      label: "규격",
      hideable: true,
      align: "right",
      cell: (l) => {
        const s = pSpec(l)
        return s ? formatWp(s) : "—"
      },
      sortAccessor: (l) => pSpec(l) ?? 0,
    },
    {
      key: "quantity",
      label: "수량",
      align: "right",
      cell: (l) => formatNumber(l.quantity),
      sortAccessor: (l) => l.quantity,
    },
    {
      key: "payment_type",
      label: "유/무상",
      hideable: true,
      cell: (l) =>
        l.payment_type === "free" ? (
          <span className="sf-status-pill sf-tone-pos">무상</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">유상</span>
        ),
      sortAccessor: (l) => l.payment_type ?? "",
    },
    {
      key: "unit_price",
      label: "단가(¢/Wp)",
      hideable: true,
      align: "right",
      cell: (l) => {
        const cents = unitPriceCents(l)
        return cents != null ? `${cents.toFixed(2)}¢` : "—"
      },
      sortAccessor: (l) => unitPriceCents(l) ?? 0,
    },
    {
      key: "total_usd",
      label: "총액(USD)",
      hideable: true,
      align: "right",
      className: "font-medium",
      cell: (l) => (l.total_amount_usd != null ? formatUSD(l.total_amount_usd) : "—"),
      sortAccessor: (l) => l.total_amount_usd ?? 0,
    },
  ]
}

export const PO_LINE_COLUMN_META: ColumnVisibilityMeta[] = buildColumns({}).map(
  ({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }),
)

function POLineTable({ items, hidden, pinning, onPinningChange, manufacturerName }: Props) {
  return (
    <MetaTable
      tableId={PO_LINE_TABLE_ID}
      columns={buildColumns({ manufacturerName })}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      getRowKey={(l) => l.po_line_id}
      emptyMessage="발주품목이 없습니다"
    />
  )
}

export default memo(POLineTable)
