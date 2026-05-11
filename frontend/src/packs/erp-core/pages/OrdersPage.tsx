import { Component, useState, useEffect, useMemo, useRef, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { PartnerCombobox } from "@/components/common/PartnerCombobox"
import { useAppStore } from "@/stores/appStore"
import { useOrderList, useOrderDashboard, useOrderFulfillmentRisk } from "@/hooks/useOrders"
import { useReceiptList, useReceiptDashboard } from "@/hooks/useReceipts"
import {
  useOutboundList,
  useOutboundDashboard,
  useSaleList,
  useSaleDashboard,
  useSaleSummary,
} from "@/hooks/useOutbound"
import { useServerSort } from "@/hooks/useServerSort"
import { CheckCircle2, Loader2 } from "lucide-react"
import { fetchWithAuth, fetchWithAuthMeta } from "@/lib/api"
import { confirmDialog } from "@/lib/dialogs"
import { companyParams } from "@/lib/companyUtils"
import { formatError, notify } from "@/lib/notify"
import { formatKw, formatNumber } from "@/lib/utils"
import SkeletonRows from "@/components/common/SkeletonRows"
import OrderListTable, {
  ORDER_TABLE_ID,
  ORDER_COLUMN_META,
} from "@/components/orders/OrderListTable"
import OrderDetailView from "@/components/orders/OrderDetailView"
import ReceiptListTable, {
  RECEIPT_TABLE_ID,
  RECEIPT_COLUMN_META,
} from "@/components/orders/ReceiptListTable"
import ReceiptMatchingPanel from "@/components/orders/ReceiptMatchingPanel"
import AutoMatchSection from "@/components/orders/AutoMatchSection"
import OutboundListTable, {
  OUTBOUND_TABLE_ID,
  OUTBOUND_COLUMN_META,
  type OutboundAutomationStatus,
} from "@/components/outbound/OutboundListTable"
import { ColumnVisibilityMenu } from "@/components/common/ColumnVisibilityMenu"
import { useColumnVisibility } from "@/lib/columnVisibility"
import { useColumnPinning } from "@/lib/columnPinning"
import OutboundDetailView from "@/components/outbound/OutboundDetailView"
import SaleListTable, { SALE_TABLE_ID, SALE_COLUMN_META } from "@/components/outbound/SaleListTable"
import SaleSummaryCards from "@/components/outbound/SaleSummaryCards"
import type { InventoryAllocation } from "@/components/inventory/AllocationForm"
import {
  ORDER_STATUS_LABEL,
  MANAGEMENT_CATEGORY_LABEL,
  type FulfillmentSource,
  type Order,
  type OrderStatus,
  type ManagementCategory,
  type Receipt,
  type CompleteReceiptMatchResponse,
} from "@/types/orders"
import {
  OUTBOUND_STATUS_LABEL,
  USAGE_CATEGORY_LABEL,
  type Outbound,
  type SaleListItem,
  type OutboundStatus,
  type UsageCategory,
} from "@/types/outbound"
import type { Partner, Manufacturer } from "@/types/masters"
import type { InventoryResponse } from "@/types/inventory"
import { DateInput } from "@/components/ui/date-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import ExcelToolbar from "@/components/excel/ExcelToolbar"
import {
  CardB,
  CommandTopLine,
  FilterButton,
  FilterChips,
  RailBlock,
  Sparkline,
  TileB,
  type DateRangeValue,
  type KwRangeValue,
} from "@/components/command/MockupPrimitives"
import { BreakdownRows } from "@/components/command/BreakdownRows"
import { KpiStrip } from "@/components/command/KpiStrip"
import { flatSparkFromValue } from "@/templates/sparkUtils"

class OrderDetailErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error("[Order detail render failed]", error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <div className="font-medium">수주 상세 화면을 불러오지 못했습니다.</div>
        <p className="mt-1 text-xs">목록은 유지되도록 막아두었습니다. 잠시 후 다시 열어주세요.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={this.props.onBack}
        >
          목록으로 돌아가기
        </Button>
      </div>
    )
  }
}

const SALES_TAB_OPTIONS = [
  { key: "orders", label: "수주" },
  { key: "outbound", label: "출고" },
  { key: "sales", label: "판매/계산서" },
  { key: "receipts", label: "수금" },
  { key: "matching", label: "수금매칭" },
]
const SALES_TABS = new Set(SALES_TAB_OPTIONS.map((tab) => tab.key))
type OrderWorkQueue = "" | "delivery_soon" | "no_site"
type OutboundWorkQueue = "" | "sale_unregistered"
type ReceiptMatchFilter = "open" | "partial" | "unmatched"
type ReceiptMatchStatus = "matched" | "partial" | "unmatched"
type SaleErpClosedFilter = "" | "true" | "false"
type SaleReceiptFilter = "" | "open" | "unpaid" | "partial" | "paid"
type SaleBulkActionMode = "invoice" | "erp_close" | "receipt_complete"
const BULK_SALE_PREVIEW_PAGE_SIZE = 1000
const BULK_SALE_PREVIEW_MAX_PAGES = 500
const BULK_SALE_CREATE_BATCH_SIZE = 8

type BulkSaleBlockReason =
  | "이미 매출 있음"
  | "정상 출고 아님"
  | "판매 용도 아님"
  | "거래처 없음"
  | "Wp단가 없음"
  | "수량 없음"
  | "규격 없음"

interface BulkSaleCreatePlan {
  ready: Outbound[]
  blocked: Array<{ outbound: Outbound; reason: BulkSaleBlockReason }>
  reasonCounts: Array<{ reason: BulkSaleBlockReason; count: number }>
  quantity: number
  capacityKw: number
  supplyAmount: number
  vatAmount: number
  totalAmount: number
}

interface BulkSalePreviewFilters {
  status?: string
  usageCategory?: string
  manufacturerId?: string
  start?: string
  end?: string
  minKw?: number
  maxKw?: number
  sort?: string
  order?: "asc" | "desc"
}

function getOrderWorkQueue(value: string | null): OrderWorkQueue {
  return value === "delivery_soon" || value === "no_site" ? value : ""
}

function getReceiptMatchFilter(receipt: Receipt): ReceiptMatchStatus {
  const matched = receipt.matched_total ?? 0
  if (matched >= receipt.amount) return "matched"
  if (matched > 0) return "partial"
  return "unmatched"
}

// isDeliveryDueSoon — 이전엔 client-side work_queue 필터에 사용. 이제 서버 work_queue=delivery_soon 으로 대체.
// 호출처 제거됨 (C-1 orders).

type SalesMetric = {
  lbl: string
  v: string
  /** NumberTween 보간을 위한 raw 숫자 값. formatter 와 함께 주어지면 카운트업 표시. */
  numericValue?: number
  formatter?: (n: number) => string
  u?: string
  sub?: string
  tone: "solar" | "ink" | "info" | "warn" | "pos"
  delta?: string
  spark?: number[]
  metricId?: string // /insights/:metric 으로 드릴다운 — 등록된 metric 만.
}

function fmtSalesMw(kw: number) {
  if (!Number.isFinite(kw) || kw <= 0) return "0.00"
  return (kw / 1000).toFixed(kw >= 100_000 ? 1 : 2)
}

function fmtEok(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00"
  return (value / 100_000_000).toFixed(value >= 10_000_000_000 ? 1 : 2)
}

function todayLocalDate() {
  const now = new Date()
  const tzOffsetMs = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10)
}

function getSaleOutstandingAmount(item: SaleListItem) {
  if (item.outstanding_amount != null) return Math.max(0, item.outstanding_amount)
  const total = item.sale.total_amount ?? item.total_amount ?? 0
  const collected = item.collected_amount ?? 0
  return Math.max(0, total - collected)
}

function isReceiptQueueFilter(receiptFilter: SaleReceiptFilter) {
  return receiptFilter === "open" || receiptFilter === "unpaid" || receiptFilter === "partial"
}

function getSaleBulkActionMode(
  invoiceFilter: string,
  erpClosedFilter: SaleErpClosedFilter,
  receiptFilter: SaleReceiptFilter,
): SaleBulkActionMode {
  if (isReceiptQueueFilter(receiptFilter)) return "receipt_complete"
  return invoiceFilter === "issued" && erpClosedFilter === "false" ? "erp_close" : "invoice"
}

function isSaleSelectableForBulk(item: SaleListItem, mode: SaleBulkActionMode) {
  if (mode === "receipt_complete") {
    return getSaleOutstandingAmount(item) > 0 && item.sale.status !== "cancelled" && item.status !== "cancelled"
  }
  if (mode === "erp_close") return !!item.sale.tax_invoice_date && !item.sale.erp_closed
  return !item.sale.tax_invoice_date
}

function sharedInvoiceEmail(items: SaleListItem[]) {
  const emails = Array.from(
    new Set(
      items
        .map((item) => item.sale.tax_invoice_email?.trim())
        .filter((email): email is string => !!email),
    ),
  )
  return emails.length === 1 ? emails[0] : ""
}

function getBulkSaleBlockReason(ob: Outbound): BulkSaleBlockReason | null {
  if (ob.sale) return "이미 매출 있음"
  if (ob.status !== "active") return "정상 출고 아님"
  if (ob.usage_category !== "sale" && ob.usage_category !== "sale_spare") return "판매 용도 아님"
  if (!ob.customer_id) return "거래처 없음"
  if (!Number.isFinite(ob.unit_price_wp ?? 0) || (ob.unit_price_wp ?? 0) <= 0) return "Wp단가 없음"
  if (!Number.isFinite(ob.quantity) || ob.quantity <= 0) return "수량 없음"
  if (!Number.isFinite(ob.spec_wp ?? 0) || (ob.spec_wp ?? 0) <= 0) return "규격 없음"
  return null
}

function estimateSaleAmount(ob: Outbound) {
  const unitPriceEa = Math.round((ob.unit_price_wp ?? 0) * (ob.spec_wp ?? 0))
  const supplyAmount = Math.round(unitPriceEa * ob.quantity)
  const vatAmount = Math.round(supplyAmount * 0.1)
  return { supplyAmount, vatAmount, totalAmount: supplyAmount + vatAmount }
}

function buildBulkSaleCreatePlan(items: Outbound[]): BulkSaleCreatePlan {
  const ready: Outbound[] = []
  const blocked: BulkSaleCreatePlan["blocked"] = []
  const reasonMap = new Map<BulkSaleBlockReason, number>()
  let quantity = 0
  let capacityKw = 0
  let supplyAmount = 0
  let vatAmount = 0
  let totalAmount = 0

  for (const outbound of items) {
    const reason = getBulkSaleBlockReason(outbound)
    if (reason) {
      blocked.push({ outbound, reason })
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)
      continue
    }
    ready.push(outbound)
    quantity += outbound.quantity
    capacityKw += outbound.capacity_kw ?? 0
    const estimate = estimateSaleAmount(outbound)
    supplyAmount += estimate.supplyAmount
    vatAmount += estimate.vatAmount
    totalAmount += estimate.totalAmount
  }

  const reasonCounts = Array.from(reasonMap.entries()).map(([reason, count]) => ({ reason, count }))
  return { ready, blocked, reasonCounts, quantity, capacityKw, supplyAmount, vatAmount, totalAmount }
}

