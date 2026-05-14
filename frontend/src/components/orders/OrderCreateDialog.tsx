// 수주(Order) 신규 등록 다이얼로그.
// 비유: 수주 한 건 — 누가/언제/뭘/얼마에/어느 현장 5가지를 채운다.
// PR #357 이전 OrderForm (1,485줄) 의 슬림 후계자. POCreateDialog 패턴.
// BL 원가추적 / 재고 가용성 뱃지 / payment_terms 빌더 UI 는 별도 PR(보조기능)에서 부활.

import { useEffect, useRef, useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import FormField from "@/components/common/FormField"
import { PartnerCombobox } from "@/components/common/PartnerCombobox"
import { ProductCombobox } from "@/components/common/ProductCombobox"
import { ConstructionSiteCombobox } from "@/components/common/ConstructionSiteCombobox"
import { fetchWithAuth } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import { useAppStore } from "@/stores/appStore"
import {
  FULFILLMENT_SOURCE_LABEL,
  MANAGEMENT_CATEGORY_LABEL,
  RECEIPT_METHOD_LABEL,
  type FulfillmentSource,
  type ManagementCategory,
  type Order,
  type ReceiptMethod,
} from "@/types/orders"
import type { ConstructionSite, Partner, Product } from "@/types/masters"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (order: Order) => void
  /** 거래처 기본값 — 특정 customer 컨텍스트에서 호출 시 prefill. */
  initialCustomerId?: string
}

const RECEIPT_METHOD_OPTIONS = Object.entries(RECEIPT_METHOD_LABEL) as [ReceiptMethod, string][]
const MANAGEMENT_CATEGORY_OPTIONS = Object.entries(MANAGEMENT_CATEGORY_LABEL) as [
  ManagementCategory,
  string,
][]
const FULFILLMENT_SOURCE_OPTIONS = Object.entries(FULFILLMENT_SOURCE_LABEL) as [
  FulfillmentSource,
  string,
][]

