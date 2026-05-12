import { useCallback, useState, useEffect, useRef } from "react"
import { motion } from "motion/react"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock3,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { formatNumber, shortMfgName } from "@/lib/utils"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import { DetailSection, DetailField, DetailFieldGrid } from "@/components/common/detail"
import StatusChanger from "@/components/inbound/StatusChanger"
import BLLineTable, { BL_LINE_TABLE_ID, BL_LINE_COLUMN_META } from "./line-table"
import { ColumnVisibilityMenu } from "@/components/common/ColumnVisibilityMenu"
import { useColumnVisibility } from "@/lib/columnVisibility"
import { useColumnPinning } from "@/lib/columnPinning"
import LinkedMemoWidget from "@/components/memo/LinkedMemoWidget"
import AttachmentWidget from "@/components/common/AttachmentWidget"
import { useBLDetail, useBLLines } from "@/hooks/useInbound"
import { fetchWithAuth } from "@/lib/api"
import { notify } from "@/lib/notify"
import { MetaDetailBody } from "@/templates/MetaDetail"
import blShipmentDetailConfig from "@/config/details/bl_shipment"
import type { Manufacturer } from "@/types/masters"
import type { BLLineItem, BLShipment } from "@/types/inbound"
import type { DocumentFile } from "@/types/documentFile"
import BLCustomsCostTab from "./customs-cost-tab"
import BLOutboundTrackingTab from "./outbound-tracking-tab"

interface Props {
  blId: string
  onBack: () => void
}

const BL_DOCUMENT_ATTACHMENTS = [
  { fileType: "customs_declaration_pdf", title: "면장", uploadLabel: "면장 PDF 업로드" },
  { fileType: "commercial_invoice_pdf", title: "C/I", uploadLabel: "C/I PDF 업로드" },
  { fileType: "bill_of_lading_pdf", title: "B/L", uploadLabel: "B/L PDF 업로드" },
  { fileType: "packing_list_pdf", title: "P/L", uploadLabel: "P/L PDF 업로드" },
] as const

type BLDocumentFileType = (typeof BL_DOCUMENT_ATTACHMENTS)[number]["fileType"]

type StageTone = "done" | "current" | "warn" | "pending" | "muted"

interface ProgressStage {
  key: string
  label: string
  detail: string
  tone: StageTone
}

interface ReadinessCheck {
  key: string
  label: string
  detail: string
  ok: boolean
  required: boolean
}

function classifyBLDocument(name: string): BLDocumentFileType | null {
  const lower = name.toLowerCase()
  const compact = lower.replace(/[\s._()-]+/g, "")
  if (
    lower.includes("면장") ||
    lower.includes("수입신고") ||
    lower.includes("declaration") ||
    lower.includes("customs")
  ) {
    return "customs_declaration_pdf"
  }
  if (
    lower.includes("commercial") ||
    lower.includes("invoice") ||
    lower.includes("인보이스") ||
    lower.includes("송장") ||
    compact.includes("ci")
  ) {
    return "commercial_invoice_pdf"
  }
  if (
    lower.includes("bill of lading") ||
    lower.includes("선하증권") ||
    compact.includes("billoflading") ||
    compact.includes("bl")
  ) {
    return "bill_of_lading_pdf"
  }
  if (
    lower.includes("packing") ||
    lower.includes("패킹") ||
    lower.includes("포장명세") ||
    compact.includes("pl")
  ) {
    return "packing_list_pdf"
  }
  return null
}

function isStatusAtLeast(bl: BLShipment, target: BLShipment["status"]) {
  const order: BLShipment["status"][] = [
    "scheduled",
    "shipping",
    "arrived",
    "customs",
    "completed",
    "erp_done",
  ]
  return order.indexOf(bl.status) >= order.indexOf(target)
}

function hasDocument(files: DocumentFile[], fileType: BLDocumentFileType) {
  return files.some((file) => file.file_type === fileType)
}