function getOutboundAutomationStatus(ob: Outbound): OutboundAutomationStatus {
  const reason = getBulkSaleBlockReason(ob)
  if (!reason) return { label: "생성 가능", tone: "pos" }
  return { label: "제외", reason, tone: reason === "이미 매출 있음" ? "ghost" : "warn" }
}

function buildBulkSalePreviewQuery(companyId: string | null, filters: BulkSalePreviewFilters) {
  const params = companyParams(companyId)
  params.set("work_queue", "sale_unregistered")
  if (filters.status) params.set("status", filters.status)
  if (filters.usageCategory) params.set("usage_category", filters.usageCategory)
  if (filters.manufacturerId) params.set("manufacturer_id", filters.manufacturerId)
  if (filters.start) params.set("start", filters.start)
  if (filters.end) params.set("end", filters.end)
  if (filters.minKw !== undefined) params.set("min_kw", String(filters.minKw))
  if (filters.maxKw !== undefined) params.set("max_kw", String(filters.maxKw))
  if (filters.sort) params.set("sort", filters.sort)
  if (filters.order) params.set("order", filters.order)
  return params
}

async function fetchBulkSalePreviewOutbounds(
  companyId: string | null,
  filters: BulkSalePreviewFilters,
): Promise<Outbound[]> {
  const fetchPage = (offset: number) => {
    const params = buildBulkSalePreviewQuery(companyId, filters)
    params.set("limit", String(BULK_SALE_PREVIEW_PAGE_SIZE))
    params.set("offset", String(offset))
    return fetchWithAuthMeta<Outbound[]>(`/api/v1/outbounds?${params}`)
  }

  const first = await fetchPage(0)
  const items = [...first.data]
  const total = first.totalCount
  if (total !== null && items.length >= total) return items

  for (let page = 1; page < BULK_SALE_PREVIEW_MAX_PAGES; page += 1) {
    const offset = page * BULK_SALE_PREVIEW_PAGE_SIZE
    if (total !== null && offset >= total) break
    const next = await fetchPage(offset)
    items.push(...next.data)
    if (next.data.length < BULK_SALE_PREVIEW_PAGE_SIZE) break
    if (next.totalCount !== null && items.length >= next.totalCount) break
  }
  return items
}

async function createSalesInBatches(targets: Outbound[]) {
  const results: PromiseSettledResult<unknown>[] = []
  for (let i = 0; i < targets.length; i += BULK_SALE_CREATE_BATCH_SIZE) {
    const batch = targets.slice(i, i + BULK_SALE_CREATE_BATCH_SIZE)
    const settled = await Promise.allSettled(
      batch.map((ob) =>
        fetchWithAuth("/api/v1/sales", {
          method: "POST",
          body: JSON.stringify({
            outbound_id: ob.outbound_id,
            order_id: ob.order_id,
            customer_id: ob.customer_id,
            quantity: ob.quantity,
            capacity_kw: ob.capacity_kw,
            unit_price_wp: ob.unit_price_wp,
            erp_closed: false,
          }),
        }),
      ),
    )
    results.push(...settled)
  }
  return results
}

