import { useEffect, useState } from "react"
import { CheckCircle2, ClipboardCheck, FilePlus2, Ship } from "lucide-react"
import { formatNumber } from "@/lib/utils"
import { fetchWithAuth } from "@/lib/api"
import { Button } from "@/components/ui/button"
import SkeletonRows from "@/components/common/SkeletonRows"
import ProgressMiniBar from "@/components/common/ProgressMiniBar"
import type { BLShipment, BLLineItem } from "@/types/inbound"
import type { LCLineItem, LCRecord, POLineItem } from "@/types/procurement"

interface Props {
  poId: string
  poLines: POLineItem[]
  onCreateLC?: (initial: { poLineId: string; targetQty?: number; amountUsd?: number }) => void
  onOpenBLTab?: (line: POLineItem) => void
  onSelectBL?: (blId: string) => void
}

function estimateLineAmountUsd(line: POLineItem, quantity: number): number | undefined {
  if (!Number.isFinite(quantity) || quantity <= 0) return undefined
  if (line.unit_price_usd && line.unit_price_usd > 0) return line.unit_price_usd * quantity
  const specWp = line.products?.spec_wp ?? line.spec_wp ?? 0
  if (line.unit_price_usd_wp && line.unit_price_usd_wp > 0 && specWp > 0) {
    return line.unit_price_usd_wp * specWp * quantity
  }
  if (line.total_amount_usd && line.quantity > 0) {
    return (line.total_amount_usd / line.quantity) * quantity
  }
  return undefined
}

