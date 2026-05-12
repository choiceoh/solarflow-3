// 면장(Customs Declaration) 신규 등록 다이얼로그.
// 비유: 통관 한 건 — 면장 번호 + 해당 BL + 면장일자.
// PR #357 이전 DeclarationForm (167줄) 의 슬림 후계자.

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
import { fetchWithAuth } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { notify } from "@/lib/notify"
import { useAppStore } from "@/stores/appStore"
import type { Declaration } from "@/types/customs"
import type { BLShipment } from "@/types/inbound"

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (declaration: Declaration) => void
  /** BL 상세에서 진입 시 prefill (D-085). */
  presetBLId?: string
}

export default function DeclarationCreateDialog({
  open,
  onClose,
  onCreated,
  presetBLId,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [bls, setBls] = useState<BLShipment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [declarationNumber, setDeclarationNumber] = useState("")
  const [blId, setBlId] = useState("")
  const [declarationDate, setDeclarationDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [arrivalDate, setArrivalDate] = useState("")
  const [releaseDate, setReleaseDate] = useState("")
  const [hsCode, setHsCode] = useState("")
  const [customsOffice, setCustomsOffice] = useState("")
  const [port, setPort] = useState("")
  const [memo, setMemo] = useState("")

  const dirtyRef = useRef(false)
  function markDirty() {
    dirtyRef.current = true
  }

  useEffect(() => {
    if (!open) return
    setDeclarationNumber("")
    setBlId(presetBLId ?? "")
    setDeclarationDate(new Date().toISOString().slice(0, 10))
    setArrivalDate("")
    setReleaseDate("")
    setHsCode("")
    setCustomsOffice("")
    setPort("")
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
        description: "입력 중인 면장 정보가 있습니다. 저장하지 않고 닫으시겠어요?",
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
    if (!declarationNumber.trim()) next.declarationNumber = "면장 번호는 필수"
    if (!blId) next.bl = "BL 을 선택해주세요"
    if (!declarationDate) next.declarationDate = "면장일자를 입력해주세요"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      const created = await fetchWithAuth<Declaration>("/api/v1/declarations", {
        method: "POST",
        body: JSON.stringify({
          declaration_number: declarationNumber.trim(),
          bl_id: blId,
          company_id: selectedCompanyId,
          declaration_date: declarationDate,
          arrival_date: arrivalDate || undefined,
          release_date: releaseDate || undefined,
          hs_code: hsCode.trim() || undefined,
          customs_office: customsOffice.trim() || undefined,
          port: port.trim() || undefined,
          memo: memo.trim() || undefined,
        }),
      })
      notify.success(`면장 ${created.declaration_number} 등록 완료`)
      onCreated(created)
      onClose()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "면장 등록 실패")
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
          <DialogTitle>면장 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            BL 한 건에 대한 통관 면장을 등록합니다. 원가 라인은 등록 후 면장 상세에서.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="면장 번호" required error={errors.declarationNumber}>
              <Input
                value={declarationNumber}
                onChange={(e) => {
                  markDirty()
                  setDeclarationNumber(e.target.value)
                }}
                placeholder="예: 12345-67-890123"
              />
            </FormField>
            <FormField size="dense" label="면장일자" required error={errors.declarationDate}>
              <Input
                type="date"
                value={declarationDate}
                onChange={(e) => {
                  markDirty()
                  setDeclarationDate(e.target.value)
                }}
              />
            </FormField>
          </div>

          <FormField size="dense" label="BL" required error={errors.bl}>
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

          <div className="grid grid-cols-2 gap-3">
            <FormField size="dense" label="입항일">
              <Input
                type="date"
                value={arrivalDate}
                onChange={(e) => {
                  markDirty()
                  setArrivalDate(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="반출일">
              <Input
                type="date"
                value={releaseDate}
                onChange={(e) => {
                  markDirty()
                  setReleaseDate(e.target.value)
                }}
              />
            </FormField>
            <FormField size="dense" label="HS 코드">
              <Input
                value={hsCode}
                onChange={(e) => {
                  markDirty()
                  setHsCode(e.target.value)
                }}
                placeholder="예: 8541.40-9090"
              />
            </FormField>
            <FormField size="dense" label="통관 세관">
              <Input
                value={customsOffice}
                onChange={(e) => {
                  markDirty()
                  setCustomsOffice(e.target.value)
                }}
                placeholder="예: 부산세관"
              />
            </FormField>
            <FormField size="dense" label="입항지" className="col-span-2">
              <Input
                value={port}
                onChange={(e) => {
                  markDirty()
                  setPort(e.target.value)
                }}
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
