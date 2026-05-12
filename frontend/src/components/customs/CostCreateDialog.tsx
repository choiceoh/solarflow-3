// 면장 원가(Cost Detail) 신규 등록 다이얼로그.
// 비유: 면장 한 건의 품목별 CIF 원가 — 수량 × 환율로 cif_total_krw, cif_wp_krw 자동.
// PR #357 이전 CostForm (257줄) 의 슬림 후계자.

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import FormField from "@/components/common/FormField"
import { ProductCombobox } from "@/components/common/ProductCombobox"
import { fetchWithAuth } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import type { DeclarationCost } from "@/types/customs"
import type { Product } from "@/types/masters"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (cost: DeclarationCost) => void
  declarationId: string
  /** 면장 헤더에서 알려진 환율 prefill. */
  initialExchangeRate?: number
}

function fmtIntKR(v: string): string {
  const raw = v.replace(/[^0-9-]/g, "")
  if (!raw) return ""
  const n = Number(raw)
  return Number.isFinite(n) ? n.toLocaleString("ko-KR") : ""
}

function parseSignedInt(v: string): number | null {
  const raw = v.replace(/[^0-9-]/g, "")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function productSpecWp(product?: Product): number | undefined {
  if (!product) return undefined
  if (product.spec_wp && Number.isFinite(product.spec_wp)) return product.spec_wp
  if (product.wattage_kw && Number.isFinite(product.wattage_kw)) return product.wattage_kw * 1000
  return undefined
}

export default function CostCreateDialog({
  open,
  onClose,
  onCreated,
  declarationId,
  initialExchangeRate,
}: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [exchangeRate, setExchangeRate] = useState(
    initialExchangeRate ? String(initialExchangeRate) : "",
  )
  const [cifTotalKrwDisplay, setCifTotalKrwDisplay] = useState("")
  const [fobUnitUsd, setFobUnitUsd] = useState("")
  const [tariffRate, setTariffRate] = useState("")
  const [tariffAmount, setTariffAmount] = useState("")
  const [vatAmount, setVatAmount] = useState("")
  const [customsFee, setCustomsFee] = useState("")
  const [incidentalCost, setIncidentalCost] = useState("")
  const [memo, setMemo] = useState("")

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setProductId("")
    setQuantity("")
    setExchangeRate(initialExchangeRate ? String(initialExchangeRate) : "")
    setCifTotalKrwDisplay("")
    setFobUnitUsd("")
    setTariffRate("")
    setTariffAmount("")
    setVatAmount("")
    setCustomsFee("")
    setIncidentalCost("")
    setMemo("")
    setErrors({})
    dirtyRef.current = false
  }, [open, initialExchangeRate])

  useEffect(() => {
    if (!open) return
    fetchWithAuth<Product[]>("/api/v1/products?active=true")
      .then((list) => setProducts(list))
      .catch(() => setProducts([]))
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [open])

  async function attemptClose() {
    if (dirtyRef.current) {
      const ok = await confirmDialog({
        title: "저장하지 않은 변경 내용",
        description: "입력 중인 원가 정보가 있습니다. 저장하지 않고 닫으시겠어요?",
        confirmLabel: "닫기",
        variant: "destructive",
      })
      if (!ok) return
    }
    onClose()
  }

  const product = useMemo(
    () => products.find((p) => p.product_id === productId),
    [products, productId],
  )
  const specWp = productSpecWp(product)
  const qty = Number(quantity)
  const cifTotalKrw = parseSignedInt(cifTotalKrwDisplay) ?? 0
  const capacityWp = specWp && qty > 0 ? specWp * qty : 0
  const cifWpKrw = capacityWp > 0 && cifTotalKrw !== 0 ? cifTotalKrw / capacityWp : 0
  const capacityKw = capacityWp / 1000

  // landed_total_krw 미리보기 (LandedCostPanel 가 정확한 분배를 처리하지만 입력 중 감을 잡게 합산)
  const landedTotalKrw =
    cifTotalKrw +
    (parseSignedInt(tariffAmount) ?? 0) +
    (parseSignedInt(customsFee) ?? 0) +
    (parseSignedInt(incidentalCost) ?? 0)
  const landedWpKrw = capacityWp > 0 ? landedTotalKrw / capacityWp : 0

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!productId) next.product = "품번을 선택해주세요"
    if (!Number.isFinite(qty) || qty <= 0) next.quantity = "수량은 0보다 커야 합니다"
    const r = Number(exchangeRate)
    if (!Number.isFinite(r) || r <= 0) next.exchangeRate = "환율은 0보다 커야 합니다"
    if (!cifTotalKrwDisplay || cifTotalKrw === 0) next.cifTotal = "CIF 총원화는 필수"
    if (!specWp) next.product = "품번에 spec_wp 가 없습니다"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      const fobUsd = Number(fobUnitUsd) || undefined
      const payload: Record<string, unknown> = {
        declaration_id: declarationId,
        product_id: productId,
        quantity: qty,
        capacity_kw: capacityKw,
        exchange_rate: Number(exchangeRate),
        cif_total_krw: cifTotalKrw,
        cif_wp_krw: cifWpKrw,
        fob_unit_usd: fobUsd,
        fob_total_usd: fobUsd ? fobUsd * qty : undefined,
        cif_total_usd: cifTotalKrw && Number(exchangeRate) > 0
          ? cifTotalKrw / Number(exchangeRate)
          : undefined,
        cif_unit_usd:
          cifTotalKrw && qty > 0 && Number(exchangeRate) > 0
            ? cifTotalKrw / Number(exchangeRate) / qty
            : undefined,
        tariff_rate: tariffRate ? Number(tariffRate) : undefined,
        tariff_amount: parseSignedInt(tariffAmount) ?? undefined,
        vat_amount: parseSignedInt(vatAmount) ?? undefined,
        customs_fee: parseSignedInt(customsFee) ?? undefined,
        incidental_cost: parseSignedInt(incidentalCost) ?? undefined,
        landed_total_krw: landedTotalKrw || undefined,
        landed_wp_krw: landedWpKrw || undefined,
        memo: memo.trim() || undefined,
      }
      const created = await fetchWithAuth<DeclarationCost>("/api/v1/cost-details", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      notify.success(`원가 라인 등록 완료 (Landed ${Math.round(landedWpKrw).toLocaleString("ko-KR")}원/Wp)`)
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "원가 등록 실패")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) attemptClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>원가 라인 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            FOB → CIF → Landed 3단계 원가. Wp 단가는 자동 계산.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <FormField size="dense" label="품번" required error={errors.product}>
            <ProductCombobox
              products={products}
              value={productId}
              onChange={(v) => {
                markDirty()
                setProductId(v)
              }}
              error={!!errors.product}
              placeholder="품번 선택"
            />
            {product && (
              <div className="mt-1 text-[10px] text-muted-foreground">
                {specWp ? `${specWp}Wp` : "spec_wp —"}
                {capacityKw > 0 ? ` · 총 ${capacityKw.toFixed(1)} kW` : ""}
              </div>
            )}
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField size="dense" label="수량" required error={errors.quantity}>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => {
                  markDirty()
                  setQuantity(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="환율" required error={errors.exchangeRate}>
              <Input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => {
                  markDirty()
                  setExchangeRate(e.target.value)
                }}
                placeholder="1380.00"
              />
            </FormField>
            <FormField size="dense" label="FOB 단가 USD">
              <Input
                type="number"
                step="0.001"
                value={fobUnitUsd}
                onChange={(e) => {
                  markDirty()
                  setFobUnitUsd(e.target.value)
                }}
                placeholder="0.085"
              />
            </FormField>
          </div>

          <FormField size="dense" label="CIF 총원화" required error={errors.cifTotal}>
            <Input
              type="text"
              inputMode="numeric"
              value={cifTotalKrwDisplay}
              onChange={(e) => {
                markDirty()
                setCifTotalKrwDisplay(fmtIntKR(e.target.value))
              }}
              placeholder="0"
            />
            {capacityWp > 0 && cifTotalKrw !== 0 ? (
              <div className="mt-1 text-[10px] text-muted-foreground">
                CIF Wp 원화 자동: {cifWpKrw.toFixed(2)}원/Wp
              </div>
            ) : null}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="관세율 (%)">
              <Input
                type="number"
                step="0.1"
                value={tariffRate}
                onChange={(e) => {
                  markDirty()
                  setTariffRate(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="관세액">
              <Input
                type="text"
                inputMode="numeric"
                value={tariffAmount}
                onChange={(e) => {
                  markDirty()
                  setTariffAmount(fmtIntKR(e.target.value))
                }}
              />
            </FormField>
            <FormField size="dense" label="부가세액">
              <Input
                type="text"
                inputMode="numeric"
                value={vatAmount}
                onChange={(e) => {
                  markDirty()
                  setVatAmount(fmtIntKR(e.target.value))
                }}
              />
            </FormField>
            <FormField size="dense" label="통관 수수료">
              <Input
                type="text"
                inputMode="numeric"
                value={customsFee}
                onChange={(e) => {
                  markDirty()
                  setCustomsFee(fmtIntKR(e.target.value))
                }}
              />
            </FormField>
            <FormField size="dense" label="기타 부대비용" className="col-span-2">
              <Input
                type="text"
                inputMode="numeric"
                value={incidentalCost}
                onChange={(e) => {
                  markDirty()
                  setIncidentalCost(fmtIntKR(e.target.value))
                }}
              />
            </FormField>
          </div>

          <div className="rounded-md border border-[var(--line)] bg-muted/20 p-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Landed 총원화 (미리보기)</span>
              <span className="mono font-semibold">
                {landedTotalKrw ? landedTotalKrw.toLocaleString("ko-KR") : "—"}원
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Landed Wp 단가</span>
              <span className="mono font-semibold">
                {landedWpKrw ? landedWpKrw.toFixed(2) : "—"}원/Wp
              </span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              정확한 BL 부대비용 분배는 등록 후 LandedCostPanel 의 '미리보기/저장' 으로 확정.
            </p>
          </div>

          <FormField size="dense" label="메모">
            <Textarea
              value={memo}
              onChange={(e) => {
                markDirty()
                setMemo(e.target.value)
              }}
              rows={2}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={attemptClose} disabled={submitting}>
            취소
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {submitting ? "등록 중..." : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