// D-061: PO 입고현황은 프론트에서 B/L 수량 합산
export default function POInboundProgress({
  poId,
  poLines,
  onCreateLC,
  onOpenBLTab,
  onSelectBL,
}: Props) {
  const [bls, setBls] = useState<BLShipment[]>([])
  const [blLinesByBl, setBlLinesByBl] = useState<Record<string, BLLineItem[]>>({})
  const [lcs, setLcs] = useState<LCRecord[]>([])
  const [lcLinesByLc, setLcLinesByLc] = useState<Record<string, LCLineItem[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        // B/L 목록 + LC 목록 동시 조회
        const [blList, lcList] = await Promise.all([
          fetchWithAuth<BLShipment[]>(`/api/v1/bls?po_id=${poId}`),
          fetchWithAuth<LCRecord[]>(`/api/v1/lcs?po_id=${poId}`),
        ])
        if (cancelled) return
        setBls(blList)
        setLcs(lcList)

        // 각 B/L/LC의 라인아이템 조회하여 수량 합산
        const [lineMap, lcLineMap] = await Promise.all([
          (async () => {
            const map: Record<string, BLLineItem[]> = {}
            await Promise.all(
              blList.map(async (bl) => {
                try {
                  const lines = await fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`)
                  map[bl.bl_id] = lines
                } catch {
                  map[bl.bl_id] = []
                }
              }),
            )
            return map
          })(),
          (async () => {
            const map: Record<string, LCLineItem[]> = {}
            await Promise.all(
              lcList.map(async (lc) => {
                try {
                  const lines = await fetchWithAuth<LCLineItem[]>(`/api/v1/lcs/${lc.lc_id}/lines`)
                  map[lc.lc_id] = lines
                } catch {
                  map[lc.lc_id] = []
                }
              }),
            )
            return map
          })(),
        ])
        if (!cancelled) setBlLinesByBl(lineMap)
        if (!cancelled) setLcLinesByLc(lcLineMap)
      } catch {
        if (!cancelled) {
          setBls([])
          setLcs([])
          setBlLinesByBl({})
          setLcLinesByLc({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [poId])

  if (loading) return <SkeletonRows rows={4} />

  // 계약량: PO 라인아이템 수량 합계
  const contractQty = poLines.reduce((s, l) => s + l.quantity, 0)

  // LC 개설량: 해당 PO에 연결된 LC의 target_qty 합계
  const lcQty = lcs.reduce((s, lc) => s + (lc.target_qty ?? 0), 0)

  // B/L 라인아이템에서 수량 합산
  const allLines = Object.values(blLinesByBl).flat()
  const sumQtyByBlStatus = (statuses: string[]) => {
    const matchedBlIds = new Set(bls.filter((b) => statuses.includes(b.status)).map((b) => b.bl_id))
    return allLines.filter((l) => matchedBlIds.has(l.bl_id)).reduce((s, l) => s + l.quantity, 0)
  }

  // 선적완료: shipping 이후 상태 (shipping, arrived, customs, completed, erp_done)
  const shippedQty = sumQtyByBlStatus(["shipping", "arrived", "customs", "completed", "erp_done"])
  // 입고완료: completed, erp_done
  const completedQty = sumQtyByBlStatus(["completed", "erp_done"])
  // 잔여량: 계약량 - 입고완료
  const remainQty = contractQty - completedQty

  // 진행률: (입고완료 / 계약량) x 100%
  const progressPct = contractQty > 0 ? Math.min((completedQty / contractQty) * 100, 100) : 0
  const barColor =
    progressPct >= 80 ? "bg-green-500" : progressPct >= 50 ? "bg-yellow-500" : "bg-red-500"
  const progressTone =
    progressPct >= 80 ? "var(--sf-pos)" : progressPct >= 50 ? "var(--sf-warn)" : "var(--sf-neg)"

  const poLineIdsByProduct = new Map<string, string[]>()
  for (const line of poLines) {
    const ids = poLineIdsByProduct.get(line.product_id) ?? []
    ids.push(line.po_line_id)
    poLineIdsByProduct.set(line.product_id, ids)
  }
  const resolveLineKey = (poLineId: string | undefined, productId: string): string | null => {
    if (poLineId) return poLineId
    const ids = poLineIdsByProduct.get(productId)
    return ids?.length === 1 ? ids[0] : null
  }
  const lcQtyByLine = new Map<string, number>()
  for (const lcLine of Object.values(lcLinesByLc).flat()) {
    const key = resolveLineKey(lcLine.po_line_id, lcLine.product_id)
    if (!key) continue
    lcQtyByLine.set(key, (lcQtyByLine.get(key) ?? 0) + lcLine.quantity)
  }
  const shippedQtyByLine = new Map<string, number>()
  const completedQtyByLine = new Map<string, number>()
  const actionBlIdByLine = new Map<string, string>()
  const shipStatuses = new Set(["shipping", "arrived", "customs", "completed", "erp_done"])
  const completedStatuses = new Set(["completed", "erp_done"])
  const actionBlStatuses = new Set(["scheduled", "shipping", "arrived", "customs"])
  for (const bl of bls) {
    for (const blLine of blLinesByBl[bl.bl_id] ?? []) {
      const key = resolveLineKey(blLine.po_line_id, blLine.product_id)
      if (!key) continue
      if (shipStatuses.has(bl.status)) {
        shippedQtyByLine.set(key, (shippedQtyByLine.get(key) ?? 0) + blLine.quantity)
      }
      if (completedStatuses.has(bl.status)) {
        completedQtyByLine.set(key, (completedQtyByLine.get(key) ?? 0) + blLine.quantity)
      }
      if (actionBlStatuses.has(bl.status) && !actionBlIdByLine.has(key)) {
        actionBlIdByLine.set(key, bl.bl_id)
      }
    }
  }
  const lineRows = poLines.map((line) => {
    const lcLineQty = lcQtyByLine.get(line.po_line_id) ?? 0
    const shippedLineQty = shippedQtyByLine.get(line.po_line_id) ?? 0
    const completedLineQty = completedQtyByLine.get(line.po_line_id) ?? 0
    const specWp = line.products?.spec_wp ?? line.spec_wp
    const pct = line.quantity > 0 ? Math.min((completedLineQty / line.quantity) * 100, 100) : 0
    const lcRemainQty = Math.max(0, line.quantity - lcLineQty)
    return {
      line,
      label:
        [line.product_code ?? line.products?.product_code, specWp ? `${specWp}Wp` : ""]
          .filter(Boolean)
          .join(" · ") ||
        line.product_name ||
        line.products?.product_name ||
        "—",
      lcQty: lcLineQty,
      shippedQty: shippedLineQty,
      completedQty: completedLineQty,
      remainQty: Math.max(0, line.quantity - completedLineQty),
      lcRemainQty,
      shipRemainQty: Math.max(0, line.quantity - shippedLineQty),
      activeBlId: actionBlIdByLine.get(line.po_line_id),
      lcAmountUsd: estimateLineAmountUsd(line, lcRemainQty),
      pct,
    }
  })

  const stats = [
    { label: "계약량", value: contractQty },
    { label: "LC개설량", value: lcQty },
    { label: "선적완료", value: shippedQty },
    { label: "입고완료", value: completedQty, tone: "var(--sf-pos)" },
    { label: "잔여량", value: remainQty, tone: remainQty > 0 ? "var(--sf-warn)" : undefined },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-md p-3"
            style={{ background: "var(--sf-surface)", border: "1px solid var(--sf-line)" }}
          >
            <span className="sf-eyebrow">{s.label}</span>
            <span
              className="sf-mono text-base font-semibold tabular-nums"
              style={{ color: s.tone || "var(--sf-ink)" }}
            >
              {formatNumber(s.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="sf-eyebrow">입고 진행률</span>
          <span
            className="sf-mono text-[13px] font-semibold tabular-nums"
            style={{ color: progressTone }}
          >
            {progressPct.toFixed(0)}%
          </span>
        </div>
        <ProgressMiniBar
          percent={progressPct}
          colorClassName={barColor}
          className="h-2.5 w-full"
          barClassName="transition-all"
        />
      </div>

      {lineRows.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <div className="border-b bg-muted/30 px-3 py-2 text-xs font-semibold">라인별 진행률</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-xs">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">품목</th>
                  <th className="px-3 py-2 text-right font-medium">계약</th>
                  <th className="px-3 py-2 text-right font-medium">LC</th>
                  <th className="px-3 py-2 text-right font-medium">선적</th>
                  <th className="px-3 py-2 text-right font-medium">입고</th>
                  <th className="px-3 py-2 text-right font-medium">잔여</th>
                  <th className="px-3 py-2 text-left font-medium">입고율</th>
                  <th className="px-3 py-2 text-right font-medium">조치</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lineRows.map((row) => (
                  <tr key={row.line.po_line_id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.line.product_name ?? row.line.products?.product_name ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumber(row.line.quantity)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(row.lcQty)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumber(row.shippedQty)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-green-700">
                      {formatNumber(row.completedQty)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatNumber(row.remainQty)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ProgressMiniBar
                          percent={row.pct}
                          colorClassName={
                            row.pct >= 80
                              ? "bg-green-500"
                              : row.pct >= 50
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }
                          className="h-1.5 w-24"
                        />
                        <span className="font-mono text-[11px]">{row.pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {row.remainQty <= 0 ? (
                        <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          완료
                        </span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {row.lcRemainQty > 0 && onCreateLC && (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                onCreateLC({
                                  poLineId: row.line.po_line_id,
                                  targetQty: row.lcRemainQty,
                                  amountUsd: row.lcAmountUsd,
                                })
                              }
                            >
                              <FilePlus2 className="mr-1 h-3 w-3" />
                              LC 작성
                            </Button>
                          )}
                          {row.shipRemainQty > 0 && onOpenBLTab && (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => onOpenBLTab(row.line)}
                            >
                              <Ship className="mr-1 h-3 w-3" />
                              B/L 연결
                            </Button>
                          )}
                          {row.activeBlId && onSelectBL && (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => onSelectBL(row.activeBlId!)}
                            >
                              <ClipboardCheck className="mr-1 h-3 w-3" />
                              입고 확인
                            </Button>
                          )}
                          {!(row.lcRemainQty > 0 && onCreateLC) &&
                            !(row.shipRemainQty > 0 && onOpenBLTab) &&
                            !(row.activeBlId && onSelectBL) && (
                              <span className="text-[11px] text-muted-foreground">대기</span>
                            )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
