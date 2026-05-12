// BL(입고/Bill of Lading) 신규 등록 다이얼로그.
// 비유: 컨테이너 한 통 — BL 번호·인보이스 헤더 + 품목 라인 N개.
// PR #357 이전 BLForm (2,079줄) 의 슬림 후계자. OCR/결제조건 위젯/PO cascade 는
// 별도 PR(보조기능)에서 부착 — 이 파일은 기본 흐름만.

import { useEffect, useMemo, useRef, useState } from "react"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import { Loader2, Plus, Trash2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import FormField from "@/components/common/FormField"
import { ProductCombobox } from "@/components/common/ProductCombobox"
import BLOcrWidget, { type BLOcrApplyArgs } from "@/domains/bl/ocr-widget"
import BLPaymentTermsWidget from "@/domains/bl/payment-terms-widget"
import { fetchWithAuth } from "@/lib/api"
import {
  findProductForOCRLine,
  normalizeOCRDate,
  normalizeOCRDecimal,
  normalizeOCRIdentifier,
  parseOCRNumber,
} from "@/lib/blOcr"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import { useAppStore } from "@/stores/appStore"
import {
  BL_STATUS_LABEL,
  BL_STATUS_ORDER,
  INBOUND_TYPE_LABEL,
  type BLLineItem,
  type BLShipment,
  type BLStatus,
  type InboundType,
} from "@/types/inbound"
import type { Manufacturer, Product, Warehouse } from "@/types/masters"

interface DraftLine {
  key: string
  product_id: string
  quantity: string
  item_type: "main" | "spare"
  payment_type: "paid" | "free"
  usage_category: string
  memo: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (bl: BLShipment) => void
  /** 제조사 기본값 — BL 목록 필터 컨텍스트에서 진입 시 prefill. */
  initialManufacturerId?: string
}

const INBOUND_TYPE_OPTIONS = Object.entries(INBOUND_TYPE_LABEL) as [InboundType, string][]
const USAGE_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "sale", label: "판매" },
  { value: "construction", label: "공사" },
  { value: "spare", label: "스페어" },
  { value: "replacement", label: "교체" },
  { value: "repowering", label: "리파워링" },
  { value: "transfer", label: "이동" },
  { value: "adjustment", label: "조정" },
  { value: "maintenance", label: "유지관리" },
  { value: "disposal", label: "폐기" },
  { value: "other", label: "기타" },
]

function newLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    product_id: "",
    quantity: "",
    item_type: "main",
    payment_type: "paid",
    usage_category: "sale",
    memo: "",
  }
}

function newLineFrom(template?: DraftLine): DraftLine {
  if (!template) return newLine()
  return {
    key: crypto.randomUUID(),
    product_id: "",
    quantity: "",
    item_type: template.item_type,
    payment_type: template.payment_type,
    usage_category: template.usage_category,
    memo: "",
  }
}

function isBlankLine(line: DraftLine): boolean {
  return !line.product_id && !line.quantity && !line.memo
}

function productSpecWp(product?: Product): number | undefined {
  if (!product) return undefined
  if (product.spec_wp && Number.isFinite(product.spec_wp)) return product.spec_wp
  if (product.wattage_kw && Number.isFinite(product.wattage_kw)) return product.wattage_kw * 1000
  return undefined
}

