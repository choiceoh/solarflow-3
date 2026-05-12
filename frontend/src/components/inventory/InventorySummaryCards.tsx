import { useMemo } from "react"
import { motion } from "motion/react"
import { Package, Truck, Shield } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { formatMW } from "@/lib/utils"
import { NumberTween } from "@/components/common/NumberTween"
import type { InventorySummary, InventoryItem } from "@/types/inventory"

const cardEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
}

interface Props {
  summary: InventorySummary
  items?: InventoryItem[]
  onCardClick?: (tab: "physical" | "incoming" | "avail") => void
}

const kwToEa = (kw: number, specWp: number) => (specWp > 0 ? Math.round((kw * 1000) / specWp) : 0)

/** kW → 자동 단위 (1,000kW 미만 = kW, 이상 = MW) */
function fmw(kw: number): string {
  if (kw <= 0) return "0 kW"
  if (kw >= 1000) return (kw / 1000).toFixed(2) + " MW"
  return Math.round(kw).toLocaleString("ko-KR") + " kW"
}

export default function InventorySummaryCards({ summary, items, onCardClick }: Props) {
  // 품목별 수치 합산 (차감 내역 + EA)
  const agg = useMemo(() => {
    if (!items?.length) {
      return {
        reserved: 0,
        allocated: 0,
        incomingReserved: 0,
        available: summary.total_available_kw,
        availableIncoming: summary.total_secured_kw - summary.total_available_kw,
        ea: { physical: 0, incoming: 0, secured: 0 },
      }
    }
    return {
      reserved: items.reduce((s, it) => s + (it.reserved_kw || 0), 0),
      allocated: items.reduce((s, it) => s + (it.allocated_kw || 0), 0),
      incomingReserved: items.reduce((s, it) => s + (it.incoming_reserved_kw || 0), 0),
      available: items.reduce((s, it) => s + (it.available_kw || 0), 0),
      availableIncoming: items.reduce((s, it) => s + (it.available_incoming_kw || 0), 0),
      ea: {
        physical: items.reduce((s, it) => s + kwToEa(it.physical_kw, it.spec_wp), 0),
        incoming: items.reduce((s, it) => s + kwToEa(it.incoming_kw, it.spec_wp), 0),
        secured: items.reduce((s, it) => s + kwToEa(it.total_secured_kw, it.spec_wp), 0),
      },
    }
  }, [items, summary])

  return (
    <motion.div
      className="grid grid-cols-3 gap-3"
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.05 }}
    >
      {/* 실재고 */}
      <motion.div variants={cardEnter} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <Card
          className={onCardClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
          onClick={() => onCardClick?.("physical")}
        >
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-blue-600 bg-blue-50 shrink-0">
              <Package className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">실재고</p>
              <p className="text-lg font-semibold leading-tight tabular-nums">
                <NumberTween value={summary.total_physical_kw} format={formatMW} />
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                {Math.round(summary.total_physical_kw).toLocaleString("ko-KR")}kW
                {items?.length ? (
                  <span className="ml-1">· {agg.ea.physical.toLocaleString("ko-KR")}EA</span>
                ) : null}
              </p>
              {(agg.reserved > 0 || agg.allocated > 0) && (
                <div className="mt-1.5 space-y-0.5">
                  {agg.reserved > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-red-400">− 수주예약</span>{" "}
                      <span className="tabular-nums">{fmw(agg.reserved)}</span>
                    </div>
                  )}
                  {agg.allocated > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      <span className="text-red-400">− 배정</span>{" "}
                      <span className="tabular-nums">{fmw(agg.allocated)}</span>
                    </div>
                  )}
                  <div className="text-[10px] border-t border-border/60 pt-0.5 mt-0.5 font-medium tabular-nums text-foreground">
                    소계 {fmw(agg.available)}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 미착품 */}
      <motion.div variants={cardEnter} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <Card
          className={onCardClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
          onClick={() => onCardClick?.("incoming")}
        >
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-yellow-600 bg-yellow-50 shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">미착품</p>
              <p className="text-lg font-semibold leading-tight tabular-nums">
                <NumberTween value={summary.total_incoming_kw} format={formatMW} />
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                {Math.round(summary.total_incoming_kw).toLocaleString("ko-KR")}kW
                {items?.length ? (
                  <span className="ml-1">· {agg.ea.incoming.toLocaleString("ko-KR")}EA</span>
                ) : null}
              </p>
              {agg.incomingReserved > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground">
                    <span className="text-red-400">− 미착예약</span>{" "}
                    <span className="tabular-nums">{fmw(agg.incomingReserved)}</span>
                  </div>
                  <div className="text-[10px] border-t border-border/60 pt-0.5 mt-0.5 font-medium tabular-nums text-foreground">
                    소계 {fmw(agg.availableIncoming)}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 가용재고 */}
      <motion.div variants={cardEnter} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
        <Card
          className={onCardClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
          onClick={() => onCardClick?.("avail")}
        >
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-green-600 bg-green-50 shrink-0">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">가용재고</p>
              <p className="text-lg font-semibold leading-tight tabular-nums text-green-700">
                <NumberTween value={summary.total_secured_kw} format={formatMW} />
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                {Math.round(summary.total_secured_kw).toLocaleString("ko-KR")}kW
                {items?.length ? (
                  <span className="ml-1">· {agg.ea.secured.toLocaleString("ko-KR")}EA</span>
                ) : null}
              </p>
              <div className="mt-1.5 space-y-0.5">
                <div className="text-[10px] text-muted-foreground">
                  현재고 <span className="tabular-nums text-foreground">{fmw(agg.available)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  미착{" "}
                  <span className="tabular-nums text-foreground">{fmw(agg.availableIncoming)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
