// 출고 신규 등록 다이얼로그.
// 비유: 창고에서 한 건 빼는 전표 — 날짜/품번/수량/창고/용도 5개만 채우면 끝.
// PR #357 이전 OutboundForm (624줄) 의 슬림 후계자.
// BL FIFO 매칭(bl_items) · 워크플로 체크박스 4종 · 그룹내 거래 target_company 는
// 출고 상세에서 후처리. 다이얼로그는 단건 빠른 등록만 책임.

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
import { ProductCombobox } from "@/components/common/ProductCombobox"
import { fetchWithAuth } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import { useAppStore } from "@/stores/appStore"
import { USAGE_CATEGORY_LABEL, type Outbound, type UsageCategory } from "@/types/outbound"
import type { Product, Warehouse } from "@/types/masters"
import type { Order } from "@/types/orders"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (outbound: Outbound) => void
  /** 수주에서 진입 시 prefill — product/quantity/site 등을 복사. */
  initialOrder?: Order | null
}

const USAGE_CATEGORY_OPTIONS = Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]

function productSpecWp(product?: Product): number | undefined {
  if (!product) return undefined
  if (product.spec_wp && Number.isFinite(product.spec_wp)) return product.spec_wp
  if (product.wattage_kw && Number.isFinite(product.wattage_kw)) return product.wattage_kw * 1000
  return undefined
}

export default function OutboundCreateDialog({
  open,
  onClose,
  onCreated,
  initialOrder,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [outboundDate, setOutboundDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [usageCategory, setUsageCategory] = useState<UsageCategory>("sale")
  const [orderId, setOrderId] = useState("")
  const [siteName, setSiteName] = useState("")
  const [siteAddress, setSiteAddress] = useState("")
  const [spareQty, setSpareQty] = useState("")
  const [erpOutboundNo, setErpOutboundNo] = useState("")
  const [memo, setMemo] = useState("")

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setOutboundDate(new Date().toISOString().slice(0, 10))
    setProductId(initialOrder?.product_id ?? "")
    setQuantity(
      initialOrder
        ? String(Math.max((initialOrder.quantity ?? 0) - (initialOrder.shipped_qty ?? 0), 0))
        : "",
    )
    setWarehouseId("")
    setUsageCategory(
      // 수주의 management_category 가 sale 이면 sale, construction 이면 construction 으로 매핑
      initialOrder?.management_category === "construction"
        ? "construction"
        : initialOrder?.management_category === "spare"
          ? "sale_spare"
          : "sale",
    )
    setOrderId(initialOrder?.order_id ?? "")
    setSiteName(initialOrder?.site_name ?? "")
    setSiteAddress(initialOrder?.site_address ?? "")
    setSpareQty("")
    setErpOutboundNo("")
    setMemo("")
    setErrors({})
    dirtyRef.current = Boolean(initialOrder)
  }, [open, initialOrder])

  useEffect(() => {
    if (!open) return
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
        description: "입력 중인 출고 내용이 있습니다. 저장하지 않고 닫으시겠어요?",
        confirmLabel: "닫기",
        variant: "destructive",
      })
      if (!ok) return
    }
    onClose()
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (!selectedCompanyId || selectedCompanyId === "all") {
      next.company = "좌측 상단에서 법인을 먼저 선택해주세요"
    }
    if (!outboundDate) next.outboundDate = "출고일을 입력해주세요"
    if (!productId) next.product = "품번을 선택해주세요"
    const q = Number(quantity)
    if (!Number.isFinite(q) || q <= 0) next.quantity = "수량은 0보다 커야 합니다"
    if (!warehouseId) next.warehouse = "창고를 선택해주세요"
    if (!usageCategory) next.usageCategory = "용도를 선택해주세요"
    if (spareQty) {
      const s = Number(spareQty)
      if (!Number.isFinite(s) || s <= 0) next.spareQty = "스페어 수량은 양수여야 합니다"
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
    const specWp = productSpecWp(product) ?? 0
    const qty = Number(quantity)
    const capacityKw = specWp > 0 ? (specWp * qty) / 1000 : undefined

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        outbound_date: outboundDate,
        company_id: selectedCompanyId,
        product_id: productId,
        quantity: qty,
        capacity_kw: capacityKw,
        warehouse_id: warehouseId,
        usage_category: usageCategory,
        order_id: orderId || undefined,
        site_name: siteName.trim() || undefined,
        site_address: siteAddress.trim() || undefined,
        spare_qty: spareQty ? Number(spareQty) : undefined,
        erp_outbound_no: erpOutboundNo.trim() || undefined,
        status: "active",
        memo: memo.trim() || undefined,
      }
      const created = await fetchWithAuth<Outbound>("/api/v1/outbounds", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      notify.success(
        `출고 ${qty.toLocaleString()}매 등록 완료${capacityKw ? ` (${capacityKw.toFixed(1)} kW)` : ""}`,
      )
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "출고 등록 실패")
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
          <DialogTitle>출고 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            창고 한 번에 출고 한 건. BL FIFO 매칭 · 그룹내 거래 상대 · 워크플로 체크박스는 출고
            상세에서 후처리합니다.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="출고일" required error={errors.outboundDate}>
              <Input
                type="date"
                value={outboundDate}
                onChange={(e) => {
                  markDirty()
                  setOutboundDate(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="용도" required error={errors.usageCategory}>
              <Select
                value={usageCategory}
                onValueChange={(v) => {
                  markDirty()
                  setUsageCategory((v ?? "sale") as UsageCategory)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_CATEGORY_OPTIONS.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

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
            <FormField size="dense" label="창고" required error={errors.warehouse}>
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

          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="현장명">
              <Input
                value={siteName}
                onChange={(e) => {
                  markDirty()
                  setSiteName(e.target.value)
                }}
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
          </div>

          <FormField size="dense" label="ERP 출고번호">
            <Input
              value={erpOutboundNo}
              onChange={(e) => {
                markDirty()
                setErpOutboundNo(e.target.value)
              }}
              placeholder="ERP 자동 채번이면 비워둠"
            />
          </FormField>

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

          {initialOrder ? (
            <p className="rounded-sm bg-blue-500/10 px-2 py-1 text-[11px] text-blue-700 dark:text-blue-300">
              수주 {initialOrder.order_number ?? initialOrder.order_id.slice(0, 8)} 에서 진입 —
              품번/수량/현장 prefill. 출고 후 수주의 잔여수량이 자동 업데이트됩니다.
            </p>
          ) : null}
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