export default function BLCreateDialog({
  open,
  onClose,
  onCreated,
  initialManufacturerId,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({})
  const [lineErrors, setLineErrors] = useState<Map<string, string[]>>(() => new Map())
  const [linesParent] = useAutoAnimate<HTMLDivElement>()

  // 헤더
  const [blNumber, setBlNumber] = useState("")
  const [manufacturerId, setManufacturerId] = useState("")
  const [inboundType, setInboundType] = useState<InboundType>("import")
  const [currency, setCurrency] = useState<"USD" | "KRW">("USD")
  const [status, setStatus] = useState<BLStatus>("scheduled")
  const [etd, setEtd] = useState("")
  const [eta, setEta] = useState("")
  const [actualArrival, setActualArrival] = useState("")
  const [port, setPort] = useState("")
  const [forwarder, setForwarder] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [exchangeRate, setExchangeRate] = useState("")
  const [paymentTerms, setPaymentTerms] = useState("")
  const [memo, setMemo] = useState("")

  // OCR
  const [ocrSummary, setOcrSummary] = useState("")

  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()])

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setBlNumber("")
    setManufacturerId(initialManufacturerId ?? "")
    setInboundType("import")
    setCurrency("USD")
    setStatus("scheduled")
    setEtd("")
    setEta("")
    setActualArrival("")
    setPort("")
    setForwarder("")
    setWarehouseId("")
    setInvoiceNumber("")
    setExchangeRate("")
    setPaymentTerms("")
    setMemo("")
    setOcrSummary("")
    setLines([newLine()])
    setHeaderErrors({})
    setLineErrors(new Map())
    dirtyRef.current = false
  }, [open, initialManufacturerId])

  useEffect(() => {
    if (!open) return
    fetchWithAuth<Manufacturer[]>("/api/v1/manufacturers")
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => setManufacturers([]))
    fetchWithAuth<Product[]>("/api/v1/products?active=true")
      .then((list) => setProducts(list))
      .catch(() => setProducts([]))
    fetchWithAuth<Warehouse[]>("/api/v1/warehouses")
      .then((list) => setWarehouses(list.filter((w) => w.is_active)))
      .catch(() => setWarehouses([]))
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
        description: "입력 중인 BL 정보가 있습니다. 저장하지 않고 닫으시겠어요?",
        confirmLabel: "닫기",
        variant: "destructive",
      })
      if (!ok) return
    }
    onClose()
  }

  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of products) map.set(p.product_id, p)
    return map
  }, [products])

  const productListForCombobox = useMemo<Product[]>(() => {
    if (!manufacturerId) return products
    return products.filter((p) => p.manufacturer_id === manufacturerId)
  }, [products, manufacturerId])

  function updateLine(key: string, patch: Partial<DraftLine>) {
    markDirty()
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    setLineErrors((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  function appendBlankLine() {
    markDirty()
    setLines((prev) => {
      const template = [...prev].reverse().find((l) => !isBlankLine(l)) ?? prev[prev.length - 1]
      return [...prev, newLineFrom(template)]
    })
  }

  // OCR apply — 면장 OCR 결과를 header/line 상태에 흡수.
  // 비유: OCR 위젯이 "면장 한 장을 다 읽었어요" 하고 들고 온 거 → 사용자가 review 다이얼로그에서
  // 후보 선택 + 품번 override 까지 마친 결과 = 우리 폼이 그대로 받아쓰기만 하면 됨.
  async function applyOcr(args: BLOcrApplyArgs) {
    const { fields, productOverrides, productSource } = args
    const ocrLines = fields.line_items ?? []

    // 사용자가 이미 라인을 채워뒀으면 OCR 라인이 덮어쓰기 전에 의도 확인 —
    // 빈 라인만 있으면 묻지 않고 그냥 교체.
    const hasUserLines = lines.some((l) => !isBlankLine(l))
    if (hasUserLines && ocrLines.length > 0) {
      const ok = await confirmDialog({
        title: "기존 라인을 OCR 결과로 덮어쓸까요?",
        description: `이미 입력된 라인 ${lines.filter((l) => !isBlankLine(l)).length}건이 있습니다. OCR ${ocrLines.length}건으로 교체됩니다.`,
        confirmLabel: "교체",
        variant: "destructive",
      })
      if (!ok) return
    }

    markDirty()

    // 헤더 매핑
    if (fields.bl_number?.value) setBlNumber(normalizeOCRIdentifier(fields.bl_number.value))
    if (fields.invoice_number?.value)
      setInvoiceNumber(normalizeOCRIdentifier(fields.invoice_number.value))
    if (fields.exchange_rate?.value) {
      const r = normalizeOCRDecimal(fields.exchange_rate.value)
      if (r) setExchangeRate(r)
    }
    if (fields.port?.value) setPort(fields.port.value.trim())
    if (fields.forwarder?.value) setForwarder(fields.forwarder.value.trim())
    if (fields.arrival_date?.value) {
      const d = normalizeOCRDate(fields.arrival_date.value)
      if (d) setActualArrival(d)
    }

    // 라인 매핑 — productOverrides 우선, 없으면 findProductForOCRLine 으로 fuzzy 매칭
    if (ocrLines.length > 0) {
      const newLines: DraftLine[] = ocrLines.map((ocrLine, idx) => {
        const overrideId = productOverrides[idx]
        const product = overrideId
          ? productSource.find((p) => p.product_id === overrideId)
          : findProductForOCRLine(ocrLine, productSource)
        const qty = parseOCRNumber(ocrLine.quantity?.value)
        const isFree = ocrLine.payment_type?.value === "free"
        return {
          key: crypto.randomUUID(),
          product_id: product?.product_id ?? "",
          quantity: qty != null && qty > 0 ? String(qty) : "",
          item_type: "main",
          payment_type: isFree ? "free" : "paid",
          usage_category: "sale",
          memo: "",
        }
      })
      setLines(newLines.length > 0 ? newLines : [newLine()])
    }

    // 매핑 요약 — 위젯이 표시
    const headerHits = [
      fields.bl_number?.value && "BL번호",
      fields.invoice_number?.value && "인보이스",
      fields.exchange_rate?.value && "환율",
      fields.port?.value && "입항지",
      fields.forwarder?.value && "포워더",
      fields.arrival_date?.value && "입항일",
    ].filter(Boolean) as string[]
    setOcrSummary(
      `헤더 ${headerHits.length}개 + 라인 ${ocrLines.length}건 반영${headerHits.length ? ` (${headerHits.join(", ")})` : ""}`,
    )
  }

  function removeLine(key: string) {
    markDirty()
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
    setLineErrors((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  const totals = useMemo(() => {
    let qty = 0
    let mw = 0
    for (const l of lines) {
      const q = Number(l.quantity)
      if (!Number.isFinite(q) || q <= 0) continue
      qty += q
      const specWp = productSpecWp(productById.get(l.product_id))
      if (specWp) mw += (specWp * q) / 1_000_000
    }
    return { qty, mw }
  }, [lines, productById])

  function validate(): { header: Record<string, string>; lineMap: Map<string, string[]>; total: number } {
    const next: Record<string, string> = {}
    const linesMap = new Map<string, string[]>()
    let count = 0

    if (!selectedCompanyId || selectedCompanyId === "all") {
      next.company = "좌측 상단에서 법인을 먼저 선택해주세요"
      count++
    }
    if (!blNumber.trim()) {
      next.blNumber = "BL 번호는 필수"
      count++
    }
    // manufacturer 는 inbound_type=group 일 때 면제
    if (!manufacturerId && inboundType !== "group") {
      next.manufacturer = "제조사를 선택해주세요"
      count++
    }
    if (exchangeRate) {
      const r = Number(exchangeRate)
      if (!Number.isFinite(r) || r <= 0) {
        next.exchangeRate = "환율은 0보다 커야 합니다"
        count++
      }
    }
    if (lines.length === 0) {
      next.lines = "라인을 1개 이상 추가해주세요"
      count++
    }
    for (const [i, l] of lines.entries()) {
      const errs: string[] = []
      const n = i + 1
      if (!l.product_id) errs.push(`${n}행: 품번을 선택해주세요`)
      const q = Number(l.quantity)
      if (!Number.isFinite(q) || q <= 0) errs.push(`${n}행: 수량은 0보다 커야 합니다`)
      const product = productById.get(l.product_id)
      const specWp = productSpecWp(product)
      if (l.product_id && !specWp) errs.push(`${n}행: 품번에 spec_wp 가 없습니다`)
      if (errs.length > 0) {
        linesMap.set(l.key, errs)
        count += errs.length
      }
    }
    return { header: next, lineMap: linesMap, total: count }
  }

  async function handleSubmit() {
    const result = validate()
    if (result.total > 0) {
      setHeaderErrors(result.header)
      setLineErrors(result.lineMap)
      const summary = [
        ...Object.values(result.header),
        ...Array.from(result.lineMap.values()).flat(),
      ]
      const head = summary.slice(0, 5).join(" · ")
      const tail = summary.length > 5 ? ` 외 ${summary.length - 5}건` : ""
      notify.error(`확인이 필요한 항목 ${summary.length}건: ${head}${tail}`)
      return
    }
    setHeaderErrors({})
    setLineErrors(new Map())
    setSubmitting(true)
    try {
      const headerPayload: Record<string, unknown> = {
        bl_number: blNumber.trim(),
        company_id: selectedCompanyId,
        manufacturer_id: manufacturerId || undefined,
        inbound_type: inboundType,
        currency,
        status,
        etd: etd || undefined,
        eta: eta || undefined,
        actual_arrival: actualArrival || undefined,
        port: port.trim() || undefined,
        forwarder: forwarder.trim() || undefined,
        warehouse_id: warehouseId || undefined,
        invoice_number: invoiceNumber.trim() || undefined,
        exchange_rate: exchangeRate ? Number(exchangeRate) : undefined,
        payment_terms: paymentTerms.trim() || undefined,
        memo: memo.trim() || undefined,
      }
      const created = await fetchWithAuth<BLShipment>("/api/v1/bls", {
        method: "POST",
        body: JSON.stringify(headerPayload),
      })
      // 라인 — 1건씩 POST. 실패해도 BL 본문은 이미 저장됨.
      const lineErrors: string[] = []
      for (const [i, l] of lines.entries()) {
        const product = productById.get(l.product_id)
        const specWp = productSpecWp(product) ?? 0
        const qty = Number(l.quantity)
        const capacityKw = specWp > 0 ? (specWp * qty) / 1000 : 0
        try {
          // bl_id 는 URL path 가 권위 — handler 가 path param 으로 덮어쓴다.
          await fetchWithAuth<BLLineItem>(`/api/v1/bls/${created.bl_id}/lines`, {
            method: "POST",
            body: JSON.stringify({
              product_id: l.product_id,
              quantity: qty,
              capacity_kw: capacityKw,
              item_type: l.item_type,
              payment_type: l.payment_type,
              usage_category: l.usage_category,
              memo: l.memo.trim() || undefined,
            }),
          })
        } catch (err) {
          lineErrors.push(`${i + 1}행: ${err instanceof Error ? err.message : "라인 저장 실패"}`)
        }
      }
      if (lineErrors.length > 0) {
        notify.error(`BL 본문은 등록됐으나 라인 ${lineErrors.length}건 실패: ${lineErrors[0]}`)
      } else {
        notify.success(`BL ${created.bl_number} 등록 완료 (라인 ${lines.length}건)`)
      }
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "BL 등록 실패")
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
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>BL(입고) 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            BL 헤더 + 라인 N개를 한 화면에서 등록합니다. 면장 PDF 가 있으면 OCR 위젯으로 자동
            채울 수 있어요.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* OCR — 면장 자동 매칭 */}
          <BLOcrWidget
            onApply={applyOcr}
            summaryFromApply={ocrSummary}
            manufacturers={manufacturers}
          />

          <section className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="BL 번호" required error={headerErrors.blNumber}>
              <Input
                value={blNumber}
                onChange={(e) => {
                  markDirty()
                  setBlNumber(e.target.value)
                }}
                placeholder="예: HMM12345678"
              />
            </FormField>
            <FormField size="dense" label="입고유형" required>
              <Select
                value={inboundType}
                onValueChange={(v) => {
                  markDirty()
                  setInboundType(v as InboundType)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INBOUND_TYPE_OPTIONS.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              size="dense"
              label="제조사"
              required={inboundType !== "group"}
              error={headerErrors.manufacturer}
            >
              <Select
                value={manufacturerId}
                onValueChange={(v) => {
                  markDirty()
                  setManufacturerId(v ?? "")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="제조사 선택" />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>
                      {m.name_kr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="통화" required>
              <Select
                value={currency}
                onValueChange={(v) => {
                  markDirty()
                  setCurrency(v as "USD" | "KRW")
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="KRW">KRW</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="상태" required>
              <Select
                value={status}
                onValueChange={(v) => {
                  markDirty()
                  setStatus(v as BLStatus)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BL_STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {BL_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="환율" error={headerErrors.exchangeRate}>
              <Input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => {
                  markDirty()
                  setExchangeRate(e.target.value)
                }}
                placeholder={currency === "USD" ? "예: 1380.00" : ""}
                disabled={currency === "KRW"}
              />
            </FormField>
            <FormField size="dense" label="선적일 (ETD)">
              <Input
                type="date"
                value={etd}
                onChange={(e) => {
                  markDirty()
                  setEtd(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="입항일 (ETA)">
              <Input
                type="date"
                value={eta}
                onChange={(e) => {
                  markDirty()
                  setEta(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="실제 입항일">
              <Input
                type="date"
                value={actualArrival}
                onChange={(e) => {
                  markDirty()
                  setActualArrival(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="입항지">
              <Input
                value={port}
                onChange={(e) => {
                  markDirty()
                  setPort(e.target.value)
                }}
                placeholder="예: 부산"
              />
            </FormField>
            <FormField size="dense" label="포워더">
              <Input
                value={forwarder}
                onChange={(e) => {
                  markDirty()
                  setForwarder(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="입고 창고">
              <Select
                value={warehouseId}
                onValueChange={(v) => {
                  markDirty()
                  setWarehouseId(v ?? "")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="창고 선택" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.warehouse_id} value={w.warehouse_id}>
                      {w.warehouse_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="인보이스 번호" className="col-span-2">
              <Input
                value={invoiceNumber}
                onChange={(e) => {
                  markDirty()
                  setInvoiceNumber(e.target.value)
                }}
              />
            </FormField>
          </section>

          {/* 결제조건 — import/domestic 에서만 위젯, 그 외엔 일반 입력 */}
          {inboundType === "import" || inboundType === "domestic" ? (
            <section className="rounded-md border border-[var(--line)] p-3">
              <div className="mb-2 text-[13px] font-semibold">결제조건</div>
              <BLPaymentTermsWidget
                inboundType={inboundType}
                totalAmount={0}
                initialValue={paymentTerms}
                onChange={(v) => {
                  markDirty()
                  setPaymentTerms(v)
                }}
              />
            </section>
          ) : (
            <FormField size="dense" label="결제조건">
              <Input
                value={paymentTerms}
                onChange={(e) => {
                  markDirty()
                  setPaymentTerms(e.target.value)
                }}
                placeholder="예: T/T 30% + 잔금 BL+30일"
              />
            </FormField>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold">
                라인 ({lines.length}건 · 총 {totals.qty.toLocaleString()}매 · {totals.mw.toFixed(3)} MW)
              </div>
              <Button type="button" size="xs" variant="outline" onClick={appendBlankLine}>
                <Plus className="mr-1 h-3 w-3" />
                라인 추가
              </Button>
            </div>
            <div ref={linesParent} className="space-y-2">
              {lines.map((line, idx) => {
                const errs = lineErrors.get(line.key) ?? []
                const product = productById.get(line.product_id)
                const specWp = productSpecWp(product)
                const qty = Number(line.quantity)
                const lineMw = specWp && qty > 0 ? (specWp * qty) / 1_000_000 : 0
                return (
                  <div
                    key={line.key}
                    className={
                      "rounded-md border p-2.5 " +
                      (errs.length > 0
                        ? "border-destructive/60 bg-destructive/5"
                        : "border-[var(--line)]")
                    }
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        라인 {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                        title="라인 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      <div className="col-span-3">
                        <FormField size="compact" label="품번" required>
                          <ProductCombobox
                            products={productListForCombobox}
                            value={line.product_id}
                            onChange={(v) => updateLine(line.key, { product_id: v })}
                            error={errs.some((m) => m.includes("품번"))}
                            placeholder="품번 선택"
                          />
                          {product && (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {specWp ? `${specWp}Wp · ${lineMw.toFixed(3)} MW` : "spec_wp —"}
                            </div>
                          )}
                        </FormField>
                      </div>
                      <FormField size="compact" label="수량" required>
                        <Input
                          type="number"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          placeholder="0"
                          aria-invalid={errs.some((m) => m.includes("수량"))}
                        />
                      </FormField>
                      <FormField size="compact" label="구분">
                        <Select
                          value={line.item_type}
                          onValueChange={(v) =>
                            updateLine(line.key, { item_type: v as "main" | "spare" })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="main">본품</SelectItem>
                            <SelectItem value="spare">스페어</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                      <FormField size="compact" label="유무상">
                        <Select
                          value={line.payment_type}
                          onValueChange={(v) =>
                            updateLine(line.key, { payment_type: v as "paid" | "free" })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paid">유상</SelectItem>
                            <SelectItem value="free">무상</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormField>
                    </div>
                    <div className="mt-2 grid grid-cols-6 gap-2">
                      <div className="col-span-2">
                        <FormField size="compact" label="용도">
                          <Select
                            value={line.usage_category}
                            onValueChange={(v) =>
                              updateLine(line.key, { usage_category: v ?? "sale" })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {USAGE_CATEGORY_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormField>
                      </div>
                      <div className="col-span-4">
                        <FormField size="compact" label="라인 메모">
                          <Input
                            value={line.memo}
                            onChange={(e) => updateLine(line.key, { memo: e.target.value })}
                            placeholder="선택"
                          />
                        </FormField>
                      </div>
                    </div>
                    {errs.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 rounded-sm bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                        {errs.map((msg, i) => (
                          <li key={i}>· {msg}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>

          <FormField size="dense" label="메모">
            <Textarea
              value={memo}
              onChange={(e) => {
                markDirty()
                setMemo(e.target.value)
              }}
              placeholder="BL 메모 (선택)"
              rows={2}
            />
          </FormField>

          {headerErrors.company ? (
            <p className="rounded-sm bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {headerErrors.company}
            </p>
          ) : null}
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