function buildProgressStages(
  bl: BLShipment,
  lines: BLLineItem[],
  files: DocumentFile[],
): ProgressStage[] {
  const isImport = bl.inbound_type === "import"
  const hasCustomsDoc = hasDocument(files, "customs_declaration_pdf")
  const hasTradeDocs =
    hasDocument(files, "bill_of_lading_pdf") && hasDocument(files, "commercial_invoice_pdf")
  const hasCustomsValue =
    !!bl.declaration_number || !!bl.cif_amount_krw || !!bl.exchange_rate || hasCustomsDoc

  return [
    {
      key: "po",
      label: "P/O",
      detail: bl.po_number ?? (bl.po_id ? "연결됨" : "미연결"),
      tone: bl.po_id ? "done" : "warn",
    },
    {
      key: "lc",
      label: "L/C",
      detail: isImport ? (bl.lc_number ?? (bl.lc_id ? "연결됨" : "미연결")) : "대상 아님",
      tone: !isImport ? "muted" : bl.lc_id ? "done" : "warn",
    },
    {
      key: "bl",
      label: "B/L",
      detail: lines.length > 0 ? `${lines.length.toLocaleString("ko-KR")}개 품목` : "품목 없음",
      tone: lines.length > 0 && hasTradeDocs ? "done" : lines.length > 0 ? "current" : "warn",
    },
    {
      key: "arrival",
      label: "입항",
      detail: bl.actual_arrival ?? bl.eta ?? "일정 미정",
      tone: bl.actual_arrival ? "done" : isStatusAtLeast(bl, "arrived") ? "current" : "pending",
    },
    {
      key: "customs",
      label: "면장",
      detail: isImport ? (hasCustomsValue ? "확인됨" : "확인 필요") : "대상 아님",
      tone: !isImport
        ? "muted"
        : hasCustomsValue
          ? "done"
          : isStatusAtLeast(bl, "customs")
            ? "warn"
            : "pending",
    },
    {
      key: "stock",
      label: "입고",
      detail: isStatusAtLeast(bl, "completed") ? "재고 반영" : "진행중",
      tone: isStatusAtLeast(bl, "completed") ? "done" : "pending",
    },
    {
      key: "erp",
      label: "ERP",
      detail: bl.status === "erp_done" || bl.erp_registered ? "등록완료" : "미등록",
      tone:
        bl.status === "erp_done" || bl.erp_registered
          ? "done"
          : isStatusAtLeast(bl, "completed")
            ? "current"
            : "pending",
    },
  ]
}

function buildReadinessChecks(
  bl: BLShipment,
  lines: BLLineItem[],
  files: DocumentFile[],
): ReadinessCheck[] {
  const isImport = bl.inbound_type === "import"
  return [
    {
      key: "po",
      label: "P/O 연결",
      detail: bl.po_number ?? (bl.po_id ? "연결됨" : "미연결"),
      ok: !!bl.po_id,
      required: true,
    },
    {
      key: "lines",
      label: "입고품목",
      detail: lines.length > 0 ? `${lines.length.toLocaleString("ko-KR")}건` : "품목 없음",
      ok: lines.length > 0,
      required: true,
    },
    {
      key: "warehouse",
      label: "입고창고",
      detail: bl.warehouse_name ?? (bl.warehouse_id ? "지정됨" : "미지정"),
      ok: !!bl.warehouse_id,
      required: true,
    },
    {
      key: "lc",
      label: "L/C 연결",
      detail: !isImport ? "대상 아님" : (bl.lc_number ?? (bl.lc_id ? "연결됨" : "미연결")),
      ok: !isImport || !!bl.lc_id,
      required: isImport,
    },
    {
      key: "exchange_rate",
      label: "면장환율",
      detail: !isImport
        ? "대상 아님"
        : bl.exchange_rate
          ? `${bl.exchange_rate.toLocaleString("ko-KR")}`
          : "미입력",
      ok: !isImport || !!bl.exchange_rate,
      required: isImport,
    },
    {
      key: "documents",
      label: "필수 서류",
      detail: !isImport
        ? "대상 아님"
        : `${
            [
              "bill_of_lading_pdf",
              "commercial_invoice_pdf",
              "packing_list_pdf",
              "customs_declaration_pdf",
            ].filter((fileType) => hasDocument(files, fileType as BLDocumentFileType)).length
          }/4`,
      ok:
        !isImport ||
        (hasDocument(files, "bill_of_lading_pdf") &&
          hasDocument(files, "commercial_invoice_pdf") &&
          hasDocument(files, "packing_list_pdf") &&
          hasDocument(files, "customs_declaration_pdf")),
      required: isImport,
    },
    {
      key: "erp",
      label: "아마란스",
      detail: bl.status === "erp_done" || bl.erp_registered ? "등록완료" : "미등록",
      ok: bl.status === "erp_done" || bl.erp_registered === true,
      required: false,
    },
  ]
}

