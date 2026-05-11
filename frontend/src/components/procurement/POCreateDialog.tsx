// 발주(PO) 신규 등록 다이얼로그.
// 비유: 발주서 한 장 — 헤더(법인·제조사·계약) + 라인(품번·수량·단가)을 한 화면에서 받는다.
// 라인 추가/삭제로 N건을 한 PO에 묶는다. 등록 시 헤더+라인을 한 번에 POST하여 부분 저장을 막는다.

import { useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import { Copy, Loader2, Plus, Trash2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchWithAuth } from "@/lib/api"
import { notify } from "@/lib/notify"
import {
  parsePOQuickInput,
  type POQuickInputLine,
  type POQuickInputResult,
} from "@/lib/poQuickInput"
import { useAppStore } from "@/stores/appStore"
import { CONTRACT_TYPES_ACTIVE } from "@/types/procurement"
import type { ContractType, PurchaseOrder } from "@/types/procurement"
import type { Manufacturer } from "@/types/masters"

interface ProductLite {
  product_id: string
  product_code: string
  product_name: string
  manufacturer_id?: string
  manufacturer_name?: string
  manufacturers?: { name_kr?: string; short_name?: string; name_en?: string }
  spec_wp?: number
  wattage_kw?: number
  is_active?: boolean
}

interface DraftLine {
  key: string
  product_id: string
  quantity: string
  unit_price_usd_wp: string
  item_type: "main" | "spare"
  payment_type: "paid" | "free"
  memo: string
}

export interface POCreateInitialLine {
  product_id: string
  quantity?: number
  unit_price_usd?: number
  unit_price_usd_wp?: number
  spec_wp?: number
  item_type?: "main" | "spare"
  payment_type?: "paid" | "free"
  memo?: string
}

export interface POCreateInitialValues {
  po_number?: string
  company_id?: string
  manufacturer_id?: string
  contract_type?: ContractType
  contract_date?: string
  incoterms?: string
  payment_terms?: string
  contract_period_start?: string
  contract_period_end?: string
  memo?: string
  parent_po_id?: string
  lines?: POCreateInitialLine[]
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (po: PurchaseOrder) => void
  initialValues?: POCreateInitialValues | null
  title?: string
}

function newLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    product_id: "",
    quantity: "",
    unit_price_usd_wp: "",
    item_type: "main",
    payment_type: "paid",
    memo: "",
  }
}

function numberInputValue(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  return String(value)
}

function lineUnitPriceWp(line: POCreateInitialLine): string {
  if (line.unit_price_usd_wp != null && Number.isFinite(line.unit_price_usd_wp)) {
    return String(line.unit_price_usd_wp)
  }
  if (line.unit_price_usd != null && line.spec_wp && line.spec_wp > 0) {
    return String(line.unit_price_usd / line.spec_wp)
  }
  return ""
}

function fromInitialLine(line: POCreateInitialLine): DraftLine {
  return {
    key: crypto.randomUUID(),
    product_id: line.product_id,
    quantity: numberInputValue(line.quantity),
    unit_price_usd_wp: lineUnitPriceWp(line),
    item_type: line.item_type ?? "main",
    payment_type: line.payment_type ?? "paid",
    memo: line.memo ?? "",
  }
}

function isBlankLine(line: DraftLine): boolean {
  return !line.product_id && !line.quantity && !line.unit_price_usd_wp && !line.memo
}

function productSpecWp(product?: ProductLite): number | undefined {
  if (!product) return undefined
  if (product.spec_wp && Number.isFinite(product.spec_wp)) return product.spec_wp
  if (product.wattage_kw && Number.isFinite(product.wattage_kw)) return product.wattage_kw * 1000
  return undefined
}

function defaultItemTypeForProduct(product?: ProductLite): DraftLine["item_type"] {
  const text = `${product?.product_code ?? ""} ${product?.product_name ?? ""}`.toLowerCase()
  if (/(spare|service|svc|스페어|예비|보수)/.test(text)) return "spare"
  return "main"
}

