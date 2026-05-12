// 수금 신규 등록 다이얼로그.
// 비유: 통장에 찍힌 입금 한 줄 — 누가/언제/얼마/어느 계좌 4가지를 받는다.
// PR #357 이전 ReceiptForm 의 슬림 후계자. POCreateDialog 패턴(useState + dirty 가드).

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
import FormField from "@/components/common/FormField"
import { PartnerCombobox } from "@/components/common/PartnerCombobox"
import { fetchWithAuth } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import { useAppStore } from "@/stores/appStore"
import type { Receipt } from "@/types/orders"
import type { Partner } from "@/types/masters"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (receipt: Receipt) => void
  /** 거래처 기본값 — 수금 매칭 흐름에서 customer 를 미리 채울 때. */
  initialCustomerId?: string
}

export default function ReceiptCreateDialog({
  open,
  onClose,
  onCreated,
  initialCustomerId,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [partners, setPartners] = useState<Partner[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [customerId, setCustomerId] = useState("")
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10))
  // 금액은 한글 천단위 표기 (5,000,000) — 사용자가 0 자리수 확인하기 쉽다.
  const [amountDisplay, setAmountDisplay] = useState("")
  const [bankAccount, setBankAccount] = useState("")
  const [memo, setMemo] = useState("")

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setCustomerId(initialCustomerId ?? "")
    setReceiptDate(new Date().toISOString().slice(0, 10))
    setAmountDisplay("")
    setBankAccount("")
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
        description: "입력 중인 수금 정보가 있습니다. 저장하지 않고 닫으시겠어요?",
        confirmLabel: "닫기",
        variant: "destructive",
      })
      if (!ok) return
    }
    onClose()
  }

  function parseAmount(): number | null {
    const raw = amountDisplay.replace(/[^0-9]/g, "")
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!selectedCompanyId || selectedCompanyId === "all") {
      next.company = "좌측 상단에서 법인을 먼저 선택해주세요"
    }
    if (!customerId) next.customer = "거래처를 선택해주세요"
    if (!receiptDate) next.receiptDate = "입금일을 입력해주세요"
    const amount = parseAmount()
    if (amount == null) next.amount = "입금액은 0보다 커야 합니다"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    if (!validate()) {
      const first = Object.values(errors)[0]
      if (first) notify.error(first)
      return
    }
    const amount = parseAmount()
    if (amount == null) return
    setSubmitting(true)
    try {
      const created = await fetchWithAuth<Receipt>("/api/v1/receipts", {
        method: "POST",
        body: JSON.stringify({
          company_id: selectedCompanyId,
          customer_id: customerId,
          receipt_date: receiptDate,
          amount,
          bank_account: bankAccount.trim() || undefined,
          memo: memo.trim() || undefined,
        }),
      })
      notify.success(`수금 ${amount.toLocaleString("ko-KR")}원 등록 완료`)
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "수금 등록 실패")
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
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>수금 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            통장에 찍힌 입금 한 건을 등록합니다. 매출과의 매칭은 등록 후 수금매칭 탭에서.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <FormField size="dense" label="거래처" required error={errors.customer}>
            <PartnerCombobox
              partners={partners}
              value={customerId}
              onChange={(v) => {
                markDirty()
                setCustomerId(v)
              }}
              error={!!errors.customer}
              placeholder="거래처 선택"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="입금일" required error={errors.receiptDate}>
              <Input
                type="date"
                value={receiptDate}
                onChange={(e) => {
                  markDirty()
                  setReceiptDate(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="입금액" required error={errors.amount}>
              <Input
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={(e) => {
                  markDirty()
                  const raw = e.target.value.replace(/[^0-9]/g, "")
                  const num = raw ? Number(raw) : null
                  setAmountDisplay(num != null ? num.toLocaleString("ko-KR") : "")
                }}
                placeholder="0"
                aria-invalid={!!errors.amount}
              />
            </FormField>
          </div>

          <FormField size="dense" label="입금계좌">
            <Input
              value={bankAccount}
              onChange={(e) => {
                markDirty()
                setBankAccount(e.target.value)
              }}
              placeholder="예: 신한 110-xxx-xxxxxx"
            />
          </FormField>

          <FormField size="dense" label="메모">
            <Textarea
              value={memo}
              onChange={(e) => {
                markDirty()
                setMemo(e.target.value)
              }}
              placeholder="수금 메모 (선택)"
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