export default function OrderCreateDialog({
  open,
  onClose,
  onCreated,
  initialCustomerId,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [partners, setPartners] = useState<Partner[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [sites, setSites] = useState<ConstructionSite[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 헤더
  const [orderNumber, setOrderNumber] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [receiptMethod, setReceiptMethod] = useState<ReceiptMethod>("purchase_order")
  const [managementCategory, setManagementCategory] = useState<ManagementCategory>("sale")
  const [fulfillmentSource, setFulfillmentSource] = useState<FulfillmentSource>("stock")

  // 품목
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unitPriceWp, setUnitPriceWp] = useState("")
  const [spareQty, setSpareQty] = useState("")

  // 납기/현장
  const [deliveryDue, setDeliveryDue] = useState("")
  const [siteId, setSiteId] = useState("")
  const [siteName, setSiteName] = useState("")
  const [siteAddress, setSiteAddress] = useState("")
  const [siteContact, setSiteContact] = useState("")
  const [sitePhone, setSitePhone] = useState("")

  // 결제
  const [paymentTerms, setPaymentTerms] = useState("")
  const [depositRate, setDepositRate] = useState("")

  // 메모
  const [memo, setMemo] = useState("")

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setOrderNumber("")
    setCustomerId(initialCustomerId ?? "")
    setOrderDate(new Date().toISOString().slice(0, 10))
    setReceiptMethod("purchase_order")
    setManagementCategory("sale")
    setFulfillmentSource("stock")
    setProductId("")
    setQuantity("")
    setUnitPriceWp("")
    setSpareQty("")
    setDeliveryDue("")
    setSiteId("")
    setSiteName("")
    setSiteAddress("")
    setSiteContact("")
    setSitePhone("")
    setPaymentTerms("")
    setDepositRate("")
    setMemo("")
    setErrors({})
    dirtyRef.current = false
  }, [open, initialCustomerId])

  useEffect(() => {
    if (!open) return
    fetchWithAuth<Partner[]>("/api/v1/partners")
      .then((list) =>
        setPartners(
          list.filter(
            (p) =>
              p.is_active && (p.partner_type === "customer" || p.partner_type === "both"),
          ),
        ),
      )
      .catch(() => setPartners([]))
    fetchWithAuth<Product[]>("/api/v1/products")
      .then((list) => setProducts(list.filter((p) => p.is_active !== false)))
      .catch(() => setProducts([]))
    if (selectedCompanyId && selectedCompanyId !== "all") {
      fetchWithAuth<ConstructionSite[]>(
        `/api/v1/construction-sites?company_id=${selectedCompanyId}`,
      )
        .then((list) => setSites(list))
        .catch(() => setSites([]))
    } else {
      setSites([])
    }
  }, [open, selectedCompanyId])

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
        description: "입력 중인 수주 내용이 있습니다. 저장하지 않고 닫으시겠어요?",
        confirmLabel: "닫기",
        variant: "destructive",
      })
      if (!ok) return
    }
    onClose()
  }

  // 공사사용건(construction)은 외부 거래처/판매가 아니라 거래처·단가 선택.
  const isConstruction = managementCategory === "construction"

  // validate 는 errors 객체를 그대로 반환 — setErrors 가 batch 되어
  // handleSubmit 에서 state 를 곧장 읽으면 stale 값이 잡힌다. 직접 반환받아 사용.
  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (!selectedCompanyId || selectedCompanyId === "all") {
      next.company = "좌측 상단에서 법인을 먼저 선택해주세요"
    }
    if (!isConstruction && !customerId) next.customer = "거래처를 선택해주세요"
    if (!orderDate) next.orderDate = "수주일을 입력해주세요"
    if (!productId) next.product = "품번을 선택해주세요"
    const q = Number(quantity)
    if (!Number.isFinite(q) || q <= 0) next.quantity = "수량은 0보다 커야 합니다"
    if (isConstruction) {
      if (unitPriceWp) {
        const u = Number(unitPriceWp)
        if (!Number.isFinite(u) || u < 0) next.unitPrice = "원/Wp 단가는 0 이상이어야 합니다"
      }
    } else {
      const u = Number(unitPriceWp)
      if (!Number.isFinite(u) || u <= 0) next.unitPrice = "원/Wp 단가는 0보다 커야 합니다"
    }
    if (spareQty) {
      const s = Number(spareQty)
      if (!Number.isFinite(s) || s <= 0) next.spareQty = "스페어 수량은 양수여야 합니다"
    }
    if (depositRate) {
      const r = Number(depositRate)
      if (!Number.isFinite(r) || r < 0 || r > 100) {
        next.depositRate = "선금 비율은 0~100 사이여야 합니다"
      }
    }
    setErrors(next)
    return next
  }

  async function handleSubmit() {
    const result = validate()
    if (Object.keys(result).length > 0) {
      const first = Object.values(result)[0]
      if (first) notify.error(first)
      return
    }
    const product = products.find((p) => p.product_id === productId)
    const specWp = product?.spec_wp ?? 0
    const qty = Number(quantity)
    const wp = isConstruction && !unitPriceWp ? 0 : Number(unitPriceWp)
    const capacityKw = specWp > 0 ? (specWp * qty) / 1000 : undefined
    // 공사사용건이고 단가가 0 이면 장당단가도 의미 없으므로 omit.
    const unitPriceEa = specWp > 0 && wp > 0 ? wp * specWp : undefined

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        order_number: orderNumber.trim() || undefined,
        company_id: selectedCompanyId,
        // 공사사용건은 외부 거래처 없음 → omit 으로 PostgREST NULL.
        customer_id: customerId || undefined,
        order_date: orderDate,
        receipt_method: receiptMethod,
        product_id: productId,
        quantity: qty,
        capacity_kw: capacityKw,
        unit_price_wp: wp,
        unit_price_ea: unitPriceEa,
        site_id: siteId || undefined,
        site_name: siteName.trim() || undefined,
        site_address: siteAddress.trim() || undefined,
        site_contact: siteContact.trim() || undefined,
        site_phone: sitePhone.trim() || undefined,
        payment_terms: paymentTerms.trim() || undefined,
        deposit_rate: depositRate ? Number(depositRate) : undefined,
        delivery_due: deliveryDue || undefined,
        status: "received",
        management_category: managementCategory,
        fulfillment_source: fulfillmentSource,
        spare_qty: spareQty ? Number(spareQty) : undefined,
        memo: memo.trim() || undefined,
      }
      const created = await fetchWithAuth<Order>("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      notify.success(`수주 ${created.order_number ?? created.order_id.slice(0, 8)} 등록 완료`)
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "수주 등록 실패")
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
          <DialogTitle>수주 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            한 건의 수주를 등록합니다. 충당소스가 실재고/미착품이라도 BL 핀(원가추적)은 등록 후
            수주 상세에서 따로 지정합니다.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* 헤더 */}
          <section className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="수주번호">
              <Input
                value={orderNumber}
                onChange={(e) => {
                  markDirty()
                  setOrderNumber(e.target.value)
                }}
                placeholder="고객 발주번호 (선택)"
              />
            </FormField>
            <FormField size="dense" label="수주일" required error={errors.orderDate}>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => {
                  markDirty()
                  setOrderDate(e.target.value)
                }}
              />
            </FormField>
            <FormField
              size="dense"
              label={isConstruction ? "거래처 (선택)" : "거래처"}
              required={!isConstruction}
              error={errors.customer}
              className="col-span-2"
            >
              <PartnerCombobox
                partners={partners}
                value={customerId}
                onChange={(v) => {
                  markDirty()
                  setCustomerId(v)
                }}
                error={!!errors.customer}
                placeholder={isConstruction ? "공사사용건 — 비워두어도 됨" : "거래처 선택"}
              />
            </FormField>
            <FormField size="dense" label="접수방법" required>
              <Select
                value={receiptMethod}
                onValueChange={(v) => {
                  markDirty()
                  setReceiptMethod(v as ReceiptMethod)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECEIPT_METHOD_OPTIONS.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="관리구분" required>
              <Select
                value={managementCategory}
                onValueChange={(v) => {
                  markDirty()
                  setManagementCategory(v as ManagementCategory)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANAGEMENT_CATEGORY_OPTIONS.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="충당소스" required>
              <Select
                value={fulfillmentSource}
                onValueChange={(v) => {
                  markDirty()
                  setFulfillmentSource(v as FulfillmentSource)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FULFILLMENT_SOURCE_OPTIONS.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField size="dense" label="납기일">
              <Input
                type="date"
                value={deliveryDue}
                onChange={(e) => {
                  markDirty()
                  setDeliveryDue(e.target.value)
                }}
              />
            </FormField>
          </section>

          {/* 품목 */}
          <section className="space-y-3 rounded-md border border-[var(--line)] p-3">
            <div className="text-[13px] font-semibold">품목</div>
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
                  placeholder="0"
                  aria-invalid={!!errors.quantity}
                />
              </FormField>
              <FormField
                size="dense"
                label={isConstruction ? "원/Wp 단가 (선택)" : "원/Wp 단가"}
                required={!isConstruction}
                error={errors.unitPrice}
              >
                <Input
                  type="number"
                  step="0.01"
                  value={unitPriceWp}
                  onChange={(e) => {
                    markDirty()
                    setUnitPriceWp(e.target.value)
                  }}
                  placeholder="0"
                  aria-invalid={!!errors.unitPrice}
                />
              </FormField>
              <FormField size="dense" label="스페어 수량" error={errors.spareQty}>
                <Input
                  type="number"
                  value={spareQty}
                  onChange={(e) => {
                    markDirty()
                    setSpareQty(e.target.value)
                  }}
                  placeholder="0"
                />
              </FormField>
            </div>
          </section>

          {/* 현장 */}
          <section className="space-y-3 rounded-md border border-[var(--line)] p-3">
            <div className="text-[13px] font-semibold">현장 (선택)</div>
            <FormField size="dense" label="공사현장">
              <ConstructionSiteCombobox
                sites={sites}
                value={siteId}
                onChange={(id, name) => {
                  markDirty()
                  setSiteId(id)
                  setSiteName(name)
                }}
                companyId={selectedCompanyId === "all" ? null : selectedCompanyId}
                displayName={siteName}
                onCreated={(s) => {
                  setSites((prev) => [...prev, s])
                  setSiteId(s.site_id)
                  setSiteName(s.name)
                }}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField size="dense" label="현장명 (직접입력)">
                <Input
                  value={siteName}
                  onChange={(e) => {
                    markDirty()
                    setSiteName(e.target.value)
                  }}
                  placeholder="레거시 직접입력용"
                  disabled={!!siteId}
                />
              </FormField>
              <FormField size="dense" label="현장 주소">
                <Input
                  value={siteAddress}
                  onChange={(e) => {
                    markDirty()
                    setSiteAddress(e.target.value)
                  }}
                />
              </FormField>
              <FormField size="dense" label="현장 담당자">
                <Input
                  value={siteContact}
                  onChange={(e) => {
                    markDirty()
                    setSiteContact(e.target.value)
                  }}
                />
              </FormField>
              <FormField size="dense" label="현장 전화">
                <Input
                  value={sitePhone}
                  onChange={(e) => {
                    markDirty()
                    setSitePhone(e.target.value)
                  }}
                />
              </FormField>
            </div>
          </section>

          {/* 결제 + 메모 */}
          <section className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="결제조건">
              <Input
                value={paymentTerms}
                onChange={(e) => {
                  markDirty()
                  setPaymentTerms(e.target.value)
                }}
                placeholder="예: 현금 30% + 잔금 익월말"
              />
            </FormField>
            <FormField size="dense" label="선금 비율 (%)" error={errors.depositRate}>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={depositRate}
                onChange={(e) => {
                  markDirty()
                  setDepositRate(e.target.value)
                }}
                placeholder="0"
              />
            </FormField>
          </section>

          <FormField size="dense" label="메모">
            <Textarea
              value={memo}
              onChange={(e) => {
                markDirty()
                setMemo(e.target.value)
              }}
              placeholder="수주 메모 (선택)"
              rows={2}
            />
          </FormField>

          {errors.company ? (
            <p className="rounded-sm bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              {errors.company}
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