export default function POCreateDialog({
  open,
  onClose,
  onCreated,
  initialValues,
  title = "발주(PO) 신규 등록",
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [products, setProducts] = useState<ProductLite[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [quickInput, setQuickInput] = useState("")
  // 라인 추가/삭제 시 자식 mount/unmount 자동 애니메이션 (smooth list reorder).
  const [linesParent] = useAutoAnimate<HTMLDivElement>()

  // 헤더
  const [poNumber, setPoNumber] = useState("")
  const [manufacturerId, setManufacturerId] = useState("")
  const [contractType, setContractType] = useState<ContractType>("spot")
  const [contractDate, setContractDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [incoterms, setIncoterms] = useState("")
  const [paymentTerms, setPaymentTerms] = useState("")
  const [periodStart, setPeriodStart] = useState("")
  const [periodEnd, setPeriodEnd] = useState("")
  const [memo, setMemo] = useState("")

  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()])

  // 다이얼로그를 새로 열 때마다 초기 상태로.
  useEffect(() => {
    if (!open) return
    setPoNumber(initialValues?.po_number ?? "")
    setManufacturerId(initialValues?.manufacturer_id ?? "")
    setContractType(initialValues?.contract_type ?? "spot")
    setContractDate(initialValues?.contract_date ?? new Date().toISOString().slice(0, 10))
    setIncoterms(initialValues?.incoterms ?? "")
    setPaymentTerms(initialValues?.payment_terms ?? "")
    setPeriodStart(initialValues?.contract_period_start ?? "")
    setPeriodEnd(initialValues?.contract_period_end ?? "")
    setMemo(initialValues?.memo ?? "")
    setQuickInput("")
    const initialLines = initialValues?.lines?.length
      ? initialValues.lines.map(fromInitialLine)
      : [newLine()]
    setLines(initialLines)
  }, [open, initialValues])

  useEffect(() => {
    if (!open) return
    fetchWithAuth<Manufacturer[]>("/api/v1/manufacturers")
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => setManufacturers([]))
    fetchWithAuth<ProductLite[]>("/api/v1/products")
      .then((list) => setProducts(list.filter((p) => p.is_active !== false)))
      .catch(() => setProducts([]))
  }, [open])

  const productById = useMemo(() => {
    const map = new Map<string, ProductLite>()
    for (const p of products) map.set(p.product_id, p)
    return map
  }, [products])

  const quickInputProducts = useMemo(
    () => products.map((p) => ({ ...p, spec_wp: productSpecWp(p) })),
    [products],
  )

  const totals = useMemo(() => {
    let qty = 0
    let mw = 0
    for (const l of lines) {
      const q = Number(l.quantity)
      if (!Number.isFinite(q) || q <= 0) continue
      qty += q
      const product = productById.get(l.product_id)
      const specWp = productSpecWp(product)
      if (specWp) mw += (specWp * q) / 1_000_000
    }
    return { qty, mw }
  }, [lines, productById])

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function applyProductSelection(key: string, productId: string) {
    const product = productById.get(productId)
    const patch: Partial<DraftLine> = {
      product_id: productId,
      item_type: defaultItemTypeForProduct(product),
    }
    updateLine(key, patch)

    const productManufacturerId = product?.manufacturer_id
    if (!productManufacturerId) return
    const otherManufacturerIds = new Set(
      lines
        .filter((l) => l.key !== key && l.product_id)
        .map((l) => productById.get(l.product_id)?.manufacturer_id)
        .filter((id): id is string => Boolean(id)),
    )
    if (
      !manufacturerId ||
      (manufacturerId !== productManufacturerId && otherManufacturerIds.size === 0)
    ) {
      setManufacturerId(productManufacturerId)
      return
    }
    if (manufacturerId !== productManufacturerId) {
      notify.error("선택한 품번의 제조사가 PO 제조사와 다릅니다. 제조사별로 PO를 나눠주세요.")
    }
  }

  function duplicateLine(key: string) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === key)
      if (idx < 0) return prev
      const copy = { ...prev[idx], key: crypto.randomUUID() }
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]
    })
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  function draftLineFromQuick(line: POQuickInputLine): DraftLine {
    const product = productById.get(line.product_id)
    return {
      ...newLine(),
      product_id: line.product_id,
      quantity: String(line.quantity),
      unit_price_usd_wp: String(line.unit_price_usd_wp),
      item_type: line.item_type === "spare" ? "spare" : defaultItemTypeForProduct(product),
      payment_type: line.payment_type,
      memo: line.memo,
    }
  }

  function quickInputErrorMessage(result: POQuickInputResult): string {
    return result.errors
      .slice(0, 5)
      .map((err) => `${err.row}행 ${err.message}`)
      .join(", ")
  }

  function appendQuickLines(result: POQuickInputResult, source: "paste" | "button") {
    const parsed = result.lines.map(draftLineFromQuick)
    if (result.errors.length > 0) {
      notify.error(`빠른 입력 확인 필요: ${quickInputErrorMessage(result)}`)
      return false
    }
    if (parsed.length === 0) {
      if (source === "button") notify.error("반영할 라인이 없습니다")
      return false
    }
    setLines((prev) => (prev.length === 1 && isBlankLine(prev[0]) ? parsed : [...prev, ...parsed]))
    const manufacturerIds = new Set(
      parsed
        .map((line) => productById.get(line.product_id)?.manufacturer_id)
        .filter((id): id is string => Boolean(id)),
    )
    if (!manufacturerId && manufacturerIds.size === 1) {
      setManufacturerId([...manufacturerIds][0])
    } else if (
      manufacturerId &&
      manufacturerIds.size === 1 &&
      !manufacturerIds.has(manufacturerId)
    ) {
      notify.error("빠른 입력 품번의 제조사가 선택된 PO 제조사와 다릅니다.")
    }
    setQuickInput("")
    notify.success(`${parsed.length}개 라인을 반영했습니다`)
    return true
  }

  function applyQuickInput() {
    if (!quickInput.trim()) return
    appendQuickLines(parsePOQuickInput(quickInput, quickInputProducts), "button")
  }

  function handleQuickPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const text = event.clipboardData.getData("text")
    if (!text.trim()) return
    const result = parsePOQuickInput(text, quickInputProducts)
    if (result.lines.length > 0 && result.errors.length === 0) {
      event.preventDefault()
      appendQuickLines(result, "paste")
      return
    }
    const looksLikeQuickInput =
      text.includes("\t") || text.split(/\r?\n/).filter((r) => r.trim()).length > 1
    if (looksLikeQuickInput && result.errors.length > 0) {
      notify.error(`자동 반영 보류: ${quickInputErrorMessage(result)}`)
    }
  }

  function handleQuickKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      applyQuickInput()
    }
  }

  // 등록 전 검증 — 메시지로만 막고, 인라인 표시는 1차 범위 외.
  function validate(): string | null {
    const companyId = initialValues?.company_id || selectedCompanyId
    if (!companyId || companyId === "all") return "좌측 상단에서 법인을 먼저 선택해주세요"
    if (!manufacturerId) return "제조사를 선택해주세요"
    if (!contractDate) return "계약일을 입력해주세요"
    if (contractType === "frame" && (!periodStart || !periodEnd)) {
      return "프레임 계약은 계약 시작/종료일이 필요합니다"
    }
    if (lines.length === 0) return "라인을 1개 이상 추가해주세요"
    for (const [i, l] of lines.entries()) {
      const n = i + 1
      if (!l.product_id) return `${n}번 라인의 품번을 선택해주세요`
      const q = Number(l.quantity)
      if (!Number.isFinite(q) || q <= 0) return `${n}번 라인의 수량은 0보다 커야 합니다`
      const u = Number(l.unit_price_usd_wp)
      if (!Number.isFinite(u) || u <= 0) return `${n}번 라인의 USD/Wp 단가는 0보다 커야 합니다`
      const product = productById.get(l.product_id)
      if (product?.manufacturer_id && product.manufacturer_id !== manufacturerId) {
        return `${n}번 라인의 품번 제조사가 선택된 제조사와 다릅니다`
      }
    }
    return null
  }

  async function handleSubmit() {
    const err = validate()
    if (err) {
      notify.error(err)
      return
    }
    setSubmitting(true)
    try {
      const companyId = initialValues?.company_id || selectedCompanyId
      const headerPayload = {
        po_number: poNumber.trim() || undefined,
        company_id: companyId,
        manufacturer_id: manufacturerId,
        contract_type: contractType,
        contract_date: contractDate,
        incoterms: incoterms.trim() || undefined,
        payment_terms: paymentTerms.trim() || undefined,
        contract_period_start: contractType === "frame" ? periodStart : undefined,
        contract_period_end: contractType === "frame" ? periodEnd : undefined,
        memo: memo.trim() || undefined,
        parent_po_id: initialValues?.parent_po_id || undefined,
        status: "draft" as const,
        line_items: lines.map((l) => {
          const product = productById.get(l.product_id)
          const specWp = productSpecWp(product) ?? 0
          const wp = Number(l.unit_price_usd_wp)
          const qty = Number(l.quantity)
          const unitPriceUsd = specWp > 0 ? wp * specWp : 0
          const totalAmountUsd = unitPriceUsd * qty
          return {
            product_id: l.product_id,
            quantity: qty,
            unit_price_usd: specWp > 0 ? unitPriceUsd : undefined,
            unit_price_usd_wp: wp,
            total_amount_usd: specWp > 0 ? totalAmountUsd : undefined,
            item_type: l.item_type,
            payment_type: l.payment_type,
            memo: l.memo.trim() || undefined,
          }
        }),
      }
      const created = await fetchWithAuth<PurchaseOrder>("/api/v1/pos", {
        method: "POST",
        body: JSON.stringify(headerPayload),
      })

      notify.success(`PO ${created.po_number ?? created.po_id.slice(0, 8)} 등록 완료`)
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "PO 등록 실패")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            헤더 정보를 한 번 입력하고 라인을 N개 추가하세요. 같은 PO 안에서 본품/스페어,
            유상/무상을 라인별로 구분합니다.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="발주번호">
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="확인 전이면 비워둠"
              />
            </FormField>
            <FormField size="dense" label="제조사" required>
              <Select value={manufacturerId} onValueChange={(v) => setManufacturerId(v ?? "")}>
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
            <FormField size="dense" label="계약유형" required>
              <Select
                value={contractType}
                onValueChange={(v) => setContractType(v as ContractType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES_ACTIVE.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="계약일" required>
              <Input
                type="date"
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
              />
            </FormField>
            <FormField size="dense" label="인코텀즈">
              <Input
                value={incoterms}
                onChange={(e) => setIncoterms(e.target.value)}
                placeholder="FOB / CIF"
              />
            </FormField>
            <FormField size="dense" label="결제조건">
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="L/C at sight 등"
              />
            </FormField>
            {contractType === "frame" && (
              <>
                <FormField size="dense" label="계약 시작일" required>
                  <Input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </FormField>
                <FormField size="dense" label="계약 종료일" required>
                  <Input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </FormField>
              </>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold">
                라인 ({lines.length}건 · 총 {totals.qty.toLocaleString()}매 · {totals.mw.toFixed(3)}{" "}
                MW)
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={applyQuickInput}
                  disabled={!quickInput.trim()}
                >
                  빠른 입력 반영
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  라인 추가
                </Button>
              </div>
            </div>
            <Textarea
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onPaste={handleQuickPaste}
              onKeyDown={handleQuickKeyDown}
              placeholder="품번	수량	USD/Wp"
              rows={2}
              className="min-h-[56px] text-[12px]"
            />
            <div ref={linesParent} className="space-y-2">
              {lines.map((line, idx) => {
                const selectedProduct = productById.get(line.product_id)
                const selectedSpecWp = productSpecWp(selectedProduct)
                const selectedMfg =
                  selectedProduct?.manufacturer_name ??
                  selectedProduct?.manufacturers?.short_name ??
                  selectedProduct?.manufacturers?.name_kr ??
                  manufacturers.find((m) => m.manufacturer_id === selectedProduct?.manufacturer_id)
                    ?.short_name ??
                  manufacturers.find((m) => m.manufacturer_id === selectedProduct?.manufacturer_id)
                    ?.name_kr
                const quantity = Number(line.quantity)
                const lineMw =
                  selectedSpecWp && Number.isFinite(quantity) && quantity > 0
                    ? (selectedSpecWp * quantity) / 1_000_000
                    : 0
                return (
                  <div key={line.key} className="rounded-md border border-[var(--line)] p-2.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        라인 {idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => duplicateLine(line.key)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="라인 복사"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
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
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      <div className="col-span-2">
                        <FormField size="compact" label="품번" required>
                          <Select
                            value={line.product_id}
                            onValueChange={(v) => applyProductSelection(line.key, v ?? "")}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="품번 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.product_id} value={p.product_id}>
                                  {p.product_code} ·{" "}
                                  {productSpecWp(p) ? `${productSpecWp(p)}Wp` : "—"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedProduct && (
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                              <span>{selectedMfg ?? "제조사 —"}</span>
                              <span>{selectedSpecWp ? `${selectedSpecWp}Wp` : "Wp —"}</span>
                              <span>{line.item_type === "spare" ? "스페어" : "본품"}</span>
                              {lineMw > 0 && <span>{lineMw.toFixed(3)} MW</span>}
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
                        />
                      </FormField>
                      <FormField size="compact" label="USD/Wp" required>
                        <Input
                          type="number"
                          step="0.001"
                          value={line.unit_price_usd_wp}
                          onChange={(e) =>
                            updateLine(line.key, { unit_price_usd_wp: e.target.value })
                          }
                          placeholder="0.090"
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
                    <div className="mt-2">
                      <Input
                        value={line.memo}
                        onChange={(e) => updateLine(line.key, { memo: e.target.value })}
                        placeholder="라인 메모 (선택)"
                        className="h-8 text-[12px]"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <FormField size="dense" label="메모">
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="발주 메모"
              rows={2}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
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
