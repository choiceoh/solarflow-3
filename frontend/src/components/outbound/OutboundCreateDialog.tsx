// 출고 신규 등록 다이얼로그.
// 비유: 창고에서 한 건 빼는 전표.
// 기본: 날짜/품번/수량/창고/용도만 채우면 즉시 출고 INSERT — 빠른 등록 흐름.
// 확장 (탑솔라 그룹 양식 단건 입력, D-055 매핑):
//   거래처 · 단가(1장 KRW) · 공급가/부가세/합계 자동 · 워크플로우 4 체크박스 · 매출 동시 등록 토글.
//   엑셀 일괄 업로드(ExternalFormatCard) 와 같은 컬럼/계산식을 사용해 site 입력자가 한 건씩
//   직접 등록하더라도 동일한 결과(출고+매출+체크박스)를 얻을 수 있다.

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
import { Checkbox } from "@/components/ui/checkbox"
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
import { fetchWithAuth } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import { useAppStore } from "@/stores/appStore"
import { USAGE_CATEGORY_LABEL, type Outbound, type Sale, type UsageCategory } from "@/types/outbound"
import type { Partner, Product, Warehouse } from "@/types/masters"
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

// 부가세율 — 한국 표준 10%. 변경되면 매출 계산도 일치해야 하므로 단일 상수.
const VAT_RATE = 0.1