export default function OrdersPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)

  // 탭 1: 수주
  const [orderStatusFilter, setOrderStatusFilter] = useState("")
  const [orderCustomerFilter, setOrderCustomerFilter] = useState("")
  const [orderCategoryFilter, setOrderCategoryFilter] = useState("")
  const [orderDateRange, setOrderDateRange] = useState<DateRangeValue>(null)
  const [orderKwRange, setOrderKwRange] = useState<KwRangeValue>(null)
  const _loc = useLocation()
  const navigate = useNavigate()
  const [orderWorkQueue, setOrderWorkQueue] = useState<OrderWorkQueue>(() =>
    getOrderWorkQueue(new URLSearchParams(_loc.search).get("alert")),
  )
  const [selectedOrderState, setSelectedOrderState] = useState<{
    id: string | null
    locationKey: string
  }>({
    id: null,
    locationKey: _loc.key,
  })
  const selectedOrder = selectedOrderState.locationKey === _loc.key ? selectedOrderState.id : null
  const setSelectedOrder = (id: string | null) =>
    setSelectedOrderState({ id, locationKey: _loc.key })
  // URL 탭 파라미터 읽기 (사이드바 수주/수금 링크 구분)
  const urlTab = new URLSearchParams(_loc.search).get("tab") ?? "orders"
  const activeTab = SALES_TABS.has(urlTab) ? urlTab : "orders"
  const handleTabChange = (tab: string) => {
    setSelectedOrder(null)
    const nextTab = SALES_TABS.has(tab) ? tab : "orders"
    navigate(nextTab === "orders" ? "/orders" : `/orders?tab=${nextTab}`, { replace: true })
  }

  const handleOrderWorkQueueChange = (value: string) => {
    const nextQueue = getOrderWorkQueue(value)
    setOrderWorkQueue(nextQueue)
    const params = new URLSearchParams(_loc.search)
    if (nextQueue) params.set("alert", nextQueue)
    else params.delete("alert")
    const next = params.toString()
    navigate(`/orders${next ? `?${next}` : ""}`, { replace: true })
  }

  // 탭 2: 출고
  const [obStatusFilter, setObStatusFilter] = useState("")
  const [obUsageFilter, setObUsageFilter] = useState("")
  const [obMfgFilter, setObMfgFilter] = useState("")
  const [obDateRange, setObDateRange] = useState<DateRangeValue>(null)
  const [obKwRange, setObKwRange] = useState<KwRangeValue>(null)
  const [obWorkQueueFilter, setObWorkQueueFilter] = useState<OutboundWorkQueue>("")
  const [bulkSalePreviewItems, setBulkSalePreviewItems] = useState<Outbound[]>([])
  const [bulkSalePreviewLoading, setBulkSalePreviewLoading] = useState(false)
  const [bulkSalePreviewError, setBulkSalePreviewError] = useState("")
  const [bulkSaleCreating, setBulkSaleCreating] = useState(false)
  const [bulkSaleCreateError, setBulkSaleCreateError] = useState("")
  const [selectedOutbound, setSelectedOutbound] = useState<string | null>(null)
  const outboundColVis = useColumnVisibility(OUTBOUND_TABLE_ID, OUTBOUND_COLUMN_META)
  const outboundColPin = useColumnPinning(OUTBOUND_TABLE_ID)
  const orderColVis = useColumnVisibility(ORDER_TABLE_ID, ORDER_COLUMN_META)
  const orderColPin = useColumnPinning(ORDER_TABLE_ID)
  const saleColVis = useColumnVisibility(SALE_TABLE_ID, SALE_COLUMN_META)
  const saleColPin = useColumnPinning(SALE_TABLE_ID)
  const receiptColVis = useColumnVisibility(RECEIPT_TABLE_ID, RECEIPT_COLUMN_META)
  const receiptColPin = useColumnPinning(RECEIPT_TABLE_ID)
  // 칩 필터를 server-side 로 위임 — KPI/sparkline/rail/breakdown 은 useOutboundDashboard,
  // 표는 useOutboundList(페이지네이션) 로 받는다. 이전엔 useOutboundListAll 로 모든 outbounds 를
  // fetch (수 MB) 후 client-side filter/aggregation 했다 (D-OutboundDashboardC1).
  const [obPageIndex, setObPageIndex] = useState(0)
  const [obPageSize, setObPageSize] = useState(50)
  const obSort = useServerSort("outbound_date", "desc", () => setObPageIndex(0))
  const obPageResetKey = `${obStatusFilter}|${obUsageFilter}|${obMfgFilter}|${obWorkQueueFilter}|${obDateRange?.start ?? ""}|${obDateRange?.end ?? ""}|${obKwRange?.min ?? ""}|${obKwRange?.max ?? ""}`
  useEffect(() => {
    void obPageResetKey
    setObPageIndex(0)
  }, [obPageResetKey])

  const {
    dashboard: outboundDash,
    loading: obDashLoading,
    reload: reloadOutboundDash,
  } = useOutboundDashboard({
    status: obStatusFilter || undefined,
    usage_category: obUsageFilter || undefined,
    manufacturer_id: obMfgFilter || undefined,
    work_queue: obWorkQueueFilter || undefined,
    start: obDateRange?.start || undefined,
    end: obDateRange?.end || undefined,
    min_kw: obKwRange?.min ?? undefined,
    max_kw: obKwRange?.max ?? undefined,
  })

  const {
    items: outbounds,
    totalCount: outboundsTotal,
    loading: obListLoading,
    reload: reloadOutboundList,
  } = useOutboundList({
    status: obStatusFilter || undefined,
    usage_category: obUsageFilter || undefined,
    manufacturer_id: obMfgFilter || undefined,
    work_queue: obWorkQueueFilter || undefined,
    start: obDateRange?.start || undefined,
    end: obDateRange?.end || undefined,
    min_kw: obKwRange?.min ?? undefined,
    max_kw: obKwRange?.max ?? undefined,
    sort: obSort.queryParams.sort,
    order: obSort.queryParams.order,
    pageIndex: obPageIndex,
    pageSize: obPageSize,
  })

  const obLoading = obDashLoading || obListLoading
  const bulkSalePreviewFilters = useMemo<BulkSalePreviewFilters>(
    () => ({
      status: obStatusFilter || undefined,
      usageCategory: obUsageFilter || undefined,
      manufacturerId: obMfgFilter || undefined,
      start: obDateRange?.start || undefined,
      end: obDateRange?.end || undefined,
      minKw: obKwRange?.min ?? undefined,
      maxKw: obKwRange?.max ?? undefined,
      sort: obSort.queryParams.sort,
      order: obSort.queryParams.order,
    }),
    [
      obStatusFilter,
      obUsageFilter,
      obMfgFilter,
      obDateRange?.start,
      obDateRange?.end,
      obKwRange?.min,
      obKwRange?.max,
      obSort.queryParams.sort,
      obSort.queryParams.order,
    ],
  )
  const showBulkSaleCreatePanel =
    activeTab === "outbound" && obWorkQueueFilter === "sale_unregistered" && !selectedOutbound
  const bulkSaleCreatePlan = useMemo(
    () => buildBulkSaleCreatePlan(bulkSalePreviewItems),
    [bulkSalePreviewItems],
  )
  useEffect(() => {
    let cancelled = false
    if (!showBulkSaleCreatePanel || !selectedCompanyId) {
      setBulkSalePreviewItems([])
      setBulkSalePreviewLoading(false)
      setBulkSalePreviewError("")
      setBulkSaleCreateError("")
      return () => {
        cancelled = true
      }
    }

    setBulkSalePreviewLoading(true)
    setBulkSalePreviewError("")
    setBulkSaleCreateError("")
    fetchBulkSalePreviewOutbounds(selectedCompanyId, bulkSalePreviewFilters)
      .then((items) => {
        if (!cancelled) setBulkSalePreviewItems(items)
      })
      .catch((error) => {
        if (cancelled) return
        setBulkSalePreviewItems([])
        setBulkSalePreviewError(formatError(error))
      })
      .finally(() => {
        if (!cancelled) setBulkSalePreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bulkSalePreviewFilters, selectedCompanyId, showBulkSaleCreatePanel])

  const reloadOutbounds = async () => {
    await Promise.all([reloadOutboundDash(), reloadOutboundList()])
  }

  // 탭 3: 판매
  const [saleCustomerFilter, setSaleCustomerFilter] = useState("")
  const [saleDateRange, setSaleDateRange] = useState<DateRangeValue>(null)
  const [saleInvoiceFilter, setSaleInvoiceFilter] = useState("")
  const [saleErpClosedFilter, setSaleErpClosedFilter] = useState<SaleErpClosedFilter>("")
  const [saleReceiptFilter, setSaleReceiptFilter] = useState<SaleReceiptFilter>("")
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set())
  const [bulkInvoiceDate, setBulkInvoiceDate] = useState(todayLocalDate)
  const [bulkInvoiceEmail, setBulkInvoiceEmail] = useState("")
  const [bulkInvoiceErpClose, setBulkInvoiceErpClose] = useState(false)
  const [bulkInvoiceSaving, setBulkInvoiceSaving] = useState(false)
  const [bulkInvoiceError, setBulkInvoiceError] = useState("")
  const [bulkReceiptSaving, setBulkReceiptSaving] = useState(false)
  const [bulkReceiptError, setBulkReceiptError] = useState("")
  const [receiptCompletingSaleId, setReceiptCompletingSaleId] = useState<string | null>(null)
  const autoSelectedSaleQueueKey = useRef("")
  const [salePageIndex, setSalePageIndex] = useState(0)
  const [salePageSize, setSalePageSize] = useState(50)
  const saleSort = useServerSort("tax_invoice_date", "desc", () => {
    setSalePageIndex(0)
    setSelectedSaleIds(new Set())
  })
  const salePageResetKey = `${saleCustomerFilter}|${saleDateRange?.start ?? ""}|${saleDateRange?.end ?? ""}|${saleInvoiceFilter}|${saleErpClosedFilter}|${saleReceiptFilter}`
  useEffect(() => {
    void salePageResetKey
    setSalePageIndex(0)
    setSelectedSaleIds(new Set())
  }, [salePageResetKey])

  // C-1 sales — useSaleListAll 제거. KPI/sparkline/right-rail/SaleSummaryCards 는 useSaleDashboard,
  // 표는 useSaleList(서버 페이지네이션). 칩 필터(customer/date/invoice_status) 도 server-side.
  const saleFilters = {
    customer_id: saleCustomerFilter || undefined,
    start: saleDateRange?.start || undefined,
    end: saleDateRange?.end || undefined,
    invoice_status: saleInvoiceFilter || undefined,
    receipt_status: saleReceiptFilter || undefined,
    erp_closed: saleErpClosedFilter || undefined,
  }
  const {
    dashboard: saleDash,
    loading: saleDashLoading,
    reload: reloadSaleDash,
  } = useSaleDashboard(saleFilters)
  const {
    items: sales,
    totalCount: salesTotal,
    loading: saleListLoading,
    reload: reloadSaleList,
  } = useSaleList({
    ...saleFilters,
    sort: saleSort.queryParams.sort,
    order: saleSort.queryParams.order,
    pageIndex: salePageIndex,
    pageSize: salePageSize,
  })
  const { summary: erpOpenSaleSummary } = useSaleSummary({
    customer_id: saleCustomerFilter || undefined,
    start: saleDateRange?.start || undefined,
    end: saleDateRange?.end || undefined,
    invoice_status: "issued",
    erp_closed: "false",
  })
  const { summary: receiptOpenSaleSummary } = useSaleSummary({
    customer_id: saleCustomerFilter || undefined,
    start: saleDateRange?.start || undefined,
    end: saleDateRange?.end || undefined,
    receipt_status: "open",
  })
  const saleLoading = saleDashLoading || saleListLoading
  const saleBulkActionMode = getSaleBulkActionMode(saleInvoiceFilter, saleErpClosedFilter, saleReceiptFilter)
  const reloadSales = async () => {
    await Promise.all([reloadSaleDash(), reloadSaleList()])
  }

  useEffect(() => {
    const queueMode: SaleBulkActionMode | "" =
      saleBulkActionMode === "receipt_complete"
        ? "receipt_complete"
        : saleInvoiceFilter === "pending"
          ? "invoice"
          : saleBulkActionMode === "erp_close"
            ? "erp_close"
            : ""
    if (activeTab !== "sales" || saleLoading || !queueMode) {
      return
    }

    const visibleKey = sales.map((sale) => sale.sale_id).join(",")
    const nextKey = `${queueMode}|${salePageIndex}|${salePageSize}|${salesTotal}|${visibleKey}`
    if (autoSelectedSaleQueueKey.current === nextKey) return
    autoSelectedSaleQueueKey.current = nextKey

    const selectable = sales.filter((sale) => isSaleSelectableForBulk(sale, queueMode))
    setSelectedSaleIds(new Set(selectable.map((sale) => sale.sale_id)))
    setBulkInvoiceError("")
    setBulkReceiptError("")
    if (queueMode === "receipt_complete") {
      return
    }
    if (queueMode === "erp_close") {
      setBulkInvoiceDate(selectable[0]?.sale.tax_invoice_date ?? todayLocalDate())
      setBulkInvoiceEmail("")
      setBulkInvoiceErpClose(true)
    } else {
      setBulkInvoiceDate(todayLocalDate())
      setBulkInvoiceEmail(sharedInvoiceEmail(selectable))
      setBulkInvoiceErpClose(false)
    }
  }, [
    activeTab,
    saleBulkActionMode,
    saleInvoiceFilter,
    saleLoading,
    salePageIndex,
    salePageSize,
    sales,
    salesTotal,
  ])

  // 탭 4: 수금
  const [receiptCustomerFilter, setReceiptCustomerFilter] = useState("")
  const [receiptDateRange, setReceiptDateRange] = useState<DateRangeValue>(null)
  const [receiptMatchFilter, setReceiptMatchFilter] = useState<ReceiptMatchFilter>("open")
  const [orderActionError, setOrderActionError] = useState("")
  const [orderSourceHints, setOrderSourceHints] = useState<Record<string, FulfillmentSource>>({})

  // 마스터 데이터
  const [partners, setPartners] = useState<Partner[]>([])
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])

  // 알림 딥링크 intent 처리
  useEffect(() => {
    const params = new URLSearchParams(_loc.search)
    setOrderWorkQueue(getOrderWorkQueue(params.get("alert")))
    const invoiceStatus = params.get("invoice_status")
    if (invoiceStatus === "issued" || invoiceStatus === "pending") {
      setSaleInvoiceFilter(invoiceStatus)
    }
  }, [_loc.search])

  const orderFilters: {
    status?: string
    customer_id?: string
    management_category?: string
    work_queue?: "delivery_soon" | "no_site"
    start?: string
    end?: string
    min_kw?: number
    max_kw?: number
  } = {}
  if (orderStatusFilter) orderFilters.status = orderStatusFilter
  if (orderCustomerFilter) orderFilters.customer_id = orderCustomerFilter
  if (orderCategoryFilter) orderFilters.management_category = orderCategoryFilter
  if (orderWorkQueue) orderFilters.work_queue = orderWorkQueue
  if (orderDateRange) {
    orderFilters.start = orderDateRange.start
    orderFilters.end = orderDateRange.end
  }
  if (orderKwRange) {
    if (orderKwRange.min !== null) orderFilters.min_kw = orderKwRange.min
    if (orderKwRange.max !== null) orderFilters.max_kw = orderKwRange.max
  }
  // 페이지네이션 상태 (수주 탭).
  const [orderPageIndex, setOrderPageIndex] = useState(0)
  const [orderPageSize, setOrderPageSize] = useState(50)
  const orderSort = useServerSort("order_date", "desc", () => setOrderPageIndex(0))
  const orderPageResetKey = `${orderStatusFilter}|${orderCustomerFilter}|${orderCategoryFilter}|${orderWorkQueue}|${orderDateRange?.start ?? ""}|${orderDateRange?.end ?? ""}|${orderKwRange?.min ?? ""}|${orderKwRange?.max ?? ""}`
  useEffect(() => {
    void orderPageResetKey
    setOrderPageIndex(0)
  }, [orderPageResetKey])

  const receiptFilters: { customer_id?: string; start?: string; end?: string } = {}
  if (receiptCustomerFilter) receiptFilters.customer_id = receiptCustomerFilter
  if (receiptDateRange) {
    receiptFilters.start = receiptDateRange.start
    receiptFilters.end = receiptDateRange.end
  }

  // C-1 orders — useOrderListAll → useOrderDashboard(KPI/sparkline) + useOrderList(paginated table).
  // work_queue 필터는 backend applyOrderFilters 가 server-side 로 처리.
  const {
    dashboard: orderDash,
    loading: orderDashLoading,
    reload: reloadOrderDash,
  } = useOrderDashboard(orderFilters)
  const {
    items: orders,
    totalCount: ordersTotal,
    loading: orderListLoading,
    reload: reloadOrderList,
  } = useOrderList({
    ...orderFilters,
    sort: orderSort.queryParams.sort,
    order: orderSort.queryParams.order,
    pageIndex: orderPageIndex,
    pageSize: orderPageSize,
  })
  const ordersLoading = orderDashLoading || orderListLoading
  const reloadOrders = async () => {
    await Promise.all([reloadOrderDash(), reloadOrderList()])
  }
  // C-1 receipts — KPI/sparkline 은 dashboard, 표/매칭 패널은 useReceiptList(필요시 후속 페이지네이션).
  const {
    data: receipts,
    loading: receiptsLoading,
    reload: reloadReceiptList,
  } = useReceiptList(receiptFilters)
  const { dashboard: receiptDash, reload: reloadReceiptDash } = useReceiptDashboard(receiptFilters)
  const visibleReceipts = useMemo(() => {
    if (receiptMatchFilter === "open") {
      return receipts.filter((receipt) => getReceiptMatchFilter(receipt) !== "matched")
    }
    return receipts.filter((receipt) => getReceiptMatchFilter(receipt) === receiptMatchFilter)
  }, [receipts, receiptMatchFilter])
  const reloadReceipts = async () => {
    await Promise.all([reloadReceiptList(), reloadReceiptDash()])
  }

  // visibleOrders 는 표 렌더링 한정 — server-side work_queue 가 적용된 현재 페이지.
  const visibleOrders = orders
  const visibleActiveOrderIds = useMemo(
    () =>
      visibleOrders
        .filter(
          (order) =>
            (order.status === "received" || order.status === "partial") &&
            (order.remaining_qty ?? order.quantity) > 0,
        )
        .map((order) => order.order_id),
    [visibleOrders],
  )
  const { riskByOrder: orderRiskByOrder } = useOrderFulfillmentRisk(visibleActiveOrderIds)

  useEffect(() => {
    const incomingOrders = orders.filter(
      (order) =>
        order.fulfillment_source === "incoming" &&
        order.status !== "cancelled" &&
        order.company_id &&
        order.product_id,
    )
    if (incomingOrders.length === 0) {
      let cancelled = false
      Promise.resolve().then(() => {
        if (!cancelled) setOrderSourceHints({})
      })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false
    const loadHints = async () => {
      const companyIds = [...new Set(incomingOrders.map((order) => order.company_id))]
      const inventoryEntries = await Promise.all(
        companyIds.map((companyId) =>
          fetchWithAuth<InventoryResponse>("/api/v1/calc/inventory", {
            method: "POST",
            body: JSON.stringify({ company_id: companyId }),
          })
            .then((result): [string, InventoryResponse] | null => [companyId, result])
            .catch(() => null),
        ),
      )
      if (cancelled) return

      const inventoryByCompany = new Map(
        inventoryEntries.filter(Boolean) as [string, InventoryResponse][],
      )
      const groupedOrders = new Map<string, Order[]>()
      for (const order of incomingOrders) {
        const key = `${order.company_id}:${order.product_id}`
        groupedOrders.set(key, [...(groupedOrders.get(key) ?? []), order])
      }

      const next: Record<string, FulfillmentSource> = {}
      for (const group of groupedOrders.values()) {
        const first = group[0]
        const inventory = inventoryByCompany.get(first.company_id)
        const item = inventory?.items.find((it) => it.product_id === first.product_id)
        let remainingStockKw = item?.available_kw ?? 0
        for (const order of [...group].sort((a, b) => a.order_date.localeCompare(b.order_date))) {
          const needKw = order.capacity_kw ?? order.quantity * (order.wattage_kw ?? 0)
          if (needKw > 0 && remainingStockKw + 0.001 >= needKw) {
            next[order.order_id] = "stock"
            remainingStockKw -= needKw
          }
        }
      }
      setOrderSourceHints(next)
    }

    void loadHints()
    return () => {
      cancelled = true
    }
  }, [orders])

  useEffect(() => {
    fetchWithAuth<Partner[]>("/api/v1/partners")
      .then((list) =>
        setPartners(
          list.filter(
            (p) => p.is_active && (p.partner_type === "customer" || p.partner_type === "both"),
          ),
        ),
      )
      .catch(() => {})
    fetchWithAuth<Manufacturer[]>("/api/v1/manufacturers")
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => {})
  }, [])

  // ⚠️ 모든 useMemo는 early return(아래 selectedCompanyId/selectedOrder 분기) 이전이어야 함 — Hook 순서 규칙
  // 집계는 outboundDash 에서, 표 렌더링은 outbounds(현재 페이지) 로.
  const outboundsTotalCount = outboundDash?.totals.count ?? outboundsTotal

  // C-1 orders — KPI/sparkline 은 dashboard 에서. 표 한정 visibleOrders 는 server-paginated 현재 페이지.
  const ordersKw = orderDash?.totals.kw_sum ?? 0
  const ordersTotalCount = orderDash?.totals.count ?? ordersTotal
  const activeOrdersCount = orderDash?.totals.active_count ?? 0
  const outboundKw = outboundDash?.totals.kw_sum ?? 0
  const saleTotal = saleDash?.totals.sale_amount_sum ?? 0
  const salesTotalCount = saleDash?.totals.count ?? salesTotal
  const saleCustomersCount = saleDash?.totals.customers_count ?? 0
  const saleAvgUnitPriceWp = saleDash?.totals.avg_unit_price_wp ?? 0
  const receiptTotal = receiptDash?.totals.amount_sum ?? 0
  const receiptRemaining = receiptDash?.totals.remaining_sum ?? 0
  const receiptCount = receiptDash?.totals.count ?? receipts.length
  const openReceiptCount = visibleReceipts.length
  const receiptPartialMatchCount = receiptDash?.totals.partial_match_count ?? 0
  const receiptRecoveryRate = receiptDash?.totals.recovery_rate ?? 0
  const customersCount = orderDash?.totals.active_customers_count ?? 0
  const recent30AvgUnitPriceWp = useMemo(() => {
    if (!orderDash || orderDash.totals.recent_30_count === 0) return null
    return {
      avg: orderDash.totals.recent_30_avg_unit_price_wp,
      count: orderDash.totals.recent_30_count,
    }
  }, [orderDash])
  // unit_price 15일 MA 180일 — 서버 dashboard.unit_price_ma15_180 사용 (이전 client-side 계산 대체).
  const unitPriceWpMa15Spark = useMemo(() => orderDash?.unit_price_ma15_180 ?? [], [orderDash])
  const monthlyOutboundKw = useMemo(() => {
    // 서버 집계 (outboundDash.yoy3y) 를 OrdersPage 가 기존에 쓰던 모양으로 변환.
    // prev = trend24 마지막에서 두 번째 (직전 달) kw_sum.
    const today = new Date()
    const currYear = today.getFullYear()
    const currMonth = today.getMonth()
    const prevMonthDate = new Date(currYear, currMonth - 1, 1)
    const prevMonthIdx = prevMonthDate.getMonth()
    if (!outboundDash) {
      return {
        year: 0,
        prev: 0,
        currYear,
        prevMonth: prevMonthIdx + 1,
        yoyPct: null as number | null,
        yoy3y: [] as number[],
      }
    }
    const yoy = outboundDash.yoy3y
    const yoy3y: number[] = []
    for (let i = 0; i < yoy.months_this_year; i++) yoy3y.push(yoy.two_years_ago[i] ?? 0)
    for (let i = 0; i < yoy.months_this_year; i++) yoy3y.push(yoy.last_year[i] ?? 0)
    for (let i = 0; i < yoy.months_this_year; i++) yoy3y.push(yoy.current_year[i] ?? 0)
    const year = yoy.current_year.reduce((s, v) => s + v, 0)
    const trend = outboundDash.trend24
    const prev = trend.length >= 2 ? trend[trend.length - 2]!.kw_sum : 0
    return { year, prev, currYear, prevMonth: prevMonthIdx + 1, yoyPct: yoy.yoy_pct, yoy3y }
  }, [outboundDash])
  // 최근 12주(이번 주 포함, 월요일 시작) 출고 capacity. 좌→우 = 과거→현재.
  // 서버 dashboard.weekly12 를 그대로 시각화에 맞게 변환.
  const weeklyOutbound = useMemo(() => {
    const empty = { buckets: [] as number[], weekStarts: [] as Date[], total: 0, max: 0 }
    if (!outboundDash) return empty
    const buckets = outboundDash.weekly12.map((p) => p.kw_sum)
    const weekStarts = outboundDash.weekly12.map((p) => new Date(p.week_start))
    const total = buckets.reduce((s, v) => s + v, 0)
    const max = buckets.length ? Math.max(...buckets) : 0
    return { buckets, weekStarts, total, max }
  }, [outboundDash])
  const invoicePending = saleDash?.totals.invoice_pending_count ?? 0
  const erpOpenCount = erpOpenSaleSummary?.total ?? 0
  const receiptOpenSaleCount = receiptOpenSaleSummary?.total ?? 0
  const selectedSales = useMemo(
    () => sales.filter((sale) => selectedSaleIds.has(sale.sale_id)),
    [sales, selectedSaleIds],
  )
  const selectedReceiptSales = useMemo(
    () => selectedSales.filter((sale) => isSaleSelectableForBulk(sale, "receipt_complete")),
    [selectedSales],
  )
  const selectedReceiptAmount = selectedReceiptSales.reduce(
    (sum, sale) => sum + getSaleOutstandingAmount(sale),
    0,
  )

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    )
  }

  // 수주 상세
  if (selectedOrder) {
    const backToOrders = () => {
      setSelectedOrder(null)
      reloadOrders()
    }
    return (
      <div className="p-6">
        <OrderDetailErrorBoundary key={selectedOrder} onBack={backToOrders}>
          <OrderDetailView orderId={selectedOrder} onBack={backToOrders} />
        </OrderDetailErrorBoundary>
      </div>
    )
  }

  const purposeFromOrder = (order: Order): InventoryAllocation["purpose"] => {
    if (order.management_category === "construction" || order.management_category === "repowering")
      return "construction_own"
    if (order.management_category === "other") return "other"
    return "sale"
  }

  const handleCancelOrderToReservation = async (order: Order) => {
    if ((order.shipped_qty ?? 0) > 0) {
      setOrderActionError(
        "이미 출고된 수주는 예약으로 복귀할 수 없습니다. 출고 취소 흐름을 먼저 진행해주세요.",
      )
      return
    }
    const ok = await confirmDialog({
      description: "수주를 취소하고 같은 수량을 가용재고 예약으로 되돌릴까요?",
      variant: "destructive",
      confirmLabel: "수주 취소",
    })
    if (!ok) return

    setOrderActionError("")
    try {
      const restoredSource = orderSourceHints[order.order_id] ?? order.fulfillment_source
      const linkedAllocs = await fetchWithAuth<InventoryAllocation[]>(
        `/api/v1/inventory/allocations?company_id=${order.company_id}&product_id=${order.product_id}`,
      ).then((list) => list.filter((alloc) => alloc.order_id === order.order_id))

      await fetchWithAuth(`/api/v1/orders/${order.order_id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      })

      if (linkedAllocs.length > 0) {
        await Promise.all(
          linkedAllocs.map((alloc) =>
            fetchWithAuth(`/api/v1/inventory/allocations/${alloc.alloc_id}`, {
              method: "PUT",
              body: JSON.stringify({
                status: "pending",
                source_type: restoredSource === "incoming" ? "incoming" : "stock",
              }),
            }),
          ),
        )
      } else {
        await fetchWithAuth("/api/v1/inventory/allocations", {
          method: "POST",
          body: JSON.stringify({
            company_id: order.company_id,
            product_id: order.product_id,
            quantity: order.remaining_qty ?? order.quantity,
            capacity_kw: order.capacity_kw,
            purpose: purposeFromOrder(order),
            source_type: restoredSource === "incoming" ? "incoming" : "stock",
            customer_name: order.customer_name,
            site_name: order.site_name,
            site_id: order.site_id,
            expected_price_per_wp: order.unit_price_wp,
            free_spare_qty: order.spare_qty ?? 0,
            bl_id: order.bl_id,
            status: "pending",
          }),
        })
      }
      reloadOrders()
    } catch (err) {
      setOrderActionError(err instanceof Error ? err.message : "예약 복귀 처리에 실패했습니다")
    }
  }

  const handleStartReceiptMatch = (receipt: Receipt) => {
    navigate(`/orders?tab=matching&receipt_id=${receipt.receipt_id}`)
  }

  const handleOutboundQueueChange = (value: string) => {
    const next = value === "sale_unregistered" ? "sale_unregistered" : ""
    setObWorkQueueFilter(next)
    if (next) {
      setObStatusFilter("active")
      setObUsageFilter("")
    }
  }

  const openOutboundSaleQueue = () => {
    setSelectedOutbound(null)
    handleOutboundQueueChange("sale_unregistered")
    navigate("/orders?tab=outbound", { replace: true })
  }

  const handleBulkCreateSales = async () => {
    const targets = bulkSaleCreatePlan.ready
    if (targets.length === 0 || bulkSaleCreating || bulkSalePreviewLoading || bulkSalePreviewError) return

    setBulkSaleCreating(true)
    setBulkSaleCreateError("")
    try {
      const results = await createSalesInBatches(targets)
      const successCount = results.filter((result) => result.status === "fulfilled").length
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      )
      const failedCount = failures.length
      const firstFailure = failures[0] ? ` · ${formatError(failures[0].reason)}` : ""

      if (failedCount > 0) {
        const message = `매출 ${successCount}건 생성, ${failedCount}건 실패${firstFailure}`
        setBulkSaleCreateError(message)
        if (successCount === 0) {
          notify.error(message)
          return
        }
        notify.warning(message)
      } else {
        notify.success(`매출 ${successCount}건을 생성했습니다`)
      }

      await Promise.all([reloadOutbounds(), reloadSales()])
      openInvoicePendingQueue()
    } finally {
      setBulkSaleCreating(false)
    }
  }

  const openInvoicePendingQueue = () => {
    autoSelectedSaleQueueKey.current = ""
    setSaleInvoiceFilter("pending")
    setSaleErpClosedFilter("")
    setSaleReceiptFilter("")
    setSelectedSaleIds(new Set())
    setBulkInvoiceDate(todayLocalDate())
    setBulkInvoiceErpClose(false)
    navigate("/orders?tab=sales", { replace: true })
  }

  const openErpOpenQueue = () => {
    autoSelectedSaleQueueKey.current = ""
    setSaleInvoiceFilter("issued")
    setSaleErpClosedFilter("false")
    setSaleReceiptFilter("")
    setSelectedSaleIds(new Set())
    setBulkInvoiceDate(todayLocalDate())
    setBulkInvoiceErpClose(true)
    navigate("/orders?tab=sales", { replace: true })
  }

  const openReceiptOpenQueue = () => {
    autoSelectedSaleQueueKey.current = ""
    setSaleInvoiceFilter("")
    setSaleErpClosedFilter("")
    setSaleReceiptFilter("open")
    setSelectedSaleIds(new Set())
    setBulkReceiptError("")
    navigate("/orders?tab=sales", { replace: true })
  }

  const handleBulkInvoice = async () => {
    if (selectedSaleIds.size === 0) return
    const date = bulkInvoiceDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setBulkInvoiceError("계산서일을 YYYY-MM-DD 형식으로 입력해주세요.")
      return
    }

    const selectedRows = sales.filter((sale) => selectedSaleIds.has(sale.sale_id))
    if (saleBulkActionMode === "erp_close") {
      setBulkInvoiceSaving(true)
      setBulkInvoiceError("")
      try {
        await Promise.all(
          Array.from(selectedSaleIds).map((saleId) =>
            fetchWithAuth(`/api/v1/sales/${saleId}`, {
              method: "PUT",
              body: JSON.stringify({ erp_closed: true, erp_closed_date: date }),
            }),
          ),
        )
        notify.success(`ERP ${selectedSaleIds.size}건을 마감했습니다`)
        setSelectedSaleIds(new Set())
        await reloadSales()
      } catch (err) {
        setBulkInvoiceError(err instanceof Error ? err.message : "ERP 마감 처리에 실패했습니다")
      } finally {
        setBulkInvoiceSaving(false)
      }
      return
    }

    const email = bulkInvoiceEmail.trim()
    const salePayload: Record<string, unknown> = { tax_invoice_date: date }
    if (email) salePayload.tax_invoice_email = email
    if (bulkInvoiceErpClose) {
      salePayload.erp_closed = true
      salePayload.erp_closed_date = date
    }

    setBulkInvoiceSaving(true)
    setBulkInvoiceError("")
    try {
      await Promise.all(
        Array.from(selectedSaleIds).map((saleId) =>
          fetchWithAuth(`/api/v1/sales/${saleId}`, {
            method: "PUT",
            body: JSON.stringify(salePayload),
          }),
        ),
      )
      await Promise.all(
        selectedRows
          .map((sale) => sale.outbound_id)
          .filter((id): id is string => !!id)
          .map((outboundId) =>
            fetchWithAuth(`/api/v1/outbounds/${outboundId}`, {
              method: "PUT",
              body: JSON.stringify({ tax_invoice_issued: true }),
            }),
          ),
      )
      notify.success(`계산서 ${selectedSaleIds.size}건을 처리했습니다`)
      setSelectedSaleIds(new Set())
      setBulkInvoiceErpClose(false)
      await Promise.all([reloadSales(), reloadOutbounds()])
    } catch (err) {
      setBulkInvoiceError(err instanceof Error ? err.message : "계산서 일괄 처리에 실패했습니다")
    } finally {
      setBulkInvoiceSaving(false)
    }
  }

  const completeSaleReceipt = (item: SaleListItem) => {
    const payload: Record<string, unknown> = {
      sale_id: item.sale_id,
      receipt_date: todayLocalDate(),
      memo: "출고/판매 화면 수금완료",
    }
    return fetchWithAuth<CompleteReceiptMatchResponse>("/api/v1/receipt-matches/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  const handleBulkCompleteSaleReceipts = async () => {
    const targets = selectedReceiptSales
    if (targets.length === 0 || bulkReceiptSaving) return

    setBulkReceiptSaving(true)
    setBulkReceiptError("")
    try {
      const results = await Promise.allSettled(targets.map((sale) => completeSaleReceipt(sale)))
      const successCount = results.filter((result) => result.status === "fulfilled").length
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      )
      const failedCount = failures.length
      const firstFailure = failures[0] ? ` · ${formatError(failures[0].reason)}` : ""

      if (failedCount > 0) {
        const message = `수금 ${successCount}건 완료, ${failedCount}건 실패${firstFailure}`
        setBulkReceiptError(message)
        if (successCount === 0) {
          notify.error(message)
          return
        }
        notify.warning(message)
      } else {
        notify.success(`수금 ${successCount}건을 완료 처리했습니다`)
        setSelectedSaleIds(new Set())
      }
      await Promise.all([reloadSales(), reloadReceipts()])
    } finally {
      setBulkReceiptSaving(false)
    }
  }

  const handleCompleteSaleReceipt = async (item: SaleListItem) => {
    const outstanding = getSaleOutstandingAmount(item)
    if (outstanding <= 0) {
      notify.info("이미 수금 완료된 매출입니다")
      return
    }
    setReceiptCompletingSaleId(item.sale_id)
    try {
      await completeSaleReceipt(item)
      notify.success(`수금 ${Math.round(outstanding).toLocaleString("ko-KR")}원을 완료 처리했습니다`)
      await Promise.all([reloadSales(), reloadReceipts()])
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "수금 완료 처리에 실패했습니다")
    } finally {
      setReceiptCompletingSaleId(null)
    }
  }

  const pageTitle =
    activeTab === "outbound"
      ? "출고 / 판매"
      : activeTab === "sales"
        ? "판매 · 세금계산서"
        : activeTab === "receipts"
          ? "수금 관리"
          : activeTab === "matching"
            ? "수금 매칭"
            : "수주 관리"
  const pageSub =
    activeTab === "outbound"
      ? `${outboundsTotalCount}건 · ${fmtSalesMw(outboundKw)} MW`
      : activeTab === "sales"
        ? `${salesTotalCount}건 · ${fmtEok(saleTotal)}억`
        : activeTab === "receipts"
          ? `${openReceiptCount}건 · 미정산 ${fmtEok(receiptRemaining)}억`
          : activeTab === "matching"
            ? "입금과 매출채권 자동 추천"
            : `${ordersTotalCount}건 · ${fmtSalesMw(ordersKw)} MW`
  // KPI sparkline 시계열 — outbound 는 서버 trend24 마지막 6 개월. order/receipt/sale 는 client-side(미마이그).
  const outboundCountSpark = (outboundDash?.trend24 ?? []).slice(-6).map((p) => p.count)
  const outboundKwSpark = (outboundDash?.trend24 ?? []).slice(-6).map((p) => p.kw_sum)
  const saleTotalSpark = (saleDash?.trend24 ?? []).slice(-6).map((p) => p.sale_amount_sum)
  const saleInvoicePendingSpark = (saleDash?.trend24 ?? []).slice(-6).map((p) => p.pending_count)
  const receiptTotalSpark = (receiptDash?.trend24 ?? []).slice(-6).map((p) => p.amount_sum)
  const receiptRemainingSpark = (receiptDash?.trend24 ?? []).slice(-6).map((p) => p.remaining_sum)
  const receiptPartialSpark = (receiptDash?.trend24 ?? []).slice(-6).map((p) => p.partial_count)
  const receiptCountSpark = (receiptDash?.trend24 ?? []).slice(-6).map((p) => p.count)
  const receiptRecoverySpark = (receiptDash?.trend24 ?? []).slice(-6).map((p) => p.recovery_rate)
  const activeOrderSpark = (orderDash?.trend24 ?? []).slice(-6).map((p) => p.active_count)

  // 계산서 연결률 — D-064: 매출 대상(sale/sale_spare) 출고 중 sale 연결 비율.
  // 서버 sale_conversion 에서 직접 수신.
  const saleConvServer = outboundDash?.sale_conversion
  const saleEligibleCount = saleConvServer?.eligible_count ?? 0
  const saleLinkedCount = saleConvServer?.linked_count ?? 0
  const saleUnregisteredCount = Math.max(0, saleEligibleCount - saleLinkedCount)
  const saleConversionDenom = saleEligibleCount || (outboundDash?.totals.count ?? 0)
  const saleConversionRate =
    saleConversionDenom > 0 ? Math.round((saleLinkedCount / saleConversionDenom) * 1000) / 10 : 0
  const saleConversionSpark = (saleConvServer?.monthly ?? [])
    .slice(-6)
    .map((p) => (p.eligible_count > 0 ? Math.round((p.linked_count / p.eligible_count) * 100) : 0))
  const saleConversionTone: SalesMetric["tone"] =
    saleConversionRate >= 90 ? "pos" : saleConversionRate >= 60 ? "info" : "warn"

  // NumberTween 용 formatter 헬퍼 — 정수 카운트 / 1자리 소수 / 억원 표시.
  const fmtCount = (n: number) => String(Math.round(n))
  const fmtFixed1 = (n: number) => n.toFixed(1)
  const ordersKwRecent = recent30AvgUnitPriceWp?.avg ?? 0
  const partialCountRaw = orderDash?.totals.partial_count ?? 0
  const metrics: SalesMetric[] =
    activeTab === "outbound"
      ? [
          {
            lbl: "출고 전체",
            v: String(outboundsTotalCount),
            numericValue: outboundsTotalCount,
            formatter: fmtCount,
            u: "건",
            sub: `${fmtSalesMw(outboundKw)} MW`,
            tone: "solar",
            spark: outboundCountSpark,
            metricId: "outbound.count",
          },
          {
            lbl: "계산서 연결률",
            v: saleConversionRate.toFixed(1),
            numericValue: saleConversionRate,
            formatter: fmtFixed1,
            u: "%",
            sub: `${saleLinkedCount.toLocaleString()} / ${saleConversionDenom.toLocaleString()}건 매출대상`,
            tone: saleConversionTone,
            spark: saleConversionSpark,
            metricId: "outbound.sale_conversion",
          },
          {
            lbl: "전월 출고 용량",
            v: fmtSalesMw(monthlyOutboundKw.prev),
            numericValue: monthlyOutboundKw.prev,
            formatter: fmtSalesMw,
            u: "MW",
            sub: `${monthlyOutboundKw.prevMonth}월 · 최근 6개월`,
            tone: "ink",
            spark: outboundKwSpark,
            metricId: "outbound.kw_prev_month",
          },
          {
            lbl: "금년 출고 용량",
            v: fmtSalesMw(monthlyOutboundKw.year),
            numericValue: monthlyOutboundKw.year,
            formatter: fmtSalesMw,
            u: "MW",
            sub:
              monthlyOutboundKw.yoyPct != null
                ? `${monthlyOutboundKw.currYear}년 누계 · 전년比 ${monthlyOutboundKw.yoyPct >= 0 ? "+" : ""}${monthlyOutboundKw.yoyPct.toFixed(1)}%`
                : `${monthlyOutboundKw.currYear}년 누계`,
            tone: "pos",
            spark: monthlyOutboundKw.yoy3y,
            metricId: "outbound.kw_year",
          },
        ]
      : activeTab === "sales"
        ? [
            {
              lbl: "매출 합계",
              v: fmtEok(saleTotal),
              numericValue: saleTotal,
              formatter: fmtEok,
              u: "억",
              sub: `${salesTotalCount}건`,
              tone: "solar",
              spark: saleTotalSpark,
              metricId: "sales.total",
            },
            {
              lbl: "계산서 미발행",
              v: String(invoicePending),
              numericValue: invoicePending,
              formatter: fmtCount,
              u: "건",
              sub: "발행 대기",
              tone: invoicePending > 0 ? "warn" : "pos",
              spark: saleInvoicePendingSpark,
              metricId: "sales.invoice_pending",
            },
            {
              lbl: "거래처",
              v: String(saleCustomersCount),
              numericValue: saleCustomersCount,
              formatter: fmtCount,
              u: "곳",
              sub: "매출처 기준",
              tone: "info",
              metricId: "sales.customers",
            },
            {
              lbl: "평균 단가",
              v: saleAvgUnitPriceWp.toFixed(1),
              numericValue: saleAvgUnitPriceWp,
              formatter: fmtFixed1,
              u: "원/Wp",
              sub: "필터 기준",
              tone: "ink",
              metricId: "sales.unit_price_wp",
            },
          ]
        : activeTab === "receipts"
          ? [
              {
                lbl: "입금 합계",
                v: fmtEok(receiptTotal),
                numericValue: receiptTotal,
                formatter: fmtEok,
                u: "억",
                sub: `${receiptCount}건`,
                tone: "solar",
                spark: receiptTotalSpark,
                metricId: "receipts.total",
              },
              {
                lbl: "미정산",
                v: fmtEok(receiptRemaining),
                numericValue: receiptRemaining,
                formatter: fmtEok,
                u: "억",
                sub: "매칭 필요",
                tone: receiptRemaining > 0 ? "warn" : "pos",
                spark: receiptRemainingSpark,
                metricId: "receipts.remaining",
              },
              {
                lbl: "부분 매칭",
                v: String(receiptPartialMatchCount),
                numericValue: receiptPartialMatchCount,
                formatter: fmtCount,
                u: "건",
                sub: "추가 확인",
                tone: "info",
                spark: receiptPartialSpark,
                metricId: "receipts.partial_match",
              },
              {
                lbl: "회수율",
                v: receiptRecoveryRate.toFixed(1),
                numericValue: receiptRecoveryRate,
                formatter: fmtFixed1,
                u: "%",
                sub: "입금 매칭 기준",
                tone: "pos",
                spark: receiptRecoverySpark,
                metricId: "receipts.recovery_rate",
              },
            ]
          : activeTab === "matching"
            ? [
                // matching 탭의 KPI 는 receipts/sales 탭과 차원만 다른(count vs amount) 사실상 동일 데이터.
                // 드릴다운은 같은 집합의 종합 분해라 metricId 를 receipts.*/sales.* 에 재사용한다.
                // '거래처' 는 partner master 카운트라 의미 있는 분해가 없어 metricId 미부여 (정적 타일 유지).
                {
                  lbl: "입금",
                  v: String(receiptCount),
                  numericValue: receiptCount,
                  formatter: fmtCount,
                  u: "건",
                  sub: "매칭 후보",
                  tone: "solar",
                  spark: receiptCountSpark,
                  metricId: "receipts.total",
                },
                {
                  lbl: "미정산",
                  v: fmtEok(receiptRemaining),
                  numericValue: receiptRemaining,
                  formatter: fmtEok,
                  u: "억",
                  sub: "대상 금액",
                  tone: "warn",
                  spark: receiptRemainingSpark,
                  metricId: "receipts.remaining",
                },
                {
                  lbl: "매출",
                  v: String(salesTotalCount),
                  numericValue: salesTotalCount,
                  formatter: fmtCount,
                  u: "건",
                  sub: "후보 원장",
                  tone: "info",
                  spark: (saleDash?.trend24 ?? []).slice(-6).map((p) => p.count),
                  metricId: "sales.total",
                },
                {
                  lbl: "거래처",
                  v: String(partners.length),
                  numericValue: partners.length,
                  formatter: fmtCount,
                  u: "곳",
                  sub: "고객 마스터",
                  tone: "ink",
                },
              ]
            : [
                {
                  lbl: "진행 수주",
                  v: String(activeOrdersCount),
                  numericValue: activeOrdersCount,
                  formatter: fmtCount,
                  u: "건",
                  sub: `${fmtSalesMw(ordersKw)} MW · 전체 ${ordersTotalCount}건`,
                  tone: "solar",
                  spark: activeOrderSpark,
                  metricId: "orders.active",
                },
                {
                  lbl: "거래처",
                  v: String(customersCount),
                  numericValue: customersCount,
                  formatter: fmtCount,
                  u: "곳",
                  sub: "활성 고객",
                  tone: "info",
                  metricId: "orders.customers",
                },
                {
                  lbl: "분할출고",
                  v: String(partialCountRaw),
                  numericValue: partialCountRaw,
                  formatter: fmtCount,
                  u: "건",
                  sub: "잔량 관리",
                  tone: "warn",
                  spark: (orderDash?.trend24 ?? []).slice(-6).map((p) => p.partial_count),
                  metricId: "orders.partial",
                },
                {
                  lbl: "평균 단가",
                  v: recent30AvgUnitPriceWp ? recent30AvgUnitPriceWp.avg.toFixed(1) : "0.0",
                  numericValue: ordersKwRecent,
                  formatter: fmtFixed1,
                  u: "원/Wp",
                  sub: recent30AvgUnitPriceWp
                    ? `최근 30일 · ${recent30AvgUnitPriceWp.count}건`
                    : "최근 30일",
                  tone: "pos",
                  spark: unitPriceWpMa15Spark,
                  metricId: "orders.unit_price_wp",
                },
              ]

  const workQueueRail = (
    <RailBlock title="처리 대기" count={`${saleUnregisteredCount + invoicePending + erpOpenCount + receiptOpenSaleCount}건`}>
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={openOutboundSaleQueue}
          className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11.5px] transition hover:border-[var(--ink-3)]"
        >
          <span className="text-[var(--ink-2)]">매출 미등록</span>
          <span className="mono font-semibold text-[var(--warn)]">{saleUnregisteredCount}</span>
        </button>
        <button
          type="button"
          onClick={openInvoicePendingQueue}
          className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11.5px] transition hover:border-[var(--ink-3)]"
        >
          <span className="text-[var(--ink-2)]">계산서 미발행</span>
          <span className="mono font-semibold text-[var(--warn)]">{invoicePending}</span>
        </button>
        <button
          type="button"
          onClick={openErpOpenQueue}
          className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11.5px] transition hover:border-[var(--ink-3)]"
        >
          <span className="text-[var(--ink-2)]">ERP 미마감</span>
          <span className="mono font-semibold text-[var(--warn)]">{erpOpenCount}</span>
        </button>
        <button
          type="button"
          onClick={openReceiptOpenQueue}
          className="flex w-full items-center justify-between rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11.5px] transition hover:border-[var(--ink-3)]"
        >
          <span className="text-[var(--ink-2)]">수금 미완료</span>
          <span className="mono font-semibold text-[var(--warn)]">{receiptOpenSaleCount}</span>
        </button>
      </div>
    </RailBlock>
  )

  const ordersCardControls = (
    <div
      className="sf-card-controls"
      style={{ flex: 1, minWidth: 0, justifyContent: "flex-start" }}
    >
      {activeTab === "orders" && (
        <>
          <FilterButton
            items={[
              {
                kind: "date_range",
                label: "기간",
                value: orderDateRange,
                onChange: setOrderDateRange,
              },
              {
                kind: "kw_range",
                label: "용량",
                value: orderKwRange,
                onChange: setOrderKwRange,
              },
              {
                label: "상태",
                value: orderStatusFilter,
                onChange: setOrderStatusFilter,
                options: (Object.entries(ORDER_STATUS_LABEL) as [OrderStatus, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
              {
                label: "거래처",
                value: orderCustomerFilter,
                onChange: setOrderCustomerFilter,
                options: partners.map((p) => ({ value: p.partner_id, label: p.partner_name })),
              },
              {
                label: "구분",
                value: orderCategoryFilter,
                onChange: setOrderCategoryFilter,
                options: (
                  Object.entries(MANAGEMENT_CATEGORY_LABEL) as [ManagementCategory, string][]
                ).map(([k, v]) => ({ value: k, label: v })),
              },
              {
                label: "업무",
                value: orderWorkQueue,
                onChange: handleOrderWorkQueueChange,
                options: [
                  { value: "delivery_soon", label: "납기 7일" },
                  { value: "no_site", label: "현장 미등록" },
                ],
              },
            ]}
          />
          <ColumnVisibilityMenu
            tableId={ORDER_TABLE_ID}
            columns={ORDER_COLUMN_META}
            hidden={orderColVis.hidden}
            setHidden={orderColVis.setHidden}
            pinning={orderColPin.pinning}
            pinLeft={orderColPin.pinLeft}
            pinRight={orderColPin.pinRight}
            unpin={orderColPin.unpin}
          />
          <ExcelToolbar type="order" />
        </>
      )}
      {activeTab === "outbound" && !selectedOutbound && (
        <>
          <FilterButton
            items={[
              {
                kind: "date_range",
                label: "기간",
                value: obDateRange,
                onChange: setObDateRange,
              },
              {
                kind: "kw_range",
                label: "용량",
                value: obKwRange,
                onChange: setObKwRange,
              },
              {
                label: "상태",
                value: obStatusFilter,
                onChange: setObStatusFilter,
                options: (Object.entries(OUTBOUND_STATUS_LABEL) as [OutboundStatus, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
              {
                label: "업무",
                value: obWorkQueueFilter,
                onChange: handleOutboundQueueChange,
                options: [{ value: "sale_unregistered", label: "매출 미등록" }],
              },
              {
                label: "용도",
                value: obUsageFilter,
                onChange: setObUsageFilter,
                options: (Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
              {
                label: "제조사",
                value: obMfgFilter,
                onChange: setObMfgFilter,
                options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
              },
            ]}
          />
          <ColumnVisibilityMenu
            tableId={OUTBOUND_TABLE_ID}
            columns={OUTBOUND_COLUMN_META}
            hidden={outboundColVis.hidden}
            setHidden={outboundColVis.setHidden}
            pinning={outboundColPin.pinning}
            pinLeft={outboundColPin.pinLeft}
            pinRight={outboundColPin.pinRight}
            unpin={outboundColPin.unpin}
          />
          <ExcelToolbar type="outbound" />
        </>
      )}
      {activeTab === "sales" && (
        <>
          <div className="w-36">
            <PartnerCombobox
              partners={partners}
              value={saleCustomerFilter}
              onChange={setSaleCustomerFilter}
              placeholder="전체 거래처"
              includeAllOption
              allLabel="전체 거래처"
            />
          </div>
          <FilterButton
            items={[
              {
                kind: "date_range",
                label: "기간",
                value: saleDateRange,
                onChange: setSaleDateRange,
              },
              {
                label: "계산서",
                value: saleInvoiceFilter,
                onChange: (value) => {
                  setSaleInvoiceFilter(value)
                  if (value) setSaleReceiptFilter("")
                },
                options: [
                  { value: "issued", label: "발행" },
                  { value: "pending", label: "미발행" },
                ],
              },
              {
                label: "ERP",
                value: saleErpClosedFilter,
                onChange: (value) => {
                  setSaleErpClosedFilter(value as SaleErpClosedFilter)
                  if (value) setSaleReceiptFilter("")
                },
                options: [
                  { value: "false", label: "미마감" },
                  { value: "true", label: "마감" },
                ],
              },
              {
                label: "수금",
                value: saleReceiptFilter,
                onChange: (value) => {
                  setSaleReceiptFilter(value as SaleReceiptFilter)
                  if (value) {
                    setSaleInvoiceFilter("")
                    setSaleErpClosedFilter("")
                  }
                },
                options: [
                  { value: "open", label: "미완료" },
                  { value: "unpaid", label: "미수" },
                  { value: "partial", label: "부분" },
                  { value: "paid", label: "완료" },
                ],
              },
            ]}
          />
          <ColumnVisibilityMenu
            tableId={SALE_TABLE_ID}
            columns={SALE_COLUMN_META}
            hidden={saleColVis.hidden}
            setHidden={saleColVis.setHidden}
            pinning={saleColPin.pinning}
            pinLeft={saleColPin.pinLeft}
            pinRight={saleColPin.pinRight}
            unpin={saleColPin.unpin}
          />
          <ExcelToolbar type="sale" />
        </>
      )}
      {activeTab === "receipts" && (
        <>
          <FilterButton
            items={[
              {
                label: "거래처",
                value: receiptCustomerFilter,
                onChange: setReceiptCustomerFilter,
                options: partners.map((p) => ({ value: p.partner_id, label: p.partner_name })),
              },
              {
                kind: "date_range",
                label: "기간",
                value: receiptDateRange,
                onChange: setReceiptDateRange,
              },
              {
                label: "매칭",
                value: receiptMatchFilter,
                onChange: (value) => setReceiptMatchFilter(value === "" ? "open" : (value as ReceiptMatchFilter)),
                options: [
                  { value: "open", label: "미수 전체" },
                  { value: "unmatched", label: "미매칭" },
                  { value: "partial", label: "부분 매칭" },
                ],
              },
            ]}
          />
          <ColumnVisibilityMenu
            tableId={RECEIPT_TABLE_ID}
            columns={RECEIPT_COLUMN_META}
            hidden={receiptColVis.hidden}
            setHidden={receiptColVis.setHidden}
            pinning={receiptColPin.pinning}
            pinLeft={receiptColPin.pinLeft}
            pinRight={receiptColPin.pinRight}
            unpin={receiptColPin.unpin}
          />
          <ExcelToolbar type="receipt" />
        </>
      )}
      <div style={{ flex: 1 }} />
      <FilterChips options={SALES_TAB_OPTIONS} value={activeTab} onChange={handleTabChange} />
    </div>
  )

  return (
    <div className="sf-page sf-sales-page">
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
          <KpiStrip metrics={metrics} scopeId={`orders.${activeTab}`}>
            {(metric) => (
              <TileB
                key={metric.lbl}
                lbl={metric.lbl}
                v={metric.v}
                numericValue={metric.numericValue}
                formatter={metric.formatter}
                u={metric.u}
                sub={metric.sub}
                tone={metric.tone}
                delta={metric.delta}
                spark={metric.spark ?? flatSparkFromValue(metric.v)}
                metricId={metric.metricId}
              />
            )}
          </KpiStrip>

          <CommandTopLine title={pageTitle} sub={pageSub} right={ordersCardControls} />

          <CardB title={pageTitle} sub={pageSub} right={ordersCardControls} headerless>
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                {/* 탭 1: 수주 관리 */}
                <TabsContent value="orders" className="space-y-4 mt-4">
                  {ordersLoading && orders.length === 0 ? (
                    <SkeletonRows rows={8} />
                  ) : (
                    <OrderListTable
                      items={visibleOrders}
                      hidden={orderColVis.hidden}
                      pinning={orderColPin.pinning}
                      onPinningChange={orderColPin.setPinning}
                      onSelect={(o) => setSelectedOrder(o.order_id)}
                      onCancelToReservation={handleCancelOrderToReservation}
                      sourceOverrides={orderSourceHints}
                      riskByOrder={orderRiskByOrder}
                      serverMode={{
                        pageIndex: orderPageIndex,
                        pageSize: orderPageSize,
                        totalRowCount: ordersTotal,
                        sorting: orderSort.sorting,
                        onSortingChange: orderSort.onSortingChange,
                        onPageChange: ({ pageIndex: nextIdx, pageSize: nextSize }) => {
                          setOrderPageIndex(nextIdx)
                          setOrderPageSize(nextSize)
                        },
                      }}
                    />
                  )}
                  {orderActionError && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {orderActionError}
                    </div>
                  )}
                </TabsContent>

                {/* 탭 2: 출고 관리 */}
                <TabsContent value="outbound" className="space-y-4 mt-4">
                  {selectedOutbound ? (
                    <OutboundDetailView
                      outboundId={selectedOutbound}
                      onBack={() => {
                        setSelectedOutbound(null)
                        reloadOutbounds()
                        reloadSales()
                      }}
                    />
                  ) : (
                    <>
                      {showBulkSaleCreatePanel && (
                        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
                          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto] lg:items-center">
                            <div>
                              <div className="text-sm font-semibold text-[var(--ink)]">매출 자동 생성 미리보기</div>
                              <div className="mt-1 text-xs text-[var(--ink-2)]">
                                {bulkSalePreviewLoading
                                  ? `조건 전체 대상 확인 중 · ${outboundsTotal}건`
                                  : `조건 전체 생성 예정 ${bulkSaleCreatePlan.ready.length}건 · 제외 ${bulkSaleCreatePlan.blocked.length}건 · 처리 후 계산서 미발행으로 이동`}
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-3 text-right text-xs">
                              <div>
                                <div className="text-[var(--ink-3)]">수량</div>
                                <div className="mono font-semibold">
                                  {bulkSalePreviewLoading ? "—" : formatNumber(bulkSaleCreatePlan.quantity)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[var(--ink-3)]">용량</div>
                                <div className="mono font-semibold">
                                  {bulkSalePreviewLoading ? "—" : formatKw(bulkSaleCreatePlan.capacityKw)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[var(--ink-3)]">공급가</div>
                                <div className="mono font-semibold">
                                  {bulkSalePreviewLoading ? "—" : formatNumber(bulkSaleCreatePlan.supplyAmount)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[var(--ink-3)]">합계</div>
                                <div className="mono font-semibold">
                                  {bulkSalePreviewLoading ? "—" : formatNumber(bulkSaleCreatePlan.totalAmount)}
                                </div>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={
                                bulkSalePreviewLoading ||
                                !!bulkSalePreviewError ||
                                bulkSaleCreating ||
                                bulkSaleCreatePlan.ready.length === 0
                              }
                              onClick={handleBulkCreateSales}
                            >
                              {bulkSaleCreating || bulkSalePreviewLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {bulkSalePreviewLoading ? "대상 확인 중" : `매출 ${bulkSaleCreatePlan.ready.length}건 생성`}
                            </Button>
                          </div>
                          {!bulkSalePreviewLoading && bulkSaleCreatePlan.reasonCounts.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {bulkSaleCreatePlan.reasonCounts.map((item) => (
                                <span key={item.reason} className="sf-pill warn">
                                  {item.reason} {item.count}
                                </span>
                              ))}
                            </div>
                          )}
                          {bulkSalePreviewError && (
                            <div className="mt-2 text-xs text-destructive">{bulkSalePreviewError}</div>
                          )}
                          {bulkSaleCreateError && (
                            <div className="mt-2 text-xs text-destructive">{bulkSaleCreateError}</div>
                          )}
                        </div>
                      )}
                      {obLoading && outbounds.length === 0 ? (
                        <SkeletonRows rows={8} />
                      ) : (
                        <OutboundListTable
                          items={outbounds}
                          hidden={outboundColVis.hidden}
                          pinning={outboundColPin.pinning}
                          onPinningChange={outboundColPin.setPinning}
                          onSelect={(ob) => setSelectedOutbound(ob.outbound_id)}
                          automationStatus={showBulkSaleCreatePanel ? getOutboundAutomationStatus : undefined}
                          serverMode={{
                            pageIndex: obPageIndex,
                            pageSize: obPageSize,
                            totalRowCount: outboundsTotal,
                            sorting: obSort.sorting,
                            onSortingChange: obSort.onSortingChange,
                            onPageChange: ({ pageIndex: nextIdx, pageSize: nextSize }) => {
                              setObPageIndex(nextIdx)
                              setObPageSize(nextSize)
                            },
                          }}
                        />
                      )}
                    </>
                  )}
                </TabsContent>

                {/* 탭 3: 판매 관리 */}
                <TabsContent value="sales" className="space-y-4 mt-4">
                  {saleLoading && sales.length === 0 ? (
                    <SkeletonRows rows={8} />
                  ) : (
                    <>
                      <SaleSummaryCards
                        items={sales}
                        summary={
                          saleDash
                            ? {
                                totalSupply: saleDash.totals.supply_amount_sum,
                                totalVat: saleDash.totals.vat_amount_sum,
                                totalAmount: saleDash.totals.sale_amount_sum,
                                count: saleDash.totals.count,
                                issuedCount: saleDash.totals.invoice_issued_count,
                              }
                            : undefined
                        }
                      />
                      {selectedSaleIds.size > 0 && saleBulkActionMode === "receipt_complete" && (
                        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
                          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto] lg:items-center">
                            <div>
                              <div className="text-sm font-semibold text-[var(--ink)]">선택 수금완료</div>
                              <div className="mt-1 text-xs text-[var(--ink-2)]">
                                오늘 날짜로 수금 전표와 매칭을 자동 생성
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-right text-xs">
                              <div>
                                <div className="text-[var(--ink-3)]">대상</div>
                                <div className="mono font-semibold">{selectedReceiptSales.length}건</div>
                              </div>
                              <div>
                                <div className="text-[var(--ink-3)]">미수 합계</div>
                                <div className="mono font-semibold">{formatNumber(selectedReceiptAmount)}</div>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={bulkReceiptSaving || selectedReceiptSales.length === 0}
                              onClick={handleBulkCompleteSaleReceipts}
                            >
                              {bulkReceiptSaving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {`수금 ${selectedReceiptSales.length}건 완료`}
                            </Button>
                          </div>
                          {bulkReceiptError && (
                            <div className="mt-2 text-xs text-destructive">{bulkReceiptError}</div>
                          )}
                        </div>
                      )}
                      {selectedSaleIds.size > 0 && saleBulkActionMode !== "receipt_complete" && (
                        <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
                          <div
                            className={
                              saleBulkActionMode === "erp_close"
                                ? "grid gap-3 lg:grid-cols-[160px_auto] lg:items-end"
                                : "grid gap-3 lg:grid-cols-[160px_minmax(180px,1fr)_160px_auto] lg:items-end"
                            }
                          >
                            <div>
                              <Label className="mb-1.5 text-xs">
                                {saleBulkActionMode === "erp_close" ? "ERP 마감일" : "계산서일"}
                              </Label>
                              <DateInput value={bulkInvoiceDate} onChange={setBulkInvoiceDate} />
                            </div>
                            {saleBulkActionMode === "invoice" && (
                              <>
                                <div>
                                  <Label className="mb-1.5 text-xs">계산서 이메일</Label>
                                  <Input
                                    value={bulkInvoiceEmail}
                                    onChange={(event) => setBulkInvoiceEmail(event.target.value)}
                                    placeholder="선택 입력"
                                  />
                                </div>
                                <label className="flex h-8 items-center gap-2 text-xs text-[var(--ink-2)]">
                                  <input
                                    type="checkbox"
                                    checked={bulkInvoiceErpClose}
                                    onChange={(event) => setBulkInvoiceErpClose(event.target.checked)}
                                    className="size-3.5"
                                  />
                                  ERP까지 마감
                                </label>
                              </>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={bulkInvoiceSaving}
                              onClick={handleBulkInvoice}
                            >
                              {bulkInvoiceSaving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {saleBulkActionMode === "erp_close"
                                ? `ERP ${selectedSaleIds.size}건 마감`
                                : `선택 ${selectedSaleIds.size}건 처리`}
                            </Button>
                          </div>
                          {bulkInvoiceError && (
                            <div className="mt-2 text-xs text-destructive">{bulkInvoiceError}</div>
                          )}
                        </div>
                      )}
                      <SaleListTable
                        items={sales}
                        hidden={saleColVis.hidden}
                        pinning={saleColPin.pinning}
                        onPinningChange={saleColPin.setPinning}
                        selectedIds={selectedSaleIds}
                        onSelectedIdsChange={setSelectedSaleIds}
                        isRowSelectable={(item) => isSaleSelectableForBulk(item, saleBulkActionMode)}
                        onInvoice={(item) => {
                          setSaleReceiptFilter("")
                          setSelectedSaleIds(new Set([item.sale_id]))
                          setBulkInvoiceDate(item.sale.tax_invoice_date ?? todayLocalDate())
                          setBulkInvoiceEmail(item.sale.tax_invoice_email ?? "")
                          setBulkInvoiceErpClose(saleBulkActionMode === "erp_close" || !!item.sale.erp_closed)
                          setBulkInvoiceError("")
                          setBulkReceiptError("")
                        }}
                        onCompleteReceipt={handleCompleteSaleReceipt}
                        completingReceiptSaleId={receiptCompletingSaleId}
                        serverMode={{
                          pageIndex: salePageIndex,
                          pageSize: salePageSize,
                          totalRowCount: salesTotal,
                          sorting: saleSort.sorting,
                          onSortingChange: saleSort.onSortingChange,
                          onPageChange: ({ pageIndex: nextIdx, pageSize: nextSize }) => {
                            setSalePageIndex(nextIdx)
                            setSalePageSize(nextSize)
                            setSelectedSaleIds(new Set())
                          },
                        }}
                      />
                    </>
                  )}
                </TabsContent>

                {/* 탭 4: 수금 관리 */}
                <TabsContent value="receipts" className="space-y-4 mt-4">
                  {receiptsLoading ? (
                    <SkeletonRows rows={8} />
                  ) : (
                    <ReceiptListTable
                      items={visibleReceipts}
                      hidden={receiptColVis.hidden}
                      pinning={receiptColPin.pinning}
                      onPinningChange={receiptColPin.setPinning}
                      onStartMatch={handleStartReceiptMatch}
                    />
                  )}
                </TabsContent>

                {/* 탭 3: 수금 매칭 */}
                <TabsContent value="matching" className="mt-4 space-y-4">
                  <AutoMatchSection />
                  <ReceiptMatchingPanel />
                </TabsContent>
              </Tabs>
            </div>
          </CardB>
        </section>

        <aside className="sf-procurement-rail card">
          {activeTab === "orders" && (
            <>
              <RailBlock title="수주 상태" count={`${activeOrdersCount} active`}>
                <BreakdownRows
                  items={(["received", "partial", "completed", "cancelled"] as OrderStatus[]).map(
                    (status) => ({
                      key: status,
                      label: ORDER_STATUS_LABEL[status],
                      count:
                        status === "received"
                          ? (orderDash?.totals.received_count ?? 0)
                          : status === "partial"
                            ? (orderDash?.totals.partial_count ?? 0)
                            : status === "completed"
                              ? (orderDash?.totals.completed_count ?? 0)
                              : (orderDash?.totals.cancelled_count ?? 0),
                    }),
                  )}
                />
              </RailBlock>
              <RailBlock title="거래처 TOP" count="kW">
                {(orderDash?.by_customer_top10 ?? [])
                  .map((row) => [row.label, row.kw_sum] as const)
                  .slice(0, 5)
                  .map(([customer, kw], index) => (
                    <div
                      key={customer}
                      className={`py-2 ${index ? "border-t border-[var(--line)]" : ""}`}
                    >
                      <div className="flex justify-between text-[11.5px]">
                        <span className="truncate text-[var(--ink-2)]">{customer}</span>
                        <span className="mono font-semibold text-[var(--ink)]">
                          {Math.round(kw).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                        <div
                          className="h-full bg-[var(--solar-2)]"
                          style={{
                            width: `${ordersKw ? Math.min(100, (kw / ordersKw) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </RailBlock>
              <RailBlock title="단가 흐름" last>
                <Sparkline
                  data={[395, 398, 400, 402, 403, 405, 406, 407, 408, 409]}
                  w={220}
                  h={42}
                  color="var(--solar-2)"
                  area
                />
                <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                  <span>
                    평균{" "}
                    <span className="font-bold text-[var(--ink)]">
                      {(orderDash?.totals.avg_unit_price_wp ?? 0).toFixed(1)}
                    </span>{" "}
                    원/Wp
                  </span>
                  <span className="font-bold text-[var(--pos)]">+1.2%</span>
                </div>
              </RailBlock>
            </>
          )}

          {activeTab === "outbound" && (
            <>
              {workQueueRail}
              <RailBlock title="출고 상태" count={`${outboundsTotalCount} rows`}>
                <BreakdownRows
                  items={(["active", "cancel_pending", "cancelled"] as OutboundStatus[]).map(
                    (status) => ({
                      key: status,
                      label: OUTBOUND_STATUS_LABEL[status],
                      count:
                        status === "active"
                          ? (outboundDash?.totals.active_count ?? 0)
                          : status === "cancel_pending"
                            ? (outboundDash?.totals.cancel_pending_count ?? 0)
                            : (outboundDash?.totals.cancelled_count ?? 0),
                    }),
                  )}
                />
              </RailBlock>
              <RailBlock title="출고 용도" count="건">
                <BreakdownRows
                  items={(outboundDash?.by_usage ?? []).slice(0, 5).map((row) => ({
                    key: row.key,
                    label: row.label,
                    count: row.count,
                  }))}
                />
              </RailBlock>
              <RailBlock title="주간 출고" last>
                <div className="sf-mini-bars">
                  {weeklyOutbound.buckets.map((value, index) => {
                    const start = weeklyOutbound.weekStarts[index]
                    const end = new Date(start)
                    end.setDate(start.getDate() + 6)
                    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
                    return (
                      <span
                        key={index}
                        title={`${fmt(start)} ~ ${fmt(end)} · ${fmtSalesMw(value)} MW`}
                        style={{
                          height: `${weeklyOutbound.max > 0 ? (value / weeklyOutbound.max) * 100 : 0}%`,
                        }}
                      />
                    )
                  })}
                </div>
                <div className="mono mt-2 text-center text-[10.5px] text-[var(--ink-3)]">
                  합계 {fmtSalesMw(weeklyOutbound.total)} MW · 최근 12주
                </div>
              </RailBlock>
            </>
          )}

          {(activeTab === "sales" || activeTab === "receipts" || activeTab === "matching") && (
            <>
              {workQueueRail}
              <RailBlock title="채권 요약" count={`${receiptCount} receipts`}>
                <div className="bignum text-[26px] text-[var(--solar-3)]">
                  {fmtEok(receiptRemaining)}{" "}
                  <span className="mono text-xs text-[var(--ink-3)]">억</span>
                </div>
                <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                  미정산 · 입금 합계 {fmtEok(receiptTotal)}억
                </div>
              </RailBlock>
              <RailBlock title="계산서 상태">
                <div className="space-y-2 text-[11.5px] text-[var(--ink-2)]">
                  <div className="flex justify-between">
                    <span>발행 완료</span>
                    <span className="mono">{saleDash?.totals.invoice_issued_count ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>미발행</span>
                    <span className="mono text-[var(--warn)]">{invoicePending}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>매출 합계</span>
                    <span className="mono">{fmtEok(saleTotal)}억</span>
                  </div>
                </div>
              </RailBlock>
              <RailBlock title="회수율" last>
                <Sparkline
                  data={[
                    78,
                    80,
                    81,
                    82,
                    84,
                    86,
                    88,
                    receiptTotal > 0 ? ((receiptTotal - receiptRemaining) / receiptTotal) * 100 : 0,
                  ]}
                  w={220}
                  h={42}
                  color="var(--solar-2)"
                  area
                />
                <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                  <span>
                    현재{" "}
                    <span className="font-bold text-[var(--ink)]">
                      {receiptTotal > 0
                        ? (((receiptTotal - receiptRemaining) / receiptTotal) * 100).toFixed(1)
                        : "0.0"}
                    </span>
                    %
                  </span>
                  <span className="font-bold text-[var(--pos)]">matching</span>
                </div>
              </RailBlock>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