function stageClass(tone: StageTone) {
  switch (tone) {
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "current":
      return "border-blue-200 bg-blue-50 text-blue-700"
    case "warn":
      return "border-amber-200 bg-amber-50 text-amber-700"
    case "muted":
      return "border-muted bg-muted/30 text-muted-foreground"
    default:
      return "border-border bg-card text-muted-foreground"
  }
}

function stageIcon(tone: StageTone) {
  if (tone === "done") return <CheckCircle2 className="h-3.5 w-3.5" />
  if (tone === "warn") return <AlertTriangle className="h-3.5 w-3.5" />
  if (tone === "current") return <Clock3 className="h-3.5 w-3.5" />
  return <Circle className="h-3.5 w-3.5" />
}

export default function BLDetailView({ blId, onBack }: Props) {
  const { data: bl, loading: blLoading, reload: reloadBL } = useBLDetail(blId)
  const { data: lines, loading: linesLoading } = useBLLines(blId)
  const blLineColVis = useColumnVisibility(BL_LINE_TABLE_ID, BL_LINE_COLUMN_META)
  const blLineColPin = useColumnPinning(BL_LINE_TABLE_ID)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [manufacturerName, setManufacturerName] = useState<string>("")
  const documentSetInputRef = useRef<HTMLInputElement | null>(null)
  const [documentReloadKey, setDocumentReloadKey] = useState(0)
  const [documentSetUploading, setDocumentSetUploading] = useState(false)
  const [documentSetError, setDocumentSetError] = useState("")
  const [documentFiles, setDocumentFiles] = useState<DocumentFile[]>([])

  // 평탄 응답에는 공급사명이 포함되지 않으므로 별도 조회
  useEffect(() => {
    if (!bl?.manufacturer_id) {
      setManufacturerName("")
      return
    }
    if (bl.manufacturer_name) {
      setManufacturerName(bl.manufacturer_name)
      return
    }
    let cancelled = false
    fetchWithAuth<Manufacturer[]>("/api/v1/manufacturers")
      .then((list) => {
        if (cancelled) return
        const m = list.find((x) => x.manufacturer_id === bl.manufacturer_id)
        setManufacturerName(m?.name_kr ?? "")
      })
      .catch(() => {
        if (!cancelled) setManufacturerName("")
      })
    return () => {
      cancelled = true
    }
  }, [bl?.manufacturer_id, bl?.manufacturer_name])

  const loadDocuments = useCallback(async () => {
    const params = new URLSearchParams({ entity_type: "bl_shipments", entity_id: blId })
    try {
      const files = await fetchWithAuth<DocumentFile[]>(`/api/v1/attachments?${params}`)
      setDocumentFiles(files ?? [])
    } catch {
      setDocumentFiles([])
    }
  }, [blId])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  if (blLoading || !bl) return <LoadingSpinner />

  const isImport = bl.inbound_type === "import"
  const progressStages = buildProgressStages(bl, lines, documentFiles)
  const readinessChecks = buildReadinessChecks(bl, lines, documentFiles)
  const requiredIssues = readinessChecks.filter((check) => check.required && !check.ok)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetchWithAuth(`/api/v1/bls/${blId}`, { method: "DELETE" })
      setDeleteOpen(false)
      onBack()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "삭제에 실패했습니다")
    } finally {
      setDeleting(false)
    }
  }

  const uploadDocumentSet = async (files: FileList | null) => {
    const selected = Array.from(files ?? [])
    if (selected.length === 0) return

    const invalid = selected.filter((file) => !file.name.toLowerCase().endsWith(".pdf"))
    if (invalid.length > 0) {
      setDocumentSetError("PDF 파일만 업로드할 수 있습니다")
      if (documentSetInputRef.current) documentSetInputRef.current.value = ""
      return
    }

    const classified = selected.map((file) => ({ file, fileType: classifyBLDocument(file.name) }))
    const unknown = classified.filter((item) => !item.fileType).map((item) => item.file.name)
    if (unknown.length > 0) {
      setDocumentSetError(`서류 종류를 알 수 없습니다: ${unknown.join(", ")}`)
      if (documentSetInputRef.current) documentSetInputRef.current.value = ""
      return
    }

    setDocumentSetUploading(true)
    setDocumentSetError("")
    try {
      for (const item of classified) {
        const form = new FormData()
        form.append("entity_type", "bl_shipments")
        form.append("entity_id", blId)
        form.append("file_type", item.fileType!)
        form.append("file", item.file)
        await fetchWithAuth("/api/v1/attachments", { method: "POST", body: form })
      }
      await loadDocuments()
      setDocumentReloadKey((key) => key + 1)
    } catch (err) {
      setDocumentSetError(err instanceof Error ? err.message : "서류 세트 업로드에 실패했습니다")
    } finally {
      setDocumentSetUploading(false)
      if (documentSetInputRef.current) documentSetInputRef.current.value = ""
    }
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="sf-detail-header">
        <button
          type="button"
          className="sf-detail-header-back"
          onClick={onBack}
          aria-label="목록으로"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold" style={{ letterSpacing: "-0.012em" }}>
          입고 <span className="sf-mono">{bl.bl_number}</span>
        </h2>
        <StatusChanger
          blId={blId}
          currentStatus={bl.status}
          inboundType={bl.inbound_type}
          onChanged={reloadBL}
        />
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          삭제
        </Button>
      </div>

      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">기본정보</TabsTrigger>
          <TabsTrigger value="documents">서류</TabsTrigger>
          <TabsTrigger value="lines">입고품목</TabsTrigger>
          <TabsTrigger value="customs">면장/원가</TabsTrigger>
          <TabsTrigger value="outbound">출고추적</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <div className="space-y-4">
            <DetailSection title="진행 흐름">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
                {progressStages.map((stage) => (
                  <div
                    key={stage.key}
                    className={`min-h-[72px] rounded-md border px-3 py-2 ${stageClass(stage.tone)}`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      {stageIcon(stage.tone)}
                      <span>{stage.label}</span>
                    </div>
                    <div className="mt-2 truncate text-[11px] tabular-nums">{stage.detail}</div>
                  </div>
                ))}
              </div>
            </DetailSection>

            <DetailSection title="입고완료 체크">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {readinessChecks.map((check) => (
                  <div
                    key={check.key}
                    className={`rounded-md border px-3 py-2 ${check.ok ? "border-emerald-200 bg-emerald-50/60" : check.required ? "border-amber-200 bg-amber-50/70" : "border-muted bg-muted/30"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-medium text-foreground">{check.label}</div>
                      {check.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : check.required ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {check.detail}
                    </div>
                  </div>
                ))}
              </div>
              {requiredIssues.length > 0 ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  {requiredIssues.map((check) => check.label).join(", ")} 확인 후 입고완료 전환
                </div>
              ) : null}
            </DetailSection>

            <MetaDetailBody
              config={blShipmentDetailConfig}
              data={
                {
                  ...bl,
                  // 공급사 짧은 이름 + 별도 lookup 보강
                  manufacturer_name: shortMfgName(manufacturerName || bl.manufacturer_name),
                } as Record<string, unknown>
              }
              onInlineSave={async (key, value) => {
                await fetchWithAuth(`/api/v1/bls/${blId}`, {
                  method: "PUT",
                  body: JSON.stringify({ [key]: value }),
                })
                notify.success("수정되었습니다")
                reloadBL()
              }}
            />

            {lines.length > 0 &&
              (() => {
                const totalQty = lines.reduce((s, l) => s + l.quantity, 0)
                const totalMW = lines.reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000
                const totalInvoice = lines.reduce((s, l) => s + (l.invoice_amount_usd ?? 0), 0)
                // 원가 확정: 해외직수입 = unit_price_usd_wp × exchange_rate, 국내 = unit_price_krw_wp
                const exRate = bl.exchange_rate ?? 0
                const totalCostKrw = lines.reduce((s, l) => {
                  const costWp = isImport
                    ? l.unit_price_usd_wp != null
                      ? l.unit_price_usd_wp * exRate
                      : 0
                    : (l.unit_price_krw_wp ?? 0)
                  return s + costWp * (l.capacity_kw ?? 0) * 1000
                }, 0)
                const hasCost = lines.some(
                  (l) => l.unit_price_usd_wp != null || l.unit_price_krw_wp != null,
                )
                return (
                  <DetailSection title="합계">
                    <DetailFieldGrid cols={3}>
                      <DetailField label="총 수량" value={`${formatNumber(totalQty)} EA`} />
                      <DetailField label="총 용량" value={`${totalMW.toFixed(3)} MW`} />
                      {totalInvoice > 0 && (
                        <DetailField
                          label="총 입고금액"
                          value={`$${formatNumber(Math.round(totalInvoice))}`}
                        />
                      )}
                    </DetailFieldGrid>
                    {hasCost && totalCostKrw > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-1.5">원가 확정 (BL 기준)</p>
                        <div className="flex gap-6">
                          <div>
                            <p className="text-xs text-muted-foreground">총 원가</p>
                            <p className="text-sm font-mono font-medium text-blue-700">
                              {Math.round(totalCostKrw).toLocaleString("ko-KR")}원
                            </p>
                          </div>
                          {totalMW > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground">평균 원가</p>
                              <p className="text-sm font-mono font-medium text-blue-700">
                                {(totalCostKrw / (totalMW * 1_000_000)).toFixed(2)}원/Wp
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </DetailSection>
                )
              })()}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">B/L 서류 보관</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={documentSetUploading}
                  onClick={() => documentSetInputRef.current?.click()}
                >
                  <Upload
                    className={`mr-1 h-3.5 w-3.5 ${documentSetUploading ? "animate-pulse" : ""}`}
                  />
                  {documentSetUploading ? "업로드 중" : "서류 세트 업로드"}
                </Button>
                <input
                  ref={documentSetInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => void uploadDocumentSet(event.target.files)}
                />
              </div>
              {documentSetError && (
                <p className="text-[11px] text-destructive">{documentSetError}</p>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 pb-4 lg:grid-cols-2">
              {BL_DOCUMENT_ATTACHMENTS.map((item) => (
                <AttachmentWidget
                  key={item.fileType}
                  entityType="bl_shipments"
                  entityId={blId}
                  fileType={item.fileType}
                  title={`${bl.bl_number} ${item.title}`}
                  uploadLabel={item.uploadLabel}
                  compact
                  reloadKey={documentReloadKey}
                />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lines">
          <Separator className="my-2" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">입고 품목</h3>
            <div className="flex items-center gap-2">
              <ColumnVisibilityMenu
                tableId={BL_LINE_TABLE_ID}
                columns={BL_LINE_COLUMN_META}
                hidden={blLineColVis.hidden}
                setHidden={blLineColVis.setHidden}
                pinning={blLineColPin.pinning}
                pinLeft={blLineColPin.pinLeft}
                pinRight={blLineColPin.pinRight}
                unpin={blLineColPin.unpin}
              />
            </div>
          </div>
          {linesLoading ? (
            <LoadingSpinner />
          ) : (
            <BLLineTable
              items={lines}
              hidden={blLineColVis.hidden}
              pinning={blLineColPin.pinning}
              onPinningChange={blLineColPin.setPinning}
              currency={bl.currency}
              manufacturerName={manufacturerName || bl.manufacturer_name}
            />
          )}
        </TabsContent>

        <TabsContent value="customs">
          <BLCustomsCostTab bl={bl} lines={lines} />
        </TabsContent>

        <TabsContent value="outbound">
          <BLOutboundTrackingTab blId={blId} companyId={bl.company_id} lines={lines} />
        </TabsContent>
      </Tabs>

      <LinkedMemoWidget linkedTable="bl_shipments" linkedId={blId} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="입고 삭제"
        description={`"${bl.bl_number}" 입고 건과 연결된 입고품목이 모두 삭제됩니다. 정말 삭제하시겠습니까?`}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </motion.div>
  )
}