export default function OutboundCreateDialog({
  open,
  onClose,
  onCreated,
  initialOrder,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
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

  // 탑솔라 그룹 양식 매핑 필드 (D-055).
  // 단가는 1장 KRW (엑셀 col 10). 내부 매출 등록 시 unit_price_wp = unit_price_ea / spec_wp.
  const [customerId, setCustomerId] = useState("")
  const [unitPriceEa, setUnitPriceEa] = useState("")
  const [txStatementReady, setTxStatementReady] = useState(false)
  const [inspectionRequestSent, setInspectionRequestSent] = useState(false)
  const [approvalRequested, setApprovalRequested] = useState(false)
  const [taxInvoiceIssued, setTaxInvoiceIssued] = useState(false)
  // 매출 동시 등록 — 단가 입력 시 기본 on. 사용자가 끄면 출고만 INSERT.
  const [registerSale, setRegisterSale] = useState(true)

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
    // 탑솔라 그룹 양식 필드 reset.
    setCustomerId(initialOrder?.customer_id ?? "")
    setUnitPriceEa("")
    setTxStatementReady(false)
    setInspectionRequestSent(false)
    setApprovalRequested(false)
    setTaxInvoiceIssued(false)
    setRegisterSale(true)
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
    // 고객 거래처 (sale 용도일 때만 의미가 있으나 항상 fetch — 사용자가 용도를 바꿔도 즉시 사용 가능).
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
  }, [open])

  // 단가(1장 KRW) × 수량 = 공급가액, 부가세 = 공급가 × 10%, 합계 = 공급가 + 부가세.
  // 엑셀 양식의 col 11/12/13/14 자동 계산. 사용자는 단가/수량만 입력하면 됨.
  const amounts = useMemo(() => {
    const price = Number(unitPriceEa)
    const qty = Number(quantity)
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) {
      return { supply: 0, vat: 0, total: 0 }
    }
    const supply = Math.round(price * qty)
    const vat = Math.round(supply * VAT_RATE)
    return { supply, vat, total: supply + vat }
  }, [unitPriceEa, quantity])

  // 매출 등록 가능 조건 — 단가 + 거래처 + 매출 가능 용도(sale/sale_spare).
  const saleEligible = usageCategory === "sale" || usageCategory === "sale_spare"
  const willRegisterSale = registerSale && saleEligible && amounts.supply > 0 && !!customerId

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
    // 단가 입력값 자체는 양수만 허용 (빈 칸 허용 — 매출 미등록 출고).
    if (unitPriceEa) {
      const p = Number(unitPriceEa)
      if (!Number.isFinite(p) || p <= 0) next.unitPriceEa = "단가는 0보다 커야 합니다"
    }
    // 매출 동시 등록 조건이 켜진 상태에서 거래처가 비어 있으면 차단 — 사용자가
    // 단가를 입력하고도 거래처를 선택하지 않은 채 제출하는 실수를 방지.
    if (registerSale && saleEligible && unitPriceEa && !customerId) {
      next.customer = "매출 동시 등록을 위해 거래처를 선택해주세요 (또는 매출 동시 등록을 끄세요)"
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
    const priceEa = unitPriceEa ? Number(unitPriceEa) : null

    setSubmitting(true)
    try {
      // 워크플로우 체크박스 4종 + 단건 폼 출처 보존. 외부 양식 일괄 import 와 동일하게
      // source_payload 로 입력자 모드를 표시 — 추후 운영에서 입력 경로 추적 가능.
      const sourcePayload: Record<string, unknown> | undefined =
        priceEa !== null || txStatementReady || inspectionRequestSent ||
        approvalRequested || taxInvoiceIssued
          ? {
              entry_mode: "single_form",
              ...(priceEa !== null
                ? {
                    unit_price_ea: priceEa,
                    supply_amount: amounts.supply,
                    vat_amount: amounts.vat,
                    total_amount: amounts.total,
                  }
                : {}),
            }
          : undefined

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
        tx_statement_ready: txStatementReady,
        inspection_request_sent: inspectionRequestSent,
        approval_requested: approvalRequested,
        tax_invoice_issued: taxInvoiceIssued,
        ...(sourcePayload ? { source_payload: sourcePayload } : {}),
      }
      const created = await fetchWithAuth<Outbound>("/api/v1/outbounds", {
        method: "POST",
        body: JSON.stringify(payload),
      })

      // 매출 동시 등록 — 단가/거래처/sale 용도가 모두 충족된 경우만.
      // 실패해도 출고는 이미 INSERT 된 상태이므로 onCreated 호출 후 별도 경고.
      let saleCreated: Sale | null = null
      if (willRegisterSale && priceEa !== null) {
        try {
          // unit_price_wp = unit_price_ea / spec_wp. spec_wp(=W) 가 없으면 임시로 0 — 백엔드는
          // wp>0 만 요구하므로 wp 환산 불가 시 매출 등록은 건너뜀.
          if (specWp <= 0) {
            notify.warning("품번에 spec_wp 가 없어 매출 자동 등록을 건너뜁니다 — 출고만 등록됨")
          } else {
            const unitPriceWp = priceEa / specWp
            saleCreated = await fetchWithAuth<Sale>("/api/v1/sales", {
              method: "POST",
              body: JSON.stringify({
                outbound_id: created.outbound_id,
                customer_id: customerId,
                quantity: qty,
                capacity_kw: capacityKw,
                unit_price_wp: unitPriceWp,
                unit_price_ea: priceEa,
                supply_amount: amounts.supply,
                vat_amount: amounts.vat,
                total_amount: amounts.total,
              }),
            })
          }
        } catch (e) {
          notify.error(
            `출고는 등록되었으나 매출 등록 실패: ${e instanceof Error ? e.message : ""} — 출고 상세에서 매출을 수동으로 등록하세요`,
          )
        }
      }

      const saleMsg = saleCreated
        ? ` + 매출 ${amounts.total.toLocaleString()}원`
        : ""
      notify.success(
        `출고 ${qty.toLocaleString()}매 등록 완료${capacityKw ? ` (${capacityKw.toFixed(1)} kW)` : ""}${saleMsg}`,
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
            창고 한 번에 출고 한 건. 거래처·단가를 같이 채우면 매출까지 한 transaction으로 등록되어
            도메인 화면에 즉시 노출됩니다. BL FIFO 매칭 / 그룹내 거래 상대는 출고 상세에서 후처리합니다.
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

          {/* 탑솔라 그룹 양식 매핑 (D-055): 거래처 + 단가 + 계산 + 워크플로우 체크박스 4종.
              모든 필드는 선택 — 빠른 출고만 필요하면 비워두고 등록. */}
          <div className="space-y-3 rounded-md border border-[var(--line)] bg-[var(--bg-2)] p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[var(--ink)]">
                  매출 정보 · 워크플로우
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                  거래처 · 단가를 채우면 매출까지 함께 등록 (탑솔라 그룹 양식 매핑)
                </div>
              </div>
              {saleEligible ? (
                <label className="flex items-center gap-2 text-[11px] text-[var(--ink-3)]">
                  <Checkbox
                    checked={registerSale}
                    onCheckedChange={(v) => {
                      markDirty()
                      setRegisterSale(v === true)
                    }}
                  />
                  매출 동시 등록
                </label>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField size="dense" label="거래처 (매출처)" error={errors.customer}>
                <PartnerCombobox
                  partners={partners}
                  value={customerId}
                  onChange={(v) => {
                    markDirty()
                    setCustomerId(v)
                  }}
                  error={!!errors.customer}
                  placeholder={saleEligible ? "거래처 선택" : "용도가 sale일 때 활성"}
                  creatable
                  createType="customer"
                  onCreated={(p) => {
                    setPartners((prev) =>
                      prev.find((x) => x.partner_id === p.partner_id) ? prev : [...prev, p],
                    )
                    setCustomerId(p.partner_id)
                  }}
                />
              </FormField>
              <FormField size="dense" label="단가 (1장 KRW)" error={errors.unitPriceEa}>
                <Input
                  type="number"
                  value={unitPriceEa}
                  onChange={(e) => {
                    markDirty()
                    setUnitPriceEa(e.target.value)
                  }}
                  placeholder="예: 92300"
                  aria-invalid={!!errors.unitPriceEa}
                />
              </FormField>
            </div>

            {amounts.supply > 0 ? (
              <div className="grid grid-cols-3 gap-3 rounded-sm bg-[var(--surface)] px-3 py-2 text-[12px]">
                <div>
                  <div className="text-[10px] text-[var(--ink-3)]">공급가액</div>
                  <div className="font-semibold text-[var(--ink)]">
                    {amounts.supply.toLocaleString()} 원
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--ink-3)]">부가세 (10%)</div>
                  <div className="font-semibold text-[var(--ink)]">
                    {amounts.vat.toLocaleString()} 원
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--ink-3)]">합계</div>
                  <div className="font-semibold text-[var(--sf-pos)]">
                    {amounts.total.toLocaleString()} 원
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <WorkflowCheckbox
                label="거래명세서"
                checked={txStatementReady}
                onChange={(v) => {
                  markDirty()
                  setTxStatementReady(v)
                }}
              />
              <WorkflowCheckbox
                label="인수검수요청서"
                checked={inspectionRequestSent}
                onChange={(v) => {
                  markDirty()
                  setInspectionRequestSent(v)
                }}
              />
              <WorkflowCheckbox
                label="결재요청"
                checked={approvalRequested}
                onChange={(v) => {
                  markDirty()
                  setApprovalRequested(v)
                }}
              />
              <WorkflowCheckbox
                label="계산서발행"
                checked={taxInvoiceIssued}
                onChange={(v) => {
                  markDirty()
                  setTaxInvoiceIssued(v)
                }}
              />
            </div>
          </div>

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
            {submitting
              ? "등록 중..."
              : willRegisterSale
                ? "출고 + 매출 등록"
                : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 워크플로우 체크박스 — 라벨 + Checkbox 묶음을 button 처럼 클릭 가능한 영역으로 만든다.
// OutboundWorkflowPanel 의 카드 디자인을 단순화한 버전.
function WorkflowCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 hover:border-[var(--ink-3)]">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className="text-[12px] text-[var(--ink)]">{label}</span>
    </label>
  )
}
