// T/T 송금(계약금/잔금) 신규 등록 다이얼로그.
// 비유: 외화 송금 한 건 — PO + 금액 USD + 환율 → 원화 자동.
// PR #357 이전 TTForm (270줄) + DepositPaymentForm (268줄) 둘을 합친 슬림 후계자.
// DepositStatusPanel 의 "계약금 N차 등록" 도 같은 다이얼로그 — initialValues 로 prefill 분기.

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
import {
  TT_STATUS_LABEL,
  type PurchaseOrder,
  type TTRemittance,
  type TTStatus,
} from "@/types/procurement"

export interface TTCreateInitialValues {
  po_id?: string
  amount_usd?: number
  amount_krw?: number
  exchange_rate?: number
  remit_date?: string
  purpose?: string
  bank_name?: string
  status?: TTStatus
  memo?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (tt: TTRemittance) => void
  initialValues?: TTCreateInitialValues | null
  /** 다이얼로그 제목 — 계약금 N차 모드는 외부에서 "계약금 1차 송금" 등으로. */
  title?: string
}

const TT_STATUS_OPTIONS = Object.entries(TT_STATUS_LABEL) as [TTStatus, string][]

function fmtIntKR(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return ""
  return Math.round(v).toLocaleString("ko-KR")
}

function parseIntKR(v: string): number | null {
  const raw = v.replace(/[^0-9]/g, "")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function TTCreateDialog({
  open,
  onClose,
  onCreated,
  initialValues,
  title = "T/T 송금 신규 등록",
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [poId, setPoId] = useState("")
  const [status, setStatus] = useState<TTStatus>("completed")
  const [remitDate, setRemitDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amountUsd, setAmountUsd] = useState("")
  const [exchangeRate, setExchangeRate] = useState("")
  const [amountKrwDisplay, setAmountKrwDisplay] = useState("")
  const [amountKrwTouched, setAmountKrwTouched] = useState(false)
  const [purpose, setPurpose] = useState("")
  const [bankName, setBankName] = useState("")
  const [memo, setMemo] = useState("")

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setPoId(initialValues?.po_id ?? "")
    setStatus(initialValues?.status ?? "completed")
    setRemitDate(initialValues?.remit_date ?? new Date().toISOString().slice(0, 10))
    setAmountUsd(initialValues?.amount_usd ? String(initialValues.amount_usd) : "")
    setExchangeRate(initialValues?.exchange_rate ? String(initialValues.exchange_rate) : "")
    setAmountKrwDisplay(fmtIntKR(initialValues?.amount_krw))
    setAmountKrwTouched(false)
    setPurpose(initialValues?.purpose ?? "")
    setBankName(initialValues?.bank_name ?? "")
    setMemo(initialValues?.memo ?? "")
    setErrors({})
    // initialValues 로 prefill 됐다면 dirty 로 시작 (수정 의도)
    dirtyRef.current = Boolean(initialValues && (initialValues.amount_usd || initialValues.purpose))
  }, [open, initialValues])

  useEffect(() => {
    if (!open) return
    if (!selectedCompanyId || selectedCompanyId === "all") {
      setPos([])
      return
    }
    fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?company_id=${selectedCompanyId}`)
      .then((list) => setPos(list.filter((p) => p.status !== "completed" && p.status !== "cancelled")))
      .catch(() => setPos([]))
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

  // amount_usd + exchange_rate 가 있고 사용자가 KRW 를 직접 안 만졌으면 자동 계산.
  const computedKrw = useMemo(() => {
    const u = Number(amountUsd)
    const r = Number(exchangeRate)
    if (!Number.isFinite(u) || u <= 0) return null
    if (!Number.isFinite(r) || r <= 0) return null
    return Math.round(u * r)
  }, [amountUsd, exchangeRate])

  useEffect(() => {
    if (amountKrwTouched) return
    if (computedKrw == null) return
    setAmountKrwDisplay(computedKrw.toLocaleString("ko-KR"))
  }, [computedKrw, amountKrwTouched])

  async function attemptClose() {
    if (dirtyRef.current) {
      const ok = await confirmDialog({
        title: "저장하지 않은 변경 내용",
        description: "입력 중인 송금 정보가 있습니다. 저장하지 않고 닫으시겠어요?",
        confirmLabel: "닫기",
        variant: "destructive",
      })
      if (!ok) return
    }
    onClose()
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!selectedCompanyId || selectedCompanyId === "all") {
      next.company = "좌측 상단에서 법인을 먼저 선택해주세요"
    }
    if (!poId) next.po = "PO 를 선택해주세요"
    const u = Number(amountUsd)
    if (!Number.isFinite(u) || u <= 0) next.amountUsd = "USD 금액은 0보다 커야 합니다"
    if (exchangeRate) {
      const r = Number(exchangeRate)
      if (!Number.isFinite(r) || r <= 0) next.exchangeRate = "환율은 0보다 커야 합니다"
    }
    if (amountKrwDisplay) {
      const k = parseIntKR(amountKrwDisplay)
      if (k == null) next.amountKrw = "KRW 금액은 0보다 커야 합니다"
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    const usd = Number(amountUsd)
    const rate = exchangeRate ? Number(exchangeRate) : undefined
    const krw = parseIntKR(amountKrwDisplay) ?? undefined
    setSubmitting(true)
    try {
      const created = await fetchWithAuth<TTRemittance>("/api/v1/tts", {
        method: "POST",
        body: JSON.stringify({
          po_id: poId,
          status,
          remit_date: remitDate || undefined,
          amount_usd: usd,
          exchange_rate: rate,
          amount_krw: krw,
          purpose: purpose.trim() || undefined,
          bank_name: bankName.trim() || undefined,
          memo: memo.trim() || undefined,
        }),
      })
      notify.success(`T/T USD ${usd.toLocaleString()} 등록 완료`)
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "T/T 등록 실패")
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
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            PO 한 건에 대한 외화 송금(계약금/잔금/기타). 환율 입력 시 원화 자동.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <FormField size="dense" label="PO" required error={errors.po}>
            <Select
              value={poId}
              onValueChange={(v) => {
                markDirty()
                setPoId(v ?? "")
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="PO 선택" />
              </SelectTrigger>
              <SelectContent>
                {pos.map((p) => (
                  <SelectItem key={p.po_id} value={p.po_id}>
                    {p.po_number || p.po_id.slice(0, 8)}
                    {p.manufacturer_name ? ` · ${p.manufacturer_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="송금일">
              <Input
                type="date"
                value={remitDate}
                onChange={(e) => {
                  markDirty()
                  setRemitDate(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="상태" required>
              <Select
                value={status}
                onValueChange={(v) => {
                  markDirty()
                  setStatus((v ?? "completed") as TTStatus)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TT_STATUS_OPTIONS.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField size="dense" label="송금액 USD" required error={errors.amountUsd}>
              <Input
                type="number"
                step="0.01"
                value={amountUsd}
                onChange={(e) => {
                  markDirty()
                  setAmountUsd(e.target.value)
                }}
                placeholder="0"
                aria-invalid={!!errors.amountUsd}
              />
            </FormField>
            <FormField size="dense" label="환율" error={errors.exchangeRate}>
              <Input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => {
                  markDirty()
                  setExchangeRate(e.target.value)
                }}
                placeholder="예: 1380"
              />
            </FormField>
            <FormField size="dense" label="송금액 KRW" error={errors.amountKrw}>
              <Input
                type="text"
                inputMode="numeric"
                value={amountKrwDisplay}
                onChange={(e) => {
                  markDirty()
                  setAmountKrwTouched(true)
                  const raw = e.target.value.replace(/[^0-9]/g, "")
                  setAmountKrwDisplay(raw ? Number(raw).toLocaleString("ko-KR") : "")
                }}
                placeholder="0"
              />
            </FormField>
          </div>

          <FormField size="dense" label="용도">
            <Input
              value={purpose}
              onChange={(e) => {
                markDirty()
                setPurpose(e.target.value)
              }}
              placeholder="예: 계약금 1차 30%"
            />
          </FormField>

          <FormField size="dense" label="송금 은행">
            <Input
              value={bankName}
              onChange={(e) => {
                markDirty()
                setBankName(e.target.value)
              }}
              placeholder="예: KEB하나"
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
