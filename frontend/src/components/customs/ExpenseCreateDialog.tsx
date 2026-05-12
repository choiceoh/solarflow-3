// 부대비용(Customs Expense) 신규 등록 다이얼로그.
// 비유: 통관/물류 청구서 한 장 — 항목/금액/부가세 + 어느 BL/월/출고에 귀속.
// PR #357 이전 ExpenseForm (189줄) 의 슬림 후계자.

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import FormField from "@/components/common/FormField"
import { fetchWithAuth } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import { useAppStore } from "@/stores/appStore"
import { EXPENSE_TYPES_ACTIVE, type Expense, type ExpenseType } from "@/types/customs"
import type { BLShipment } from "@/types/inbound"

type AttachMode = "bl" | "month" | "outbound"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (expense: Expense) => void
  /** BL 컨텍스트에서 진입 시 prefill. */
  presetBLId?: string
}

function fmtIntKR(v: string): string {
  const raw = v.replace(/[^0-9]/g, "")
  if (!raw) return ""
  return Number(raw).toLocaleString("ko-KR")
}

function parseIntKR(v: string): number | null {
  const raw = v.replace(/[^0-9]/g, "")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function ExpenseCreateDialog({
  open,
  onClose,
  onCreated,
  presetBLId,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [bls, setBls] = useState<BLShipment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [attachMode, setAttachMode] = useState<AttachMode>("bl")
  const [blId, setBlId] = useState("")
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [outboundId, setOutboundId] = useState("")
  const [expenseType, setExpenseType] = useState<ExpenseType>("dock_charge")
  const [amountDisplay, setAmountDisplay] = useState("")
  const [vatDisplay, setVatDisplay] = useState("")
  const [vendor, setVendor] = useState("")
  const [vehicleType, setVehicleType] = useState("")
  const [destination, setDestination] = useState("")
  const [memo, setMemo] = useState("")

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setAttachMode(presetBLId ? "bl" : "bl")
    setBlId(presetBLId ?? "")
    setMonth(new Date().toISOString().slice(0, 7))
    setOutboundId("")
    setExpenseType("dock_charge")
    setAmountDisplay("")
    setVatDisplay("")
    setVendor("")
    setVehicleType("")
    setDestination("")
    setMemo("")
    setErrors({})
    dirtyRef.current = false
  }, [open, presetBLId])

  useEffect(() => {
    if (!open) return
    if (!selectedCompanyId || selectedCompanyId === "all") {
      setBls([])
      return
    }
    fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selectedCompanyId}`)
      .then((list) => setBls(list))
      .catch(() => setBls([]))
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
        description: "입력 중인 부대비용 정보가 있습니다. 저장하지 않고 닫으시겠어요?",
        confirmLabel: "닫기",
        variant: "destructive",
      })
      if (!ok) return
    }
    onClose()
  }

  const total = useMemo(() => {
    const amount = parseIntKR(amountDisplay) ?? 0
    const vat = parseIntKR(vatDisplay) ?? 0
    return amount + vat
  }, [amountDisplay, vatDisplay])

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}
    if (!selectedCompanyId || selectedCompanyId === "all") {
      next.company = "좌측 상단에서 법인을 먼저 선택해주세요"
    }
    if (attachMode === "bl" && !blId) next.attach = "BL 을 선택해주세요"
    if (attachMode === "month" && !month) next.attach = "월(YYYY-MM)을 입력해주세요"
    if (attachMode === "outbound" && !outboundId.trim()) next.attach = "출고 ID 를 입력해주세요"
    const amount = parseIntKR(amountDisplay)
    if (amount == null) next.amount = "금액은 0보다 커야 합니다"
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
    const amount = parseIntKR(amountDisplay)
    if (amount == null) return
    const vat = parseIntKR(vatDisplay) ?? 0
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        company_id: selectedCompanyId,
        expense_type: expenseType,
        amount,
        vat: vat || undefined,
        total: amount + vat,
        vendor: vendor.trim() || undefined,
        vehicle_type: vehicleType.trim() || undefined,
        destination: destination.trim() || undefined,
        memo: memo.trim() || undefined,
      }
      if (attachMode === "bl") payload.bl_id = blId
      if (attachMode === "month") payload.month = month
      if (attachMode === "outbound") payload.outbound_id = outboundId.trim()

      const created = await fetchWithAuth<Expense>("/api/v1/expenses", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      notify.success(`부대비용 ${(amount + vat).toLocaleString("ko-KR")}원 등록 완료`)
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "부대비용 등록 실패")
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
      <DialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>부대비용 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            BL · 월(연결처 없는 일반비용) · 출고 중 하나에 귀속됩니다.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <FormField size="dense" label="귀속" required error={errors.attach}>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] px-2 py-1.5 text-xs">
                <input
                  type="radio"
                  checked={attachMode === "bl"}
                  onChange={() => {
                    markDirty()
                    setAttachMode("bl")
                  }}
                />
                BL
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] px-2 py-1.5 text-xs">
                <input
                  type="radio"
                  checked={attachMode === "month"}
                  onChange={() => {
                    markDirty()
                    setAttachMode("month")
                  }}
                />
                월(BL 무관)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] px-2 py-1.5 text-xs">
                <input
                  type="radio"
                  checked={attachMode === "outbound"}
                  onChange={() => {
                    markDirty()
                    setAttachMode("outbound")
                  }}
                />
                출고
              </label>
            </div>
          </FormField>

          {attachMode === "bl" && (
            <FormField size="dense" label="BL" required>
              <Select
                value={blId}
                onValueChange={(v) => {
                  markDirty()
                  setBlId(v ?? "")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="BL 선택" />
                </SelectTrigger>
                <SelectContent>
                  {bls.map((b) => (
                    <SelectItem key={b.bl_id} value={b.bl_id}>
                      {b.bl_number}
                      {b.manufacturer_name ? ` · ${b.manufacturer_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {attachMode === "month" && (
            <FormField size="dense" label="월" required>
              <Input
                type="month"
                value={month}
                onChange={(e) => {
                  markDirty()
                  setMonth(e.target.value)
                }}
              />
            </FormField>
          )}
          {attachMode === "outbound" && (
            <FormField size="dense" label="출고 ID" required>
              <Input
                value={outboundId}
                onChange={(e) => {
                  markDirty()
                  setOutboundId(e.target.value)
                }}
                placeholder="UUID"
              />
            </FormField>
          )}

          <FormField size="dense" label="비용 유형" required>
            <Select
              value={expenseType}
              onValueChange={(v) => {
                markDirty()
                setExpenseType((v ?? "dock_charge") as ExpenseType)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPES_ACTIVE.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField size="dense" label="금액" required error={errors.amount}>
              <Input
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={(e) => {
                  markDirty()
                  setAmountDisplay(fmtIntKR(e.target.value))
                }}
                placeholder="0"
              />
            </FormField>
            <FormField size="dense" label="부가세">
              <Input
                type="text"
                inputMode="numeric"
                value={vatDisplay}
                onChange={(e) => {
                  markDirty()
                  setVatDisplay(fmtIntKR(e.target.value))
                }}
                placeholder="0"
              />
            </FormField>
            <FormField size="dense" label="합계">
              <Input
                type="text"
                value={total ? total.toLocaleString("ko-KR") : ""}
                disabled
                className="bg-muted/30"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="공급처">
              <Input
                value={vendor}
                onChange={(e) => {
                  markDirty()
                  setVendor(e.target.value)
                }}
                placeholder="예: 한진해운"
              />
            </FormField>
            <FormField size="dense" label="차종/유형">
              <Input
                value={vehicleType}
                onChange={(e) => {
                  markDirty()
                  setVehicleType(e.target.value)
                }}
                placeholder="예: 11톤 윙바디"
              />
            </FormField>
            <FormField size="dense" label="목적지" className="col-span-2">
              <Input
                value={destination}
                onChange={(e) => {
                  markDirty()
                  setDestination(e.target.value)
                }}
                placeholder="예: 부산항 → 광주창고"
              />
            </FormField>
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
