// 면장 원가 관리 다이얼로그.
// 비유: 면장 한 건의 원가 라인 목록 + Landed 미리보기/저장 한 화면.
// PR #357 이 DeclarationDetailView 를 같이 지운 자리를 매우는 미니 뷰 — declaration
// detail 전체를 부활시키지 않고 "원가" 부분만 별도 다이얼로그로 처리한다.

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import FormField from "@/components/common/FormField"
import { fetchWithAuth } from "@/lib/api"
import { notify } from "@/lib/notify"
import CostCreateDialog from "@/components/customs/CostCreateDialog"
import LandedCostPanel from "@/components/customs/LandedCostPanel"
import type { Declaration, DeclarationCost } from "@/types/customs"

interface Props {
  open: boolean
  onClose: () => void
  /** 진입 시 선택된 면장 — 없으면 다이얼로그 안에서 드롭다운으로 선택. */
  initialDeclaration?: Declaration | null
  /** 전체 면장 목록 — 드롭다운 옵션. */
  declarations: Declaration[]
}

export default function DeclarationCostManager({
  open,
  onClose,
  initialDeclaration,
  declarations,
}: Props) {
  const [declarationId, setDeclarationId] = useState<string>(
    initialDeclaration?.declaration_id ?? "",
  )
  const [costs, setCosts] = useState<DeclarationCost[]>([])
  const [loading, setLoading] = useState(false)
  const [costCreateOpen, setCostCreateOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const declaration = useMemo(
    () => declarations.find((d) => d.declaration_id === declarationId) ?? null,
    [declarations, declarationId],
  )

  useEffect(() => {
    if (!open) return
    setDeclarationId(initialDeclaration?.declaration_id ?? "")
    setReloadKey(0)
  }, [open, initialDeclaration])

  useEffect(() => {
    if (!open || !declarationId) {
      setCosts([])
      return
    }
    setLoading(true)
    fetchWithAuth<DeclarationCost[]>(`/api/v1/cost-details?declaration_id=${declarationId}`)
      .then((list) => setCosts(list))
      .catch((e) => {
        notify.error(e instanceof Error ? e.message : "원가 라인 로드 실패")
        setCosts([])
      })
      .finally(() => setLoading(false))
  }, [open, declarationId, reloadKey])

  function refreshCosts() {
    setReloadKey((v) => v + 1)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>면장 원가 관리</DialogTitle>
            <p className="text-xs text-muted-foreground">
              면장 한 건의 품목별 원가 라인 + Landed Cost 미리보기/저장.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <FormField size="dense" label="면장" required>
              <Select value={declarationId} onValueChange={(v) => setDeclarationId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="면장 선택" />
                </SelectTrigger>
                <SelectContent>
                  {declarations.map((d) => (
                    <SelectItem key={d.declaration_id} value={d.declaration_id}>
                      {d.declaration_number}
                      {d.bl_number ? ` · BL ${d.bl_number}` : ""}
                      {d.declaration_date ? ` · ${d.declaration_date.slice(0, 10)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {declaration ? (
              <>
                <section className="rounded-md border border-[var(--line)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[13px] font-semibold">
                      원가 라인 ({costs.length}건)
                    </div>
                    <Button size="xs" onClick={() => setCostCreateOpen(true)}>
                      원가 라인 등록
                    </Button>
                  </div>
                  {loading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> 로드 중...
                    </div>
                  ) : costs.length === 0 ? (
                    <div className="rounded border border-dashed border-[var(--line)] p-4 text-center text-xs text-muted-foreground">
                      등록된 원가 라인이 없습니다. "원가 라인 등록" 으로 추가하세요.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="border-b">
                          <tr className="text-muted-foreground">
                            <th className="py-1.5 text-left">품번</th>
                            <th className="py-1.5 text-right">수량</th>
                            <th className="py-1.5 text-right">CIF 원화</th>
                            <th className="py-1.5 text-right">CIF Wp</th>
                            <th className="py-1.5 text-right">Landed Wp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {costs.map((c) => (
                            <tr key={c.cost_id} className="border-b last:border-0">
                              <td className="py-1.5">
                                {c.product_code ?? c.product_id.slice(0, 8)}
                                {c.product_name ? (
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    {c.product_name}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-1.5 text-right mono">
                                {c.quantity.toLocaleString()}
                              </td>
                              <td className="py-1.5 text-right mono">
                                {Math.round(c.cif_total_krw).toLocaleString("ko-KR")}
                              </td>
                              <td className="py-1.5 text-right mono">
                                {c.cif_wp_krw.toFixed(2)}
                              </td>
                              <td className="py-1.5 text-right mono">
                                {c.landed_wp_krw ? c.landed_wp_krw.toFixed(2) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="rounded-md border border-[var(--line)] p-3">
                  <div className="mb-2 text-[13px] font-semibold">Landed Cost 미리보기 / 저장</div>
                  <LandedCostPanel declarationId={declarationId} onRefresh={refreshCosts} />
                </section>
              </>
            ) : (
              <div className="rounded border border-dashed border-[var(--line)] p-6 text-center text-xs text-muted-foreground">
                면장을 선택하세요.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {declaration ? (
        <CostCreateDialog
          open={costCreateOpen}
          onClose={() => setCostCreateOpen(false)}
          declarationId={declaration.declaration_id}
          initialExchangeRate={declaration.exchange_rate}
          onCreated={() => {
            refreshCosts()
          }}
        />
      ) : null}
    </>
  )
}
