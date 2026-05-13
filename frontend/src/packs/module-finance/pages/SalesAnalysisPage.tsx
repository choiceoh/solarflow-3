import { useCallback, useEffect, useMemo, useState } from "react"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { DateInput } from "@/components/ui/date-input"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import { PartnerCombobox } from "@/components/common/PartnerCombobox"
import { useAppStore } from "@/stores/appStore"
import { companyQueryUrl, fetchCalc } from "@/lib/companyUtils"
import { fetchAllPaginated, fetchWithAuth } from "@/lib/api"
import { formatKRW, formatNumber, moduleLabel } from "@/lib/utils"
import { isExternalSale } from "@/lib/saleCategory"
import type { SaleListItem } from "@/types/outbound"
import type { CustomerAnalysis } from "@/types/analysis"
import type { Partner, Product } from "@/types/masters"
import { CardB, FilterChips, RailBlock, TileB } from "@/components/command/MockupPrimitives"
import { KpiStrip } from "@/components/command/KpiStrip"
import { ColumnVisibilityMenu } from "@/components/common/ColumnVisibilityMenu"
import { useColumnVisibility, type ColumnVisibilityMeta } from "@/lib/columnVisibility"
import { flatSpark, monthlyTrend } from "@/templates/sparkUtils"
import { downloadSalesManagementPptx } from "@/lib/reports/salesManagementPptx"

interface MarginItem {
  manufacturer_name: string
  product_code: string
  product_name: string
  spec_wp: number
  total_sold_qty: number
  total_sold_kw: number
  avg_sale_price_wp: number
  avg_cost_wp?: number | null
  margin_wp?: number | null
  margin_rate?: number | null
  total_revenue_krw: number
  total_cost_krw?: number | null
  total_margin_krw?: number | null
  cost_covered_revenue_krw?: number
  cost_missing_revenue_krw?: number
  sale_count: number
}

interface MarginAnalysis {
  items: MarginItem[]
  summary: {
    total_sold_kw: number
    total_revenue_krw: number
    total_cost_krw: number
    total_margin_krw: number
    overall_margin_rate: number
    cost_covered_revenue_krw?: number
    cost_missing_revenue_krw?: number
    cost_coverage_rate?: number
    cost_basis: string
  }
}

interface PageState {
  loading: boolean
  error: string | null
  warnings: string[]
  sales: SaleListItem[]
  margin: MarginAnalysis | null
  customers: CustomerAnalysis | null
}

type PeriodFilter = "all" | "last3" | "year" | "custom"
type MarginFilter = "all" | "missing_cost" | "low_margin" | "negative_margin"
type SalesAnalysisTab =
  | "summary"
  | "profit"
  | "manufacturer"
  | "customer"
  | "billing"
  | "receivable"
  | "reconciliation"
type ReconciliationLevel = "good" | "watch" | "risk"
type ReconciliationKey = "engine_delta" | "pending_invoice" | "missing_cost" | "outstanding"
type AlternativeCostBasis = "manufacturer_avg" | "portfolio_avg" | "target_margin"
type MissingCostReasonKey =
  | "fifo_missing"
  | "landed_missing"
  | "cif_missing"
  | "product_master_missing"
  | "sale_link_missing"
  | "cost_finalization_pending"
// D-064 PR 30: 마진 분석 원가 기준 토글.
// fifo: ERP fifo_matches (PR 26) 직접 사용 — 가장 정확. 매칭된 출고만 cover.
// landed: 면장 + 부대비용 합산 (관세/부가세 포함 확정원가 추정).
// cif: 면장 CIF 만 (관세 전).
type CostBasis = "fifo" | "landed" | "cif"

interface MissingCostReason {
  key: MissingCostReasonKey
  label: string
  detail: string
  actionLabel: string
  tone: ReconciliationLevel
}

interface MissingCostDetailRow {
  item: MarginItem
  missingRevenue: number
  reason: MissingCostReason
  product?: Product
  relatedSales: SaleListItem[]
  actionHref: string
}

interface EngineDeltaCandidate {
  sale: SaleListItem
  reason: string
  amount: number
  actionHref: string
}

interface ReconciliationRow {
  key: ReconciliationKey
  name: string
  value: string
  sub: string
  level: ReconciliationLevel
  count: number
}

interface AlternativeMarginRow {
  item: MarginItem
  missingRevenue: number
  missingWp: number
  altCostWp: number
  altCostKrw: number
  altCostLabel: string
  adjustedCost: number
  adjustedMargin: number
  adjustedMarginRate: number
  reasonLabel?: string
}

interface AlternativeMarginSummary {
  adjustedMargin: number
  adjustedMarginRate: number
  estimatedCost: number
  estimatedRows: number
  adjustedCost: number
}

interface MonthlyManagementRow {
  month: string
  revenue: number
  count: number
  issued: number
  pending: number
  qtyWp: number
  cost: number
  margin: number
  marginRate: number
  avgSaleWp: number
  avgCostWp: number
  costCoveredRevenue: number
  costMissingRevenue: number
  costCoverageRate: number
  mixRate: number
}

interface BridgeRow {
  key: string
  label: string
  pp: number
  valueKrw: number
  detail: string
  level: ReconciliationLevel
}

const alternativeCostLabels: Record<AlternativeCostBasis, string> = {
  manufacturer_avg: "제조사 평균",
  portfolio_avg: "전체 평균",
  target_margin: "목표마진 역산",
}

const salesAnalysisTabOptions = [
  { key: "summary", label: "요약" },
  { key: "profit", label: "매출이익" },
  { key: "manufacturer", label: "제조사별" },
  { key: "customer", label: "거래처별" },
  { key: "billing", label: "청구/미수" },
  { key: "receivable", label: "수금" },
  { key: "reconciliation", label: "대사" },
]

const missingCostReasonCatalog: Record<MissingCostReasonKey, MissingCostReason> = {
  fifo_missing: {
    key: "fifo_missing",
    label: "FIFO 매칭 없음",
    detail: "출고는 있으나 FIFO 원가 매칭 결과가 아직 붙지 않았습니다.",
    actionLabel: "B/L 원가 확인",
    tone: "risk",
  },
  landed_missing: {
    key: "landed_missing",
    label: "Landed 원가 미확정",
    detail: "면장·부대비용 합산 원가가 아직 확정되지 않았습니다.",
    actionLabel: "면장/원가 확인",
    tone: "watch",
  },
  cif_missing: {
    key: "cif_missing",
    label: "CIF 기준원가 미확정",
    detail: "CIF 단가 기준의 원가 라인이 아직 연결되지 않았습니다.",
    actionLabel: "면장/원가 확인",
    tone: "watch",
  },
  product_master_missing: {
    key: "product_master_missing",
    label: "품목 마스터 불일치",
    detail: "매출 품번·규격이 제품 마스터와 맞지 않아 원가 후보를 좁히기 어렵습니다.",
    actionLabel: "품목 마스터 정리",
    tone: "risk",
  },
  sale_link_missing: {
    key: "sale_link_missing",
    label: "출고 연결 누락",
    detail: "매출 전표와 출고 행의 연결이 약해 원가 역추적 기준이 부족합니다.",
    actionLabel: "매출/출고 확인",
    tone: "risk",
  },
  cost_finalization_pending: {
    key: "cost_finalization_pending",
    label: "원가 확정 대기",
    detail: "품목과 출고는 확인되지만 현재 기준 원가가 아직 계산 결과로 확정되지 않았습니다.",
    actionLabel: "원가 재계산",
    tone: "watch",
  },
}

function saleListItemDate(item: SaleListItem) {
  return item.outbound_date ?? item.order_date ?? null
}

const emptyMargin: MarginAnalysis = {
  items: [],
  summary: {
    total_sold_kw: 0,
    total_revenue_krw: 0,
    total_cost_krw: 0,
    total_margin_krw: 0,
    overall_margin_rate: 0,
    cost_covered_revenue_krw: 0,
    cost_missing_revenue_krw: 0,
    cost_coverage_rate: 0,
    cost_basis: "landed",
  },
}

const emptyCustomers: CustomerAnalysis = {
  items: [],
  summary: {
    total_sales_krw: 0,
    total_collected_krw: 0,
    total_outstanding_krw: 0,
    total_margin_krw: 0,
    overall_margin_rate: 0,
  },
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toMonth(date?: string): string {
  return date ? date.slice(0, 7) : "날짜 없음"
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function resolvePeriod(period: PeriodFilter, customFrom: string, customTo: string) {
  const today = new Date()
  if (period === "last3") {
    const from = firstDayOfMonth(new Date(today.getFullYear(), today.getMonth() - 2, 1))
    return { dateFrom: formatDateInput(from), dateTo: formatDateInput(today) }
  }
  if (period === "year") {
    return { dateFrom: `${today.getFullYear()}-01-01`, dateTo: formatDateInput(today) }
  }
  if (period === "custom") {
    return { dateFrom: customFrom || undefined, dateTo: customTo || undefined }
  }
  return { dateFrom: undefined, dateTo: undefined }
}

function withinRange(date: string | undefined, dateFrom?: string, dateTo?: string): boolean {
  if (!date) return !dateFrom && !dateTo
  const day = date.slice(0, 10)
  if (dateFrom && day < dateFrom) return false
  if (dateTo && day > dateTo) return false
  return true
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return round2((numerator / denominator) * 100)
}

function moneyDelta(a: number, b: number): number {
  return Math.abs(Math.round(a - b))
}

function levelTone(level: ReconciliationLevel): string {
  if (level === "good") return "sf-tone-pos"
  if (level === "watch") return "sf-tone-warn"
  return "sf-tone-neg"
}

function saleSupplyAmount(item: SaleListItem): number {
  return item.sale.supply_amount ?? item.supply_amount ?? 0
}

function saleIssueDate(item: SaleListItem): string | undefined {
  return item.sale.tax_invoice_date ?? item.tax_invoice_date
}

function saleStatus(item: SaleListItem): string | undefined {
  return item.sale.status ?? item.status
}

function saleQuantity(item: SaleListItem): number {
  return item.sale.quantity ?? item.quantity ?? 0
}

function productKey(productCode?: string | null, specWp?: number | null): string {
  return `${(productCode ?? "").trim().toUpperCase()}|${specWp ?? 0}`
}

function marginItemKey(item: MarginItem): string {
  return productKey(item.product_code, item.spec_wp)
}

function saleProductKey(item: SaleListItem, product?: Product): string {
  return productKey(item.product_code ?? product?.product_code, item.spec_wp ?? product?.spec_wp)
}

function compactDate(date?: string | null): string {
  return date ? date.slice(0, 10) : "날짜 없음"
}

function salesActionHref(sale: SaleListItem): string {
  const params = new URLSearchParams()
  if (sale.order_id) params.set("order_id", sale.order_id)
  if (sale.outbound_id) params.set("outbound_id", sale.outbound_id)
  if (sale.sale_id) params.set("sale_id", sale.sale_id)
  const query = params.toString()
  return query ? `/orders?${query}` : "/orders"
}

function customerActionHref(customerId?: string): string {
  if (!customerId) return "/orders"
  return `/orders?customer_id=${encodeURIComponent(customerId)}`
}

function missingCostActionHref(
  reason: MissingCostReason,
  product: Product | undefined,
  relatedSales: SaleListItem[],
  item: MarginItem,
): string {
  if (reason.key === "product_master_missing") {
    const params = new URLSearchParams()
    if (item.product_code) params.set("product_code", item.product_code)
    const query = params.toString()
    return query ? `/data/products/new?${query}` : "/data/products/new"
  }
  if (reason.key === "sale_link_missing") {
    return relatedSales[0] ? salesActionHref(relatedSales[0]) : "/orders"
  }
  if (reason.key === "fifo_missing") {
    const params = new URLSearchParams({ tab: "bl" })
    if (product?.product_id) params.set("product_id", product.product_id)
    if (relatedSales[0]?.outbound_id) params.set("outbound_id", relatedSales[0].outbound_id)
    return `/procurement?${params.toString()}`
  }
  return "/customs"
}

function matchesMarginItem(item: MarginItem, sale: SaleListItem, product?: Product): boolean {
  if (product?.product_id && sale.product_id === product.product_id) return true
  if (!sale.product_code) return false
  return productKey(sale.product_code, sale.spec_wp) === productKey(item.product_code, item.spec_wp)
}

function classifyMissingCostReason(
  item: MarginItem,
  product: Product | undefined,
  relatedSales: SaleListItem[],
  costBasis: CostBasis,
): MissingCostReason {
  if (!item.product_code || !product) return missingCostReasonCatalog.product_master_missing
  if (relatedSales.length === 0 || relatedSales.every((sale) => !sale.outbound_id)) {
    return missingCostReasonCatalog.sale_link_missing
  }
  if (relatedSales.some((sale) => saleStatus(sale) === "cancelled")) {
    return missingCostReasonCatalog.sale_link_missing
  }
  if (costBasis === "fifo") return missingCostReasonCatalog.fifo_missing
  if (costBasis === "landed") return missingCostReasonCatalog.landed_missing
  if (costBasis === "cif") return missingCostReasonCatalog.cif_missing
  return missingCostReasonCatalog.cost_finalization_pending
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function safeFilePart(value: string | undefined): string {
  return (value || "all").replace(/[^\w가-힣.-]+/g, "_").slice(0, 48)
}

const customerMarginColumns: ColumnVisibilityMeta[] = [
  { key: "name", label: "거래처", hideable: false },
  { key: "sales", label: "매출액", hideable: true },
  { key: "share", label: "비중", hideable: true },
  { key: "margin_rate", label: "이익률", hideable: true },
  { key: "margin", label: "이익액", hideable: true },
  { key: "kw", label: "출고(MW)", hideable: true },
  { key: "count", label: "거래건수", hideable: true, hiddenByDefault: true },
  { key: "outstanding", label: "미수액", hideable: true, hiddenByDefault: true },
  { key: "outstanding_rate", label: "미수율", hideable: true, hiddenByDefault: true },
  { key: "pay_days", label: "평균회수일", hideable: true, hiddenByDefault: true },
  { key: "deposit_rate", label: "평균 입금률", hideable: true, hiddenByDefault: true },
  { key: "unit_price", label: "평균 단가(₩/W)", hideable: true, hiddenByDefault: true },
]

const manufacturerColumns: ColumnVisibilityMeta[] = [
  { key: "name", label: "제조사", hideable: false },
  { key: "revenue", label: "매출", hideable: true },
  { key: "share", label: "비중", hideable: true },
  { key: "margin_rate", label: "이익률", hideable: true },
  { key: "missing_rate", label: "원가공백", hideable: true },
  { key: "kw", label: "출고(MW)", hideable: true },
  { key: "qty", label: "매출수량", hideable: true, hiddenByDefault: true },
  { key: "cost", label: "매출원가", hideable: true, hiddenByDefault: true },
  { key: "margin", label: "이익액", hideable: true, hiddenByDefault: true },
  { key: "count", label: "거래건수", hideable: true, hiddenByDefault: true },
  { key: "unit_price", label: "평균 단가(₩/W)", hideable: true, hiddenByDefault: true },
]

const billingColumns: ColumnVisibilityMeta[] = [
  { key: "name", label: "거래처", hideable: false },
  { key: "sales", label: "청구액", hideable: true },
  { key: "outstanding", label: "미수액", hideable: true },
  { key: "outstanding_rate", label: "미수율", hideable: true },
  { key: "collected", label: "회수액", hideable: true, hiddenByDefault: true },
  { key: "count", label: "거래건수", hideable: true, hiddenByDefault: true },
  { key: "outstanding_count", label: "미수건수", hideable: true, hiddenByDefault: true },
  { key: "oldest_days", label: "최고연체일", hideable: true, hiddenByDefault: true },
]

const receivableColumns: ColumnVisibilityMeta[] = [
  { key: "name", label: "거래처", hideable: false },
  { key: "signal", label: "신호", hideable: true },
  { key: "outstanding", label: "미수액", hideable: true },
  { key: "margin_rate", label: "이익률", hideable: true },
  { key: "oldest_days", label: "최장 연체일", hideable: true },
  { key: "sales", label: "매출액", hideable: true, hiddenByDefault: true },
  { key: "outstanding_rate", label: "미수율", hideable: true, hiddenByDefault: true },
  { key: "outstanding_count", label: "미수건수", hideable: true, hiddenByDefault: true },
  { key: "pay_days", label: "평균회수일", hideable: true, hiddenByDefault: true },
  { key: "deposit_rate", label: "평균 입금률", hideable: true, hiddenByDefault: true },
]

const productMarginColumns: ColumnVisibilityMeta[] = [
  { key: "module", label: "모듈", hideable: false },
  { key: "product", label: "품번/품명", hideable: true },
  { key: "qty", label: "수량", hideable: true },
  { key: "sale_price", label: "판매가", hideable: true },
  { key: "cost_state", label: "원가상태", hideable: true },
  { key: "cost", label: "원가", hideable: true },
  { key: "margin_wp", label: "이익/Wp", hideable: true },
  { key: "margin_rate", label: "이익률", hideable: true },
  { key: "revenue", label: "매출", hideable: true },
  { key: "margin", label: "이익", hideable: true },
  { key: "kw", label: "출고(MW)", hideable: true, hiddenByDefault: true },
  { key: "sale_count", label: "거래건수", hideable: true, hiddenByDefault: true },
]

export default function SalesAnalysisPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<SalesAnalysisTab>("summary")
  const [period, setPeriod] = useState<PeriodFilter>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [customerFilter, setCustomerFilter] = useState("")
  const [manufacturerFilter, setManufacturerFilter] = useState("")
  const [partners, setPartners] = useState<Partner[]>([])
  // D-064 PR 30: 원가 기준 토글 — 기본 fifo (가장 정확). cost_details 만 있는 환경은 landed 로 폴백.
  const [costBasis, setCostBasis] = useState<CostBasis>("fifo")
  const [alternativeCostBasis, setAlternativeCostBasis] =
    useState<AlternativeCostBasis>("manufacturer_avg")
  const [marginFilter, setMarginFilter] = useState<MarginFilter>("all")
  const [productSearch, setProductSearch] = useState("")
  const [activeReconciliation, setActiveReconciliation] =
    useState<ReconciliationKey>("missing_cost")
  const [causeRowsParent] = useAutoAnimate<HTMLTableSectionElement>()
  const [customerRiskParent] = useAutoAnimate<HTMLTableSectionElement>()
  const [manufacturerRowsParent] = useAutoAnimate<HTMLTableSectionElement>()
  const [customerRowsParent] = useAutoAnimate<HTMLTableSectionElement>()
  const [marginRowsParent] = useAutoAnimate<HTMLTableSectionElement>()
  const [reconciliationDetailParent] = useAutoAnimate<HTMLDivElement>()
  const manufacturers = useAppStore((s) => s.manufacturers)
  const products = useAppStore((s) => s.products)
  const loadManufacturers = useAppStore((s) => s.loadManufacturers)
  const loadProducts = useAppStore((s) => s.loadProducts)
  const [state, setState] = useState<PageState>({
    loading: true,
    error: null,
    warnings: [],
    sales: [],
    margin: null,
    customers: null,
  })

  const dateRange = useMemo(
    () => resolvePeriod(period, customFrom, customTo),
    [customFrom, customTo, period],
  )

  useEffect(() => {
    fetchWithAuth<Partner[]>("/api/v1/partners")
      .then((list) =>
        setPartners(
          list.filter(
            (p) => p.is_active && (p.partner_type === "customer" || p.partner_type === "both"),
          ),
        ),
      )
      .catch(() => setPartners([]))
    loadManufacturers()
    loadProducts()
  }, [loadManufacturers, loadProducts])

  const load = useCallback(async () => {
    if (!selectedCompanyId) {
      setState({
        loading: false,
        error: null,
        warnings: [],
        sales: [],
        margin: null,
        customers: null,
      })
      return
    }
    setState((prev) => ({ ...prev, loading: true, error: null, warnings: [] }))
    try {
      const calcFilterBody = {
        cost_basis: costBasis,
        ...(dateRange.dateFrom ? { date_from: dateRange.dateFrom } : {}),
        ...(dateRange.dateTo ? { date_to: dateRange.dateTo } : {}),
      }
      const salesQueryParts: string[] = []
      const baseUrl = companyQueryUrl("/api/v1/sales", selectedCompanyId)
      const baseQueryFromUrl = baseUrl.includes("?") ? (baseUrl.split("?")[1] ?? "") : ""
      if (baseQueryFromUrl) salesQueryParts.push(baseQueryFromUrl)
      if (customerFilter) salesQueryParts.push(`customer_id=${customerFilter}`)
      const salesQuery = salesQueryParts.join("&")
      const [sales, marginResult, customerResult] = await Promise.all([
        fetchAllPaginated<SaleListItem>("/api/v1/sales", salesQuery),
        fetchCalc<MarginAnalysis>(selectedCompanyId, "/api/v1/calc/margin-analysis", {
          ...calcFilterBody,
          ...(manufacturerFilter ? { manufacturer_id: manufacturerFilter } : {}),
          ...(customerFilter ? { customer_id: customerFilter } : {}),
        })
          .then((data) => ({ data, warning: null as string | null }))
          .catch(() => ({
            data: emptyMargin,
            warning: "이익 계산 엔진 응답을 받지 못했습니다. 매출 집계만 표시합니다.",
          })),
        fetchCalc<CustomerAnalysis>(selectedCompanyId, "/api/v1/calc/customer-analysis", {
          ...calcFilterBody,
          ...(customerFilter ? { customer_id: customerFilter } : {}),
        })
          .then((data) => ({ data, warning: null as string | null }))
          .catch(() => ({
            data: emptyCustomers,
            warning:
              "거래처/수금 분석 엔진 응답을 받지 못했습니다. 미수금과 거래처 표시는 제외됩니다.",
          })),
      ])
      setState({
        loading: false,
        error: null,
        warnings: [marginResult.warning, customerResult.warning].filter((w): w is string =>
          Boolean(w),
        ),
        sales,
        margin: marginResult.data,
        customers: customerResult.data,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        warnings: [],
        error: err instanceof Error ? err.message : "매출/이익 분석 데이터를 불러오지 못했습니다",
      }))
    }
  }, [
    costBasis,
    customerFilter,
    dateRange.dateFrom,
    dateRange.dateTo,
    manufacturerFilter,
    selectedCompanyId,
  ])

  useEffect(() => {
    load()
  }, [load])

  const productManufacturerMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const product of products) map.set(product.product_id, product.manufacturer_id)
    return map
  }, [products])
  const productByCodeSpec = useMemo(() => {
    const map = new Map<string, Product>()
    for (const product of products)
      map.set(productKey(product.product_code, product.spec_wp), product)
    return map
  }, [products])
  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const product of products) map.set(product.product_id, product)
    return map
  }, [products])

  const filteredSales = useMemo(() => {
    return state.sales.filter((item) => {
      if (!withinRange(item.outbound_date ?? item.order_date, dateRange.dateFrom, dateRange.dateTo))
        return false
      if (
        manufacturerFilter &&
        (!item.product_id || productManufacturerMap.get(item.product_id) !== manufacturerFilter)
      )
        return false
      // 매출분석은 외부 판매(sale/sale_spare) 만. 비매출 출고(공사사용/유지관리/폐기 등
      // supply_amount=0) 와 연결된 sale 이 들어오면 월별 이익 추정에서 0매출 vs 양수원가가
      // 매월 음수를 만들어 적자처럼 보임 (2026-05-12). usage_category 가 NULL/undefined 도
      // 제외 (whitelist) — 마이그 077 integrity_check 가 outbounds.usage_category NULL 을
      // high severity 로 잡고 있어 실제 운영 데이터에 NULL 행이 존재한다. blacklist + truthy
      // 가드는 그 행들을 silent 하게 통과시켜 음수 이익 버그를 회귀시킨다. 정의는
      // lib/saleCategory 에 공유 — Sales 인사이트(Supply/IssueRate) 도 동일 술어 사용.
      if (!isExternalSale(item)) return false
      return true
    })
  }, [
    dateRange.dateFrom,
    dateRange.dateTo,
    manufacturerFilter,
    productManufacturerMap,
    state.sales,
  ])

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; count: number }>()
    for (const item of filteredSales) {
      const month = toMonth(item.outbound_date ?? item.order_date)
      const prev = map.get(month) ?? { month, revenue: 0, count: 0 }
      prev.revenue += saleSupplyAmount(item)
      prev.count += 1
      map.set(month, prev)
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [filteredSales])

  const salesSummary = useMemo(() => {
    const supply = filteredSales.reduce((sum, item) => sum + saleSupplyAmount(item), 0)
    const issued = filteredSales.filter((item) => saleIssueDate(item)).length
    return {
      supply,
      count: filteredSales.length,
      issued,
      pending: filteredSales.length - issued,
      issueRate: filteredSales.length > 0 ? Math.round((issued / filteredSales.length) * 100) : 0,
    }
  }, [filteredSales])

  // KPI sparkline — 최근 8개월 실제 매출/세금 흐름.
  const supplySpark = useMemo(
    () => monthlyTrend(filteredSales, saleListItemDate, saleSupplyAmount),
    [filteredSales],
  )
  const issueRateSpark = useMemo(() => {
    // total 과 issued 가 같은 데이터 범위(filteredSales 의 minMonth)를 공유하도록
    // 동일 items 위에서 conditional getValue 로 계산 — 부분집합으로 분리하면 길이가 어긋남.
    const totalByMonth = monthlyTrend(filteredSales, saleListItemDate, () => 1)
    const issuedByMonth = monthlyTrend(filteredSales, saleListItemDate, (i) =>
      saleIssueDate(i) ? 1 : 0,
    )
    return totalByMonth.map((t, i) => (t > 0 ? Math.round((issuedByMonth[i]! / t) * 100) : 0))
  }, [filteredSales])

  const margin = state.margin ?? emptyMargin
  const customers = state.customers ?? emptyCustomers
  const coveredCostCount = margin.items.filter((item) => item.avg_cost_wp != null).length
  const costMissingItemCount = margin.items.length - coveredCostCount
  const costCoveredRevenue =
    margin.summary.cost_covered_revenue_krw ??
    margin.items.reduce(
      (sum, item) =>
        sum +
        (item.cost_covered_revenue_krw ??
          (item.total_cost_krw != null ? item.total_revenue_krw : 0)),
      0,
    )
  const costMissingRevenue =
    margin.summary.cost_missing_revenue_krw ??
    margin.items.reduce(
      (sum, item) =>
        sum +
        (item.cost_missing_revenue_krw ??
          (item.total_cost_krw == null ? item.total_revenue_krw : 0)),
      0,
    )
  const costCoverageRate =
    margin.summary.cost_coverage_rate ??
    (margin.summary.total_revenue_krw > 0
      ? round2((costCoveredRevenue / margin.summary.total_revenue_krw) * 100)
      : 0)
  const marginByProductKey = useMemo(() => {
    const map = new Map<string, MarginItem>()
    for (const item of margin.items) map.set(marginItemKey(item), item)
    return map
  }, [margin.items])
  const shownMarginItems = useMemo(() => {
    let items = margin.items
    if (marginFilter === "missing_cost") {
      items = items.filter((item) => item.avg_cost_wp == null || item.total_cost_krw == null)
    } else if (marginFilter === "low_margin") {
      items = items.filter((item) => item.margin_rate != null && item.margin_rate < 8)
    } else if (marginFilter === "negative_margin") {
      items = items.filter((item) => item.margin_rate != null && item.margin_rate < 0)
    }
    const q = productSearch.trim().toLowerCase()
    if (q) {
      items = items.filter((item) => {
        const costCovered = item.avg_cost_wp != null && item.total_cost_krw != null
        const haystack = [
          item.manufacturer_name,
          item.product_code,
          item.product_name,
          moduleLabel(item.manufacturer_name, item.spec_wp),
          costCovered ? "원가 연결" : "원가 없음",
          formatNumber(item.total_sold_qty),
          formatNumber(item.avg_sale_price_wp),
          item.avg_cost_wp != null ? formatNumber(item.avg_cost_wp) : "",
          item.margin_wp != null ? formatNumber(item.margin_wp) : "",
          item.margin_rate != null ? `${item.margin_rate.toFixed(1)}%` : "",
          formatKRW(item.total_revenue_krw),
          item.total_margin_krw != null ? formatKRW(item.total_margin_krw) : "",
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(q)
      })
    }
    return items
  }, [margin.items, marginFilter, productSearch])
  const shownMarginCoveredCount = shownMarginItems.filter((item) => item.avg_cost_wp != null).length
  const shownMarginTotals = useMemo(() => {
    const totalRevenue = shownMarginItems.reduce((sum, item) => sum + item.total_revenue_krw, 0)
    const totalCost = shownMarginItems.reduce((sum, item) => sum + (item.total_cost_krw ?? 0), 0)
    const coveredRevenue = shownMarginItems.reduce(
      (sum, item) =>
        sum +
        (item.cost_covered_revenue_krw ??
          (item.total_cost_krw != null ? item.total_revenue_krw : 0)),
      0,
    )
    const totalMargin = coveredRevenue - totalCost
    return {
      qty: shownMarginItems.reduce((sum, item) => sum + item.total_sold_qty, 0),
      kw: shownMarginItems.reduce((sum, item) => sum + item.total_sold_kw, 0),
      saleCount: shownMarginItems.reduce((sum, item) => sum + item.sale_count, 0),
      revenue: totalRevenue,
      margin: totalMargin,
      rate: coveredRevenue > 0 ? round2((totalMargin / coveredRevenue) * 100) : 0,
    }
  }, [shownMarginItems])
  const pendingInvoiceSales = useMemo(
    () => filteredSales.filter((item) => !saleIssueDate(item)),
    [filteredSales],
  )
  const pendingInvoiceRevenue = useMemo(
    () => pendingInvoiceSales.reduce((sum, item) => sum + saleSupplyAmount(item), 0),
    [pendingInvoiceSales],
  )
  const missingCostRows = useMemo(() => {
    return margin.items
      .map((item) => ({
        item,
        missingRevenue:
          item.cost_missing_revenue_krw ??
          (item.total_cost_krw == null ? item.total_revenue_krw : 0),
      }))
      .filter((row) => row.missingRevenue > 0)
      .sort((a, b) => b.missingRevenue - a.missingRevenue)
      .slice(0, 5)
  }, [margin.items])
  const missingCostDetailRows = useMemo<MissingCostDetailRow[]>(() => {
    return margin.items
      .map((item) => {
        const missingRevenue =
          item.cost_missing_revenue_krw ??
          (item.total_cost_krw == null ? item.total_revenue_krw : 0)
        const product = productByCodeSpec.get(productKey(item.product_code, item.spec_wp))
        const relatedSales = filteredSales
          .filter((sale) => matchesMarginItem(item, sale, product))
          .sort((a, b) => saleSupplyAmount(b) - saleSupplyAmount(a))
        const reason = classifyMissingCostReason(item, product, relatedSales, costBasis)
        return {
          item,
          missingRevenue,
          reason,
          product,
          relatedSales,
          actionHref: missingCostActionHref(reason, product, relatedSales, item),
        }
      })
      .filter((row) => row.missingRevenue > 0)
      .sort((a, b) => b.missingRevenue - a.missingRevenue)
      .slice(0, 8)
  }, [costBasis, filteredSales, margin.items, productByCodeSpec])
  const missingCostReasonSummary = useMemo(() => {
    const map = new Map<
      MissingCostReasonKey,
      { reason: MissingCostReason; revenue: number; count: number }
    >()
    for (const row of missingCostDetailRows) {
      const prev = map.get(row.reason.key) ?? { reason: row.reason, revenue: 0, count: 0 }
      prev.revenue += row.missingRevenue
      prev.count += 1
      map.set(row.reason.key, prev)
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue)
  }, [missingCostDetailRows])
  const costProfiles = useMemo(() => {
    const byManufacturer = new Map<string, { cost: number; wp: number }>()
    let portfolioCost = 0
    let portfolioWp = 0
    for (const item of margin.items) {
      if (item.avg_cost_wp == null || item.total_cost_krw == null) continue
      const wp = item.total_sold_qty * item.spec_wp
      if (wp <= 0) continue
      const cost = item.avg_cost_wp * wp
      portfolioCost += cost
      portfolioWp += wp
      const key = item.manufacturer_name || "제조사 없음"
      const prev = byManufacturer.get(key) ?? { cost: 0, wp: 0 }
      prev.cost += cost
      prev.wp += wp
      byManufacturer.set(key, prev)
    }
    return {
      portfolioAvgCostWp: safeDivide(portfolioCost, portfolioWp),
      manufacturerAvgCostWp: new Map(
        Array.from(byManufacturer.entries()).map(([key, value]) => [
          key,
          safeDivide(value.cost, value.wp),
        ]),
      ),
    }
  }, [margin.items])
  const alternativeMarginRows = useMemo<AlternativeMarginRow[]>(() => {
    const reasonByKey = new Map(
      missingCostDetailRows.map((row) => [marginItemKey(row.item), row.reason.label]),
    )
    const targetMarginRate = Math.max(8, margin.summary.overall_margin_rate || 0)
    return margin.items
      .map((item) => {
        const missingRevenue =
          item.cost_missing_revenue_krw ??
          (item.total_cost_krw == null ? item.total_revenue_krw : 0)
        const missingRatio = safeDivide(missingRevenue, item.total_revenue_krw)
        const missingWp = item.total_sold_qty * item.spec_wp * missingRatio
        const manufacturerAvg =
          costProfiles.manufacturerAvgCostWp.get(item.manufacturer_name || "제조사 없음") ?? 0
        const portfolioAvg = costProfiles.portfolioAvgCostWp
        const targetMarginCost = Math.max(0, item.avg_sale_price_wp * (1 - targetMarginRate / 100))
        const fallbackCost = manufacturerAvg || portfolioAvg || targetMarginCost
        const altCostWp =
          alternativeCostBasis === "manufacturer_avg"
            ? manufacturerAvg || fallbackCost
            : alternativeCostBasis === "portfolio_avg"
              ? portfolioAvg || fallbackCost
              : targetMarginCost || fallbackCost
        const altCostKrw = missingWp * altCostWp
        const adjustedCost = (item.total_cost_krw ?? 0) + altCostKrw
        const adjustedMargin = item.total_revenue_krw - adjustedCost
        return {
          item,
          missingRevenue,
          missingWp,
          altCostWp: round2(altCostWp),
          altCostKrw: round2(altCostKrw),
          altCostLabel: alternativeCostLabels[alternativeCostBasis],
          adjustedCost: round2(adjustedCost),
          adjustedMargin: round2(adjustedMargin),
          adjustedMarginRate: pct(adjustedMargin, item.total_revenue_krw),
          reasonLabel: reasonByKey.get(marginItemKey(item)),
        }
      })
      .filter((row) => row.missingRevenue > 0 && row.missingWp > 0)
      .sort((a, b) => b.missingRevenue - a.missingRevenue)
  }, [
    alternativeCostBasis,
    costProfiles.manufacturerAvgCostWp,
    costProfiles.portfolioAvgCostWp,
    margin.items,
    margin.summary.overall_margin_rate,
    missingCostDetailRows,
  ])
  const shownAlternativeMarginRows = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    if (!q) return alternativeMarginRows
    return alternativeMarginRows.filter((row) => {
      const haystack = [
        row.item.product_code,
        row.item.product_name,
        row.item.manufacturer_name,
        row.reasonLabel ?? "",
        row.altCostLabel,
        formatKRW(row.missingRevenue),
        `${formatNumber(row.altCostWp)}원/Wp`,
        `${row.adjustedMarginRate.toFixed(1)}%`,
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [alternativeMarginRows, productSearch])
  const alternativeMarginSummary = useMemo<AlternativeMarginSummary>(() => {
    const estimatedCost = alternativeMarginRows.reduce((sum, row) => sum + row.altCostKrw, 0)
    const adjustedCost =
      margin.items.reduce((sum, item) => sum + (item.total_cost_krw ?? 0), 0) + estimatedCost
    const adjustedMargin = margin.summary.total_revenue_krw - adjustedCost
    return {
      adjustedMargin: round2(adjustedMargin),
      adjustedMarginRate: pct(adjustedMargin, margin.summary.total_revenue_krw),
      estimatedCost: round2(estimatedCost),
      estimatedRows: alternativeMarginRows.length,
      adjustedCost: round2(adjustedCost),
    }
  }, [alternativeMarginRows, margin.items, margin.summary.total_revenue_krw])
  const alternativeMarginByKey = useMemo(() => {
    const map = new Map<string, AlternativeMarginRow>()
    for (const row of alternativeMarginRows) map.set(marginItemKey(row.item), row)
    return map
  }, [alternativeMarginRows])
  const monthlyManagementRows = useMemo<MonthlyManagementRow[]>(() => {
    const map = new Map<
      string,
      MonthlyManagementRow & { mixWeightedRate: number; costWpWeighted: number }
    >()
    for (const sale of filteredSales) {
      const product = sale.product_id ? productById.get(sale.product_id) : undefined
      const key = saleProductKey(sale, product)
      const item = marginByProductKey.get(key)
      const alternative = alternativeMarginByKey.get(key)
      const month = toMonth(saleListItemDate(sale) ?? undefined)
      const revenue = saleSupplyAmount(sale)
      const qty = saleQuantity(sale)
      const specWp = sale.spec_wp ?? product?.spec_wp ?? item?.spec_wp ?? 0
      const qtyWp = qty * specWp
      const costWp = item?.avg_cost_wp ?? alternative?.altCostWp ?? 0
      const estimatedCost =
        qtyWp > 0 && costWp > 0
          ? qtyWp * costWp
          : item?.margin_rate != null
            ? revenue * (1 - item.margin_rate / 100)
            : 0
      const estimatedMargin = revenue - estimatedCost
      const costCovered = item?.avg_cost_wp != null || item?.total_cost_krw != null
      const prev =
        map.get(month) ??
        ({
          month,
          revenue: 0,
          count: 0,
          issued: 0,
          pending: 0,
          qtyWp: 0,
          cost: 0,
          margin: 0,
          marginRate: 0,
          avgSaleWp: 0,
          avgCostWp: 0,
          costCoveredRevenue: 0,
          costMissingRevenue: 0,
          costCoverageRate: 0,
          mixRate: 0,
          mixWeightedRate: 0,
          costWpWeighted: 0,
        } satisfies MonthlyManagementRow & { mixWeightedRate: number; costWpWeighted: number })
      prev.revenue += revenue
      prev.count += 1
      prev.issued += saleIssueDate(sale) ? 1 : 0
      prev.pending += saleIssueDate(sale) ? 0 : 1
      prev.qtyWp += qtyWp
      prev.cost += estimatedCost
      prev.margin += estimatedMargin
      prev.costCoveredRevenue += costCovered ? revenue : 0
      prev.costMissingRevenue += costCovered ? 0 : revenue
      prev.mixWeightedRate += pct(estimatedMargin, revenue) * revenue
      prev.costWpWeighted += costWp * qtyWp
      map.set(month, prev)
    }
    return Array.from(map.values())
      .map((row) => ({
        month: row.month,
        revenue: round2(row.revenue),
        count: row.count,
        issued: row.issued,
        pending: row.pending,
        qtyWp: round2(row.qtyWp),
        cost: round2(row.cost),
        margin: round2(row.margin),
        marginRate: pct(row.margin, row.revenue),
        avgSaleWp: round2(safeDivide(row.revenue, row.qtyWp)),
        avgCostWp: round2(safeDivide(row.costWpWeighted, row.qtyWp)),
        costCoveredRevenue: round2(row.costCoveredRevenue),
        costMissingRevenue: round2(row.costMissingRevenue),
        costCoverageRate: pct(row.costCoveredRevenue, row.revenue),
        mixRate: round2(safeDivide(row.mixWeightedRate, row.revenue)),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [alternativeMarginByKey, filteredSales, marginByProductKey, productById])

  const monthlyRevenueProfit = useMemo(() => {
    const marginByMonth = new Map<string, number>()
    for (const row of monthlyManagementRows) marginByMonth.set(row.month, row.margin)
    return monthly.map((row) => ({
      ...row,
      margin: marginByMonth.get(row.month) ?? 0,
    }))
  }, [monthly, monthlyManagementRows])

  const marginBridge = useMemo(() => {
    const rows = monthlyManagementRows.filter((row) => row.revenue > 0)
    const prev = rows.at(-2)
    const curr = rows.at(-1)
    if (!prev || !curr) {
      return {
        prev: null as MonthlyManagementRow | null,
        curr: null as MonthlyManagementRow | null,
        deltaRate: 0,
        rows: [] as BridgeRow[],
      }
    }
    const pricePp = safeDivide((curr.avgSaleWp - prev.avgSaleWp) * curr.qtyWp, curr.revenue) * 100
    const costPp = safeDivide((prev.avgCostWp - curr.avgCostWp) * curr.qtyWp, curr.revenue) * 100
    const mixPp = curr.mixRate - prev.mixRate
    const coveragePp = curr.costCoverageRate - prev.costCoverageRate
    const deltaRate = curr.marginRate - prev.marginRate
    const bridgeRows: BridgeRow[] = [
      {
        key: "price",
        label: "판매가 효과",
        pp: round2(pricePp),
        valueKrw: round2((pricePp / 100) * curr.revenue),
        detail: `${prev.avgSaleWp.toFixed(1)} → ${curr.avgSaleWp.toFixed(1)}원/Wp`,
        level: pricePp >= 0 ? "good" : "risk",
      },
      {
        key: "cost",
        label: "원가 효과",
        pp: round2(costPp),
        valueKrw: round2((costPp / 100) * curr.revenue),
        detail: `${prev.avgCostWp.toFixed(1)} → ${curr.avgCostWp.toFixed(1)}원/Wp`,
        level: costPp >= 0 ? "good" : "risk",
      },
      {
        key: "mix",
        label: "제품 믹스",
        pp: round2(mixPp),
        valueKrw: round2((mixPp / 100) * curr.revenue),
        detail: `${prev.mixRate.toFixed(1)}% → ${curr.mixRate.toFixed(1)}%`,
        level: mixPp >= 0 ? "good" : "watch",
      },
      {
        key: "coverage",
        label: "원가 연결률",
        pp: round2(coveragePp),
        valueKrw: round2((coveragePp / 100) * curr.revenue),
        detail: `${prev.costCoverageRate.toFixed(1)}% → ${curr.costCoverageRate.toFixed(1)}%`,
        level: coveragePp >= 0 ? "good" : "watch",
      },
      {
        key: "total",
        label: "총 이익률 변동",
        pp: round2(deltaRate),
        valueKrw: round2(curr.margin - prev.margin),
        detail: `${prev.marginRate.toFixed(1)}% → ${curr.marginRate.toFixed(1)}%`,
        level: deltaRate >= 0 ? "good" : "risk",
      },
    ]
    return { prev, curr, deltaRate: round2(deltaRate), rows: bridgeRows }
  }, [monthlyManagementRows])
  const engineDeltaCandidates = useMemo<EngineDeltaCandidate[]>(() => {
    return filteredSales
      .map((sale) => {
        const reasons: string[] = []
        if (!sale.outbound_id) reasons.push("출고 연결 없음")
        if (sale.outbound_status && sale.outbound_status !== "active") {
          reasons.push(`출고 ${sale.outbound_status}`)
        }
        if (!sale.product_id && !sale.product_code) reasons.push("품목 연결 없음")
        if (saleStatus(sale) === "cancelled") reasons.push("취소 전표")
        if (saleSupplyAmount(sale) <= 0) reasons.push("공급가 0")
        return {
          sale,
          reason: reasons[0] ?? "집계 범위 확인",
          amount: saleSupplyAmount(sale),
          actionHref: salesActionHref(sale),
        }
      })
      .filter((row) => row.reason !== "집계 범위 확인")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
  }, [filteredSales])
  const topSalesForDeltaReview = useMemo(
    () =>
      filteredSales
        .slice()
        .sort((a, b) => saleSupplyAmount(b) - saleSupplyAmount(a))
        .slice(0, 6),
    [filteredSales],
  )
  const marginDragRows = useMemo(() => {
    const portfolioRate = margin.summary.overall_margin_rate
    return margin.items
      .map((item) => {
        const coveredRevenue =
          item.cost_covered_revenue_krw ??
          (item.total_cost_krw != null ? item.total_revenue_krw : 0)
        const rate = item.margin_rate
        const dragKrw =
          rate != null && coveredRevenue > 0 && rate < portfolioRate
            ? coveredRevenue * ((portfolioRate - rate) / 100)
            : 0
        return { item, coveredRevenue, dragKrw: round2(dragKrw) }
      })
      .filter((row) => row.dragKrw > 0 || (row.item.total_margin_krw ?? 0) < 0)
      .sort((a, b) => b.dragKrw - a.dragKrw)
      .slice(0, 5)
  }, [margin.items, margin.summary.overall_margin_rate])
  const manufacturerDeepRows = useMemo(() => {
    const map = new Map<
      string,
      {
        manufacturer: string
        revenue: number
        coveredRevenue: number
        missingRevenue: number
        cost: number
        margin: number
        kw: number
        qty: number
        saleCount: number
      }
    >()
    for (const item of margin.items) {
      const key = item.manufacturer_name || "제조사 없음"
      const prev = map.get(key) ?? {
        manufacturer: key,
        revenue: 0,
        coveredRevenue: 0,
        missingRevenue: 0,
        cost: 0,
        margin: 0,
        kw: 0,
        qty: 0,
        saleCount: 0,
      }
      const coveredRevenue =
        item.cost_covered_revenue_krw ?? (item.total_cost_krw != null ? item.total_revenue_krw : 0)
      const missingRevenue =
        item.cost_missing_revenue_krw ?? (item.total_cost_krw == null ? item.total_revenue_krw : 0)
      const cost = item.total_cost_krw ?? 0
      map.set(key, {
        ...prev,
        revenue: prev.revenue + item.total_revenue_krw,
        coveredRevenue: prev.coveredRevenue + coveredRevenue,
        missingRevenue: prev.missingRevenue + missingRevenue,
        cost: prev.cost + cost,
        margin: prev.margin + (coveredRevenue - cost),
        kw: prev.kw + item.total_sold_kw,
        qty: prev.qty + item.total_sold_qty,
        saleCount: prev.saleCount + item.sale_count,
      })
    }
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        marginRate: row.coveredRevenue > 0 ? round2((row.margin / row.coveredRevenue) * 100) : null,
        revenueShare: pct(row.revenue, margin.summary.total_revenue_krw),
        missingRate: pct(row.missingRevenue, row.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
  }, [margin.items, margin.summary.total_revenue_krw])
  const customerKwMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const sale of filteredSales) {
      // sale.capacity_kw 가 NULL 인 경우 (마이그 108 백필 이전 임포트 잔재 +
      // products.spec_wp NULL product 1건) quantity × spec_wp / 1000 으로 보강.
      // 누락 시 customer 평균단가가 분모 deflate 로 부풀려지는 회귀 방지.
      const kw =
        sale.capacity_kw ??
        (sale.quantity && sale.spec_wp ? (sale.quantity * sale.spec_wp) / 1000 : 0)
      if (!kw || !sale.customer_id) continue
      map.set(sale.customer_id, (map.get(sale.customer_id) ?? 0) + kw)
    }
    return map
  }, [filteredSales])
  const customerCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const sale of filteredSales) {
      if (!sale.customer_id) continue
      map.set(sale.customer_id, (map.get(sale.customer_id) ?? 0) + 1)
    }
    return map
  }, [filteredSales])
  const { hidden: hiddenCustomerCols, setHidden: setHiddenCustomerCols } = useColumnVisibility(
    "sales-analysis.customer-margin",
    customerMarginColumns,
  )
  const { hidden: hiddenManufacturerCols, setHidden: setHiddenManufacturerCols } =
    useColumnVisibility("sales-analysis.manufacturer", manufacturerColumns)
  const { hidden: hiddenBillingCols, setHidden: setHiddenBillingCols } = useColumnVisibility(
    "sales-analysis.billing",
    billingColumns,
  )
  const { hidden: hiddenReceivableCols, setHidden: setHiddenReceivableCols } = useColumnVisibility(
    "sales-analysis.receivable",
    receivableColumns,
  )
  const { hidden: hiddenProductMarginCols, setHidden: setHiddenProductMarginCols } =
    useColumnVisibility("sales-analysis.product-margin", productMarginColumns)
  const sortedCustomers = useMemo(
    () => [...customers.items].sort((a, b) => b.total_sales_krw - a.total_sales_krw),
    [customers.items],
  )
  const customerRiskRows = useMemo(() => {
    return customers.items
      .map((item) => {
        const marginRate = item.avg_margin_rate ?? 0
        const overdueBoost = Math.min(2, item.oldest_outstanding_days / 60)
        const marginPenalty =
          item.avg_margin_rate == null
            ? 0
            : Math.max(0, 8 - marginRate) * item.total_sales_krw * 0.01
        const score = item.outstanding_krw * (1 + overdueBoost) + marginPenalty
        const signal =
          item.oldest_outstanding_days >= 60
            ? "연체"
            : item.outstanding_krw > 0
              ? "미수"
              : item.avg_margin_rate != null && item.avg_margin_rate < 8
                ? "저마진"
                : "정상"
        return { item, score, signal }
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [customers.items])
  const reconciliationRows = useMemo(() => {
    const engineDelta = moneyDelta(salesSummary.supply, margin.summary.total_revenue_krw)
    const engineDeltaRate = pct(
      engineDelta,
      Math.max(salesSummary.supply, margin.summary.total_revenue_krw),
    )
    const missingCostRate = pct(costMissingRevenue, margin.summary.total_revenue_krw)
    const outstandingRate = pct(
      customers.summary.total_outstanding_krw,
      customers.summary.total_sales_krw,
    )
    const rows: ReconciliationRow[] = [
      {
        key: "engine_delta",
        name: "매출원장 ↔ 이익엔진",
        value: formatKRW(engineDelta),
        sub: `${engineDeltaRate.toFixed(2)}% 차이`,
        count: engineDeltaCandidates.length,
        level: engineDeltaRate < 0.1 ? "good" : engineDeltaRate < 1 ? "watch" : "risk",
      },
      {
        key: "pending_invoice",
        name: "세금계산서 미발행",
        value: `${pendingInvoiceSales.length.toLocaleString("ko-KR")}건`,
        sub: formatKRW(pendingInvoiceRevenue),
        count: pendingInvoiceSales.length,
        level: pendingInvoiceRevenue === 0 ? "good" : "watch",
      },
      {
        key: "missing_cost",
        name: "원가 미연결",
        value: formatKRW(costMissingRevenue),
        sub: `${missingCostRate.toFixed(1)}%`,
        count: missingCostDetailRows.length,
        level: missingCostRate === 0 ? "good" : missingCostRate < 5 ? "watch" : "risk",
      },
      {
        key: "outstanding",
        name: "수금 미회수",
        value: formatKRW(customers.summary.total_outstanding_krw),
        sub: `${outstandingRate.toFixed(1)}%`,
        count: customerRiskRows.length,
        level: outstandingRate === 0 ? "good" : outstandingRate < 15 ? "watch" : "risk",
      },
    ]
    return rows
  }, [
    costMissingRevenue,
    customerRiskRows.length,
    customers.summary.total_outstanding_krw,
    customers.summary.total_sales_krw,
    engineDeltaCandidates.length,
    margin.summary.total_revenue_krw,
    missingCostDetailRows.length,
    pendingInvoiceRevenue,
    pendingInvoiceSales.length,
    salesSummary.supply,
  ])
  const engineDeltaAmount = moneyDelta(salesSummary.supply, margin.summary.total_revenue_krw)
  const activeReconciliationRow =
    reconciliationRows.find((row) => row.key === activeReconciliation) ?? reconciliationRows[0]
  const actionQueue = useMemo(() => {
    const actions: { title: string; value: string; detail: string }[] = []
    const topMissing = missingCostDetailRows[0] ?? missingCostRows[0]
    if (topMissing) {
      actions.push({
        title: "원가 연결",
        value: formatKRW(topMissing.missingRevenue),
        detail: `${topMissing.item.product_code} · ${"reason" in topMissing ? topMissing.reason.label : "원가부터 연결"}`,
      })
    }
    const topDrag = marginDragRows[0]
    if (topDrag) {
      actions.push({
        title: "저마진 방어",
        value: formatKRW(topDrag.dragKrw),
        detail: `${topDrag.item.product_code} 평균 대비 이익 누수`,
      })
    }
    const topCustomerRisk = customerRiskRows[0]
    if (topCustomerRisk) {
      actions.push({
        title: "수금 우선",
        value: formatKRW(topCustomerRisk.item.outstanding_krw),
        detail: `${topCustomerRisk.item.customer_name} · ${topCustomerRisk.signal}`,
      })
    }
    if (pendingInvoiceRevenue > 0) {
      actions.push({
        title: "계산서 발행",
        value: `${pendingInvoiceSales.length.toLocaleString("ko-KR")}건`,
        detail: `${formatKRW(pendingInvoiceRevenue)} 공급가 미발행`,
      })
    }
    if (actions.length === 0) {
      actions.push({ title: "정상 범위", value: "대기", detail: "큰 이익 누수 신호 없음" })
    }
    return actions.slice(0, 4)
  }, [
    customerRiskRows,
    marginDragRows,
    missingCostDetailRows,
    missingCostRows,
    pendingInvoiceRevenue,
    pendingInvoiceSales.length,
  ])
  const causeRows = useMemo(() => {
    const rows = marginDragRows.slice(0, 3).map((row) => ({
      key: `drag-${row.item.product_code}-${row.item.spec_wp}`,
      kind: "저마진",
      target: row.item.product_code,
      value: formatKRW(row.dragKrw),
      basis: `${row.item.margin_rate?.toFixed(1) ?? "—"}% · 평균 ${margin.summary.overall_margin_rate.toFixed(1)}%`,
    }))
    for (const row of missingCostRows.slice(0, 3)) {
      rows.push({
        key: `missing-${row.item.product_code}-${row.item.spec_wp}`,
        kind: "원가 없음",
        target: row.item.product_code,
        value: formatKRW(row.missingRevenue),
        basis: "이익률 계산 제외",
      })
    }
    return rows.slice(0, 6)
  }, [margin.summary.overall_margin_rate, marginDragRows, missingCostRows])
  const manufacturerLabel = manufacturerFilter
    ? (manufacturers.find((m) => m.manufacturer_id === manufacturerFilter)?.short_name ??
      manufacturers.find((m) => m.manufacturer_id === manufacturerFilter)?.name_kr ??
      "제조사")
    : "전체 제조사"

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">좌측 상단에서 법인을 선택해주세요.</div>
    )
  }

  if (state.loading) return <LoadingSpinner className="h-full" />

  const periodOptions = [
    { key: "all", label: "전체" },
    { key: "last3", label: "최근 3개월" },
    { key: "year", label: "올해" },
    { key: "custom", label: "직접 지정" },
  ]
  const marginFilterOptions = [
    { key: "all", label: "전체" },
    { key: "missing_cost", label: "원가 없음" },
    { key: "low_margin", label: "저마진" },
    { key: "negative_margin", label: "적자" },
  ]
  const topCustomer = sortedCustomers[0]
  const shownCustomers = sortedCustomers.slice(0, 8)
  const restCustomers = sortedCustomers.slice(8)
  const accumulateCustomer = (
    acc: {
      sales: number
      outstanding: number
      collected: number
      margin: number
      kw: number
      count: number
      outstandingCount: number
      oldestDays: number
      payDaysW: number
      payDaysS: number
      depW: number
      depS: number
    },
    item: (typeof customers.items)[number],
  ) => {
    const margin =
      item.avg_margin_rate != null ? (item.total_sales_krw * item.avg_margin_rate) / 100 : 0
    return {
      sales: acc.sales + item.total_sales_krw,
      outstanding: acc.outstanding + item.outstanding_krw,
      collected: acc.collected + item.total_collected_krw,
      margin: acc.margin + margin,
      kw: acc.kw + (customerKwMap.get(item.customer_id) ?? 0),
      count: acc.count + (customerCountMap.get(item.customer_id) ?? 0),
      outstandingCount: acc.outstandingCount + item.outstanding_count,
      oldestDays: Math.max(acc.oldestDays, item.oldest_outstanding_days),
      payDaysW:
        acc.payDaysW +
        (item.avg_payment_days != null ? item.avg_payment_days * item.total_sales_krw : 0),
      payDaysS: acc.payDaysS + (item.avg_payment_days != null ? item.total_sales_krw : 0),
      depW:
        acc.depW +
        (item.avg_deposit_rate != null ? item.avg_deposit_rate * item.total_sales_krw : 0),
      depS: acc.depS + (item.avg_deposit_rate != null ? item.total_sales_krw : 0),
    }
  }
  const zeroCustomerTotals = {
    sales: 0,
    outstanding: 0,
    collected: 0,
    margin: 0,
    kw: 0,
    count: 0,
    outstandingCount: 0,
    oldestDays: 0,
    payDaysW: 0,
    payDaysS: 0,
    depW: 0,
    depS: 0,
  }
  const shownCustomerTotals = shownCustomers.reduce(accumulateCustomer, zeroCustomerTotals)
  const restCustomerTotals = restCustomers.reduce(accumulateCustomer, zeroCustomerTotals)
  const showCustomerCol = (key: string) => !hiddenCustomerCols.has(key)
  const visibleCustomerColCount = customerMarginColumns.filter((c) => showCustomerCol(c.key)).length
  const showManufacturerCol = (key: string) => !hiddenManufacturerCols.has(key)
  const visibleManufacturerColCount = manufacturerColumns.filter((c) =>
    showManufacturerCol(c.key),
  ).length
  const showBillingCol = (key: string) => !hiddenBillingCols.has(key)
  const visibleBillingColCount = billingColumns.filter((c) => showBillingCol(c.key)).length
  const showReceivableCol = (key: string) => !hiddenReceivableCols.has(key)
  const visibleReceivableColCount = receivableColumns.filter((c) => showReceivableCol(c.key)).length
  const showProductMarginCol = (key: string) => !hiddenProductMarginCols.has(key)
  const visibleProductMarginColCount = productMarginColumns.filter((c) =>
    showProductMarginCol(c.key),
  ).length
  const allCustomerTotals = {
    sales: shownCustomerTotals.sales + restCustomerTotals.sales,
    outstanding: shownCustomerTotals.outstanding + restCustomerTotals.outstanding,
    collected: shownCustomerTotals.collected + restCustomerTotals.collected,
    margin: shownCustomerTotals.margin + restCustomerTotals.margin,
    kw: shownCustomerTotals.kw + restCustomerTotals.kw,
    count: shownCustomerTotals.count + restCustomerTotals.count,
    outstandingCount: shownCustomerTotals.outstandingCount + restCustomerTotals.outstandingCount,
    oldestDays: Math.max(shownCustomerTotals.oldestDays, restCustomerTotals.oldestDays),
    payDaysW: shownCustomerTotals.payDaysW + restCustomerTotals.payDaysW,
    payDaysS: shownCustomerTotals.payDaysS + restCustomerTotals.payDaysS,
    depW: shownCustomerTotals.depW + restCustomerTotals.depW,
    depS: shownCustomerTotals.depS + restCustomerTotals.depS,
  }
  const reportPeriodLabel =
    dateRange.dateFrom || dateRange.dateTo
      ? `${dateRange.dateFrom ?? "처음"}~${dateRange.dateTo ?? "현재"}`
      : "전체기간"
  const buildReportInput = () => ({
    periodLabel: reportPeriodLabel,
    costBasis,
    alternativeCostLabel: alternativeCostLabels[alternativeCostBasis],
    salesSummary,
    margin: {
      calculatedKrw: margin.summary.total_margin_krw,
      calculatedRate: margin.summary.overall_margin_rate,
    },
    adjusted: {
      margin: alternativeMarginSummary.adjustedMargin,
      marginRate: alternativeMarginSummary.adjustedMarginRate,
    },
    costCoverageRate,
    costMissingRevenue,
    customers: {
      outstandingKrw: customers.summary.total_outstanding_krw,
      outstandingCount: customers.items.filter((c) => c.outstanding_krw > 0).length,
    },
    monthly: monthlyManagementRows,
    bridge: marginBridge.rows,
    alternativeRows: alternativeMarginRows.map((row) => ({
      productCode: row.item.product_code,
      manufacturerName: row.item.manufacturer_name,
      missingRevenue: row.missingRevenue,
      altCostWp: row.altCostWp,
      altCostKrw: row.altCostKrw,
      adjustedMarginRate: row.adjustedMarginRate,
      reason: row.reasonLabel,
    })),
    manufacturerBreakdown: manufacturerDeepRows.map((row) => ({
      name: row.manufacturer,
      revenue: row.revenue,
      revenueShare: row.revenueShare,
      marginRate: row.marginRate,
      missingRate: row.missingRate,
    })),
    customerBreakdown: customers.items
      .slice()
      .sort((a, b) => b.total_sales_krw - a.total_sales_krw)
      .slice(0, 10)
      .map((c) => ({
        name: c.customer_name,
        sales: c.total_sales_krw,
        outstandingKrw: c.outstanding_krw,
        marginRate: c.avg_margin_rate ?? null,
        status: c.status,
      })),
  })
  const reportFileBase = `sales-management-${safeFilePart(reportPeriodLabel)}`
  const alternativeCostOptions = [
    { key: "manufacturer_avg", label: "제조사 평균" },
    { key: "portfolio_avg", label: "전체 평균" },
    { key: "target_margin", label: "목표마진" },
  ]

  return (
    <div className="sf-page">
      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChips
                options={periodOptions}
                value={period}
                onChange={(value) => setPeriod(value as PeriodFilter)}
              />
              {period === "custom" && (
                <>
                  <DateInput
                    value={customFrom}
                    onChange={setCustomFrom}
                    className="h-8 w-36 text-xs"
                    placeholder="시작일"
                  />
                  <DateInput
                    value={customTo}
                    onChange={setCustomTo}
                    className="h-8 w-36 text-xs"
                    placeholder="종료일"
                  />
                </>
              )}
              <div className="w-44">
                <PartnerCombobox
                  partners={partners}
                  value={customerFilter}
                  onChange={setCustomerFilter}
                  placeholder="전체 거래처"
                  includeAllOption
                  allLabel="전체 거래처"
                />
              </div>
              <Select
                value={manufacturerFilter || "all"}
                onValueChange={(v) => setManufacturerFilter(v === "all" ? "" : (v ?? ""))}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <span className="truncate">{manufacturerLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 제조사</SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>
                      {m.short_name || m.name_kr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* D-064 PR 30: 원가 기준 토글 — fifo 정합치 / landed 추정 / cif 추정 */}
              <Select
                value={costBasis}
                onValueChange={(v) => setCostBasis(v as CostBasis)}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <span className="truncate">
                    원가기준:{" "}
                    {costBasis === "fifo"
                      ? "FIFO 정합"
                      : costBasis === "landed"
                        ? "Landed"
                        : "CIF"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO 정합</SelectItem>
                  <SelectItem value="landed">Landed</SelectItem>
                  <SelectItem value="cif">CIF</SelectItem>
                </SelectContent>
              </Select>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="btn xs"
                  onClick={() =>
                    downloadSalesManagementPptx(buildReportInput(), `${reportFileBase}.pptx`)
                  }
                >
                  경영 리포트 (PPT)
                </button>
                <button type="button" className="btn xs" onClick={load}>
                  새로고침
                </button>
              </div>
            </div>
          </div>

          {state.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {state.error}
            </div>
          )}
          {state.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              {state.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <FilterChips
              options={salesAnalysisTabOptions}
              value={activeAnalysisTab}
              onChange={(value) => setActiveAnalysisTab(value as SalesAnalysisTab)}
            />
          </div>

          {activeAnalysisTab === "summary" && (
            <>
              {/* NumberTween formatter — '억' 단위 (krw 원본을 억으로 나눠 .toFixed(2)). */}
              {/* 모든 KPI 가 동일 패턴이라 inline closure 로 처리. */}
              <KpiStrip
                scopeId="sales-analysis"
                metrics={[
                  {
                    lbl: "공급가 매출",
                    v: (salesSummary.supply / 100000000).toFixed(2),
                    numericValue: salesSummary.supply,
                    formatter: (n: number) => (n / 100000000).toFixed(2),
                    u: "억",
                    sub: `${formatNumber(salesSummary.count)}건`,
                    tone: "solar" as const,
                    spark: supplySpark,
                    metricId: "sales_analysis.supply_amount",
                  },
                  {
                    key: "sales_analysis.margin_profit",
                    lbl: "계산 이익",
                    v: (margin.summary.total_margin_krw / 100000000).toFixed(2),
                    numericValue: margin.summary.total_margin_krw,
                    formatter: (n: number) => (n / 100000000).toFixed(2),
                    u: "억",
                    sub: `${formatKRW(costCoveredRevenue)} 기준`,
                    tone:
                      margin.summary.total_margin_krw >= 0 ? ("pos" as const) : ("neg" as const),
                    spark: flatSpark(Math.abs(margin.summary.total_margin_krw)),
                    metricId: "sales_analysis.margin_rate",
                  },
                  {
                    lbl: "이익률",
                    v: margin.summary.overall_margin_rate.toFixed(1),
                    numericValue: margin.summary.overall_margin_rate,
                    formatter: (n: number) => n.toFixed(1),
                    u: "%",
                    sub: `원가 연결률 ${costCoverageRate.toFixed(0)}%`,
                    tone:
                      margin.summary.overall_margin_rate >= 8
                        ? ("pos" as const)
                        : ("warn" as const),
                    spark: flatSpark(margin.summary.overall_margin_rate),
                    metricId: "sales_analysis.margin_rate",
                  },
                  {
                    key: "sales_analysis.adjusted_margin_rate",
                    lbl: "잠정 이익률",
                    v: alternativeMarginSummary.adjustedMarginRate.toFixed(1),
                    numericValue: alternativeMarginSummary.adjustedMarginRate,
                    formatter: (n: number) => n.toFixed(1),
                    u: "%",
                    sub: `${alternativeCostLabels[alternativeCostBasis]} · ${formatKRW(alternativeMarginSummary.estimatedCost)}`,
                    tone:
                      alternativeMarginSummary.adjustedMarginRate >= 8
                        ? ("pos" as const)
                        : ("warn" as const),
                    spark: flatSpark(alternativeMarginSummary.adjustedMarginRate),
                    metricId: "sales_analysis.adjusted_margin_rate",
                  },
                  {
                    lbl: "미수금",
                    v: (customers.summary.total_outstanding_krw / 100000000).toFixed(2),
                    numericValue: customers.summary.total_outstanding_krw,
                    formatter: (n: number) => (n / 100000000).toFixed(2),
                    u: "억",
                    sub: `수금 ${formatKRW(customers.summary.total_collected_krw)}`,
                    tone:
                      customers.summary.total_outstanding_krw > 0
                        ? ("warn" as const)
                        : ("pos" as const),
                    metricId: "receipts.remaining",
                  },
                  {
                    lbl: "계산서 미발행",
                    v: String(salesSummary.pending),
                    numericValue: salesSummary.pending,
                    formatter: (n: number) => String(Math.round(n)),
                    u: "건",
                    sub: `${formatNumber(salesSummary.issued)}건 발행 · ${salesSummary.issueRate}%`,
                    tone: salesSummary.pending > 0 ? ("warn" as const) : ("info" as const),
                    spark: issueRateSpark,
                    metricId: "sales_analysis.issue_rate",
                  },
                  {
                    key: "sales_analysis.cost_missing",
                    lbl: "원가 미연결",
                    v: (costMissingRevenue / 100000000).toFixed(2),
                    numericValue: costMissingRevenue,
                    formatter: (n: number) => (n / 100000000).toFixed(2),
                    u: "억",
                    sub: `${formatNumber(costMissingItemCount)}개 품목`,
                    tone: costMissingRevenue > 0 ? ("warn" as const) : ("pos" as const),
                  },
                  {
                    key: "sales_analysis.issue_rate",
                    lbl: "발행률",
                    v: salesSummary.issueRate.toFixed(0),
                    numericValue: salesSummary.issueRate,
                    formatter: (n: number) => n.toFixed(0),
                    u: "%",
                    sub: "계산서 발행 비율",
                    tone:
                      salesSummary.issueRate >= 95
                        ? ("pos" as const)
                        : salesSummary.issueRate >= 70
                          ? ("info" as const)
                          : ("warn" as const),
                    spark: issueRateSpark,
                  },
                  {
                    key: "sales_analysis.sold_kw",
                    lbl: "판매 용량",
                    v: formatNumber(margin.summary.total_sold_kw),
                    numericValue: margin.summary.total_sold_kw,
                    formatter: (n: number) => formatNumber(n),
                    u: "kW",
                    sub: "원가 매칭 가능 분",
                    tone: "info" as const,
                    spark: flatSpark(margin.summary.total_sold_kw),
                  },
                  {
                    key: "sales_analysis.collected",
                    lbl: "수금 완료",
                    v: (customers.summary.total_collected_krw / 100000000).toFixed(2),
                    numericValue: customers.summary.total_collected_krw,
                    formatter: (n: number) => (n / 100000000).toFixed(2),
                    u: "억",
                    sub:
                      customers.summary.total_sales_krw > 0
                        ? `회수율 ${(
                            (customers.summary.total_collected_krw /
                              customers.summary.total_sales_krw) *
                              100
                          ).toFixed(0)}%`
                        : "수금 데이터 없음",
                    tone: "pos" as const,
                    spark: flatSpark(customers.summary.total_collected_krw / 100000000),
                  },
                  {
                    key: "sales_analysis.customers",
                    lbl: "거래처",
                    v: String(customers.items.length),
                    numericValue: customers.items.length,
                    formatter: (n: number) => String(Math.round(n)),
                    u: "곳",
                    sub: "필터 기준 활성",
                    tone: "ink" as const,
                    spark: flatSpark(customers.items.length),
                  },
                  {
                    key: "sales_analysis.total_cost",
                    lbl: "총 원가",
                    v: (margin.summary.total_cost_krw / 100000000).toFixed(2),
                    numericValue: margin.summary.total_cost_krw,
                    formatter: (n: number) => (n / 100000000).toFixed(2),
                    u: "억",
                    sub: "원가 연결 분만",
                    tone: "ink" as const,
                    spark: flatSpark(margin.summary.total_cost_krw / 100000000),
                  },
                ]}
              >
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
                    spark={metric.spark}
                    metricId={metric.metricId}
                  />
                )}
              </KpiStrip>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <CardB title="이익 원인 분해" sub="저마진 · 원가 공백 우선순위">
                  <Table className="sf-motion-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>구분</TableHead>
                        <TableHead>대상</TableHead>
                        <TableHead className="text-right">규모</TableHead>
                        <TableHead className="text-right">근거</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody ref={causeRowsParent}>
                      {causeRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="text-xs">
                            <span
                              className={`sf-status-pill ${row.kind === "원가 없음" ? "sf-tone-warn" : "sf-tone-neg"}`}
                            >
                              {row.kind}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-medium">{row.target}</TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {row.value}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {row.basis}
                          </TableCell>
                        </TableRow>
                      ))}
                      {causeRows.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-8 text-center text-xs text-muted-foreground"
                          >
                            큰 이익 누수 신호가 없습니다
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardB>

                <CardB title="거래처 위험 우선순위" sub="미수 · 연체 · 저마진 복합 점수">
                  <Table className="sf-motion-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>거래처</TableHead>
                        <TableHead>신호</TableHead>
                        <TableHead className="text-right">미수</TableHead>
                        <TableHead className="text-right">이익률</TableHead>
                        <TableHead className="text-right">최장</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody ref={customerRiskParent}>
                      {customerRiskRows.map(({ item, signal }) => (
                        <TableRow key={item.customer_id}>
                          <TableCell className="text-xs font-medium">
                            {item.customer_name}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span
                              className={`sf-status-pill ${signal === "연체" ? "sf-tone-neg" : signal === "정상" ? "sf-tone-pos" : "sf-tone-warn"}`}
                            >
                              {signal}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {formatKRW(item.outstanding_krw)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {item.avg_margin_rate != null
                              ? `${item.avg_margin_rate.toFixed(1)}%`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {item.oldest_outstanding_days}일
                          </TableCell>
                        </TableRow>
                      ))}
                      {customerRiskRows.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-8 text-center text-xs text-muted-foreground"
                          >
                            우선 대응할 거래처 위험이 없습니다
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardB>
              </div>
            </>
          )}

          {activeAnalysisTab === "profit" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <CardB
                title="이익률 변동 브리지"
                sub={
                  marginBridge.prev && marginBridge.curr
                    ? `${marginBridge.prev.month} → ${marginBridge.curr.month}`
                    : "월별 비교"
                }
              >
                {marginBridge.prev && marginBridge.curr ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 border-b border-[var(--line)] px-4 py-3">
                      <div>
                        <div className="mono text-[10.5px] text-[var(--ink-3)]">이전월</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                          {marginBridge.prev.marginRate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="mono text-[10.5px] text-[var(--ink-3)]">최근월</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                          {marginBridge.curr.marginRate.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="mono text-[10.5px] text-[var(--ink-3)]">변동</div>
                        <div
                          className={`mt-1 text-sm font-semibold ${marginBridge.deltaRate >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}
                        >
                          {marginBridge.deltaRate >= 0 ? "+" : ""}
                          {marginBridge.deltaRate.toFixed(1)}p
                        </div>
                      </div>
                    </div>
                    <Table className="sf-motion-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>요인</TableHead>
                          <TableHead className="text-right">p.p.</TableHead>
                          <TableHead className="text-right">금액효과</TableHead>
                          <TableHead className="text-right">근거</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {marginBridge.rows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="text-xs">
                              <span className={`sf-status-pill ${levelTone(row.level)}`}>
                                {row.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium">
                              {row.pp >= 0 ? "+" : ""}
                              {row.pp.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {formatKRW(row.valueKrw)}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {row.detail}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : (
                  <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    비교 가능한 월별 이익 데이터가 부족합니다
                  </div>
                )}
              </CardB>

              <CardB
                title="대체원가 기준 마진"
                sub="원가 미연결 잠정 보정"
                right={
                  <FilterChips
                    options={alternativeCostOptions}
                    value={alternativeCostBasis}
                    onChange={(value) => setAlternativeCostBasis(value as AlternativeCostBasis)}
                  />
                }
              >
                <div className="grid grid-cols-3 gap-3 border-b border-[var(--line)] px-4 py-3">
                  <div>
                    <div className="mono text-[10.5px] text-[var(--ink-3)]">잠정 이익</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {formatKRW(alternativeMarginSummary.adjustedMargin)}
                    </div>
                  </div>
                  <div>
                    <div className="mono text-[10.5px] text-[var(--ink-3)]">잠정률</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {alternativeMarginSummary.adjustedMarginRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="mono text-[10.5px] text-[var(--ink-3)]">보정원가</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {formatKRW(alternativeMarginSummary.estimatedCost)}
                    </div>
                  </div>
                </div>
                <Table className="sf-motion-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>품목</TableHead>
                      <TableHead>기준</TableHead>
                      <TableHead className="text-right">미연결</TableHead>
                      <TableHead className="text-right">대체원가</TableHead>
                      <TableHead className="text-right">잠정률</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownAlternativeMarginRows.slice(0, 5).map((row) => (
                      <TableRow key={`${row.item.product_code}-${row.item.spec_wp}`}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{row.item.product_code}</div>
                          <div className="text-muted-foreground">
                            {row.reasonLabel ?? row.item.manufacturer_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{row.altCostLabel}</TableCell>
                        <TableCell className="text-right text-xs">
                          {formatKRW(row.missingRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {formatNumber(row.altCostWp)}원/Wp
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {row.adjustedMarginRate.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                    {shownAlternativeMarginRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-xs text-muted-foreground"
                        >
                          대체원가로 보정할 원가 미연결 품목이 없습니다
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardB>
            </div>
          )}

          {activeAnalysisTab === "manufacturer" && (
            <div className="grid grid-cols-1 gap-4">
              <CardB
                title="기여도"
                sub="매출 비중 · 이익률 · 원가 공백"
                right={
                  <ColumnVisibilityMenu
                    columns={manufacturerColumns}
                    hidden={hiddenManufacturerCols}
                    setHidden={setHiddenManufacturerCols}
                  />
                }
              >
                <Table className="sf-motion-table">
                  <TableHeader>
                    <TableRow>
                      {showManufacturerCol("name") && <TableHead>제조사</TableHead>}
                      {showManufacturerCol("revenue") && (
                        <TableHead className="text-right">매출</TableHead>
                      )}
                      {showManufacturerCol("share") && (
                        <TableHead className="text-right">비중</TableHead>
                      )}
                      {showManufacturerCol("margin_rate") && (
                        <TableHead className="text-right">이익률</TableHead>
                      )}
                      {showManufacturerCol("missing_rate") && (
                        <TableHead className="text-right">원가공백</TableHead>
                      )}
                      {showManufacturerCol("kw") && (
                        <TableHead className="text-right">출고(MW)</TableHead>
                      )}
                      {showManufacturerCol("qty") && (
                        <TableHead className="text-right">매출수량</TableHead>
                      )}
                      {showManufacturerCol("cost") && (
                        <TableHead className="text-right">매출원가</TableHead>
                      )}
                      {showManufacturerCol("margin") && (
                        <TableHead className="text-right">이익액</TableHead>
                      )}
                      {showManufacturerCol("count") && (
                        <TableHead className="text-right">거래건수</TableHead>
                      )}
                      {showManufacturerCol("unit_price") && (
                        <TableHead className="text-right">평균 단가</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody ref={manufacturerRowsParent}>
                    {manufacturerDeepRows.map((row) => {
                      const unitPriceWp = row.kw > 0 ? row.revenue / (row.kw * 1000) : null
                      return (
                        <TableRow key={row.manufacturer}>
                          {showManufacturerCol("name") && (
                            <TableCell className="text-xs font-medium">
                              {row.manufacturer}
                            </TableCell>
                          )}
                          {showManufacturerCol("revenue") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(row.revenue)}
                            </TableCell>
                          )}
                          {showManufacturerCol("share") && (
                            <TableCell className="text-right text-xs">
                              {row.revenueShare.toFixed(1)}%
                            </TableCell>
                          )}
                          {showManufacturerCol("margin_rate") && (
                            <TableCell className="text-right text-xs font-medium">
                              {row.marginRate != null ? `${row.marginRate.toFixed(1)}%` : "—"}
                            </TableCell>
                          )}
                          {showManufacturerCol("missing_rate") && (
                            <TableCell className="text-right text-xs">
                              {row.missingRate.toFixed(1)}%
                            </TableCell>
                          )}
                          {showManufacturerCol("kw") && (
                            <TableCell className="text-right text-xs">
                              {(row.kw / 1000).toFixed(1)}MW
                            </TableCell>
                          )}
                          {showManufacturerCol("qty") && (
                            <TableCell className="text-right text-xs">
                              {formatNumber(row.qty)}
                            </TableCell>
                          )}
                          {showManufacturerCol("cost") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(row.cost)}
                            </TableCell>
                          )}
                          {showManufacturerCol("margin") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(row.margin)}
                            </TableCell>
                          )}
                          {showManufacturerCol("count") && (
                            <TableCell className="text-right text-xs">
                              {row.saleCount.toLocaleString("ko-KR")}
                            </TableCell>
                          )}
                          {showManufacturerCol("unit_price") && (
                            <TableCell className="text-right text-xs">
                              {unitPriceWp != null ? `${unitPriceWp.toFixed(0)}원` : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                    {manufacturerDeepRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleManufacturerColCount}
                          className="py-8 text-center text-xs text-muted-foreground"
                        >
                          제조사별 분석 데이터가 없습니다
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardB>
            </div>
          )}

          {activeAnalysisTab === "reconciliation" && (
            <CardB title="원장 대사 체크" sub="클릭하면 후보 행까지 드릴다운">
              <div className="divide-y divide-[var(--line)]">
                {reconciliationRows.map((row) => {
                  const active = row.key === activeReconciliation
                  return (
                    <button
                      type="button"
                      key={row.key}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${active ? "bg-[var(--bg-2)]" : "hover:bg-[var(--bg-2)]"}`}
                      aria-pressed={active}
                      onClick={() => setActiveReconciliation(row.key)}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-[var(--ink)]">
                          {row.name}
                        </div>
                        <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">{row.sub}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {row.count > 0 ? (
                          <span className="mono text-[10.5px] text-[var(--ink-3)]">
                            {row.count.toLocaleString("ko-KR")}건
                          </span>
                        ) : null}
                        <span className="mono text-xs font-semibold">{row.value}</span>
                        <span className={`sf-status-pill ${levelTone(row.level)}`}>
                          {row.level === "good" ? "정상" : row.level === "watch" ? "주의" : "위험"}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div ref={reconciliationDetailParent} className="border-t border-[var(--line)] p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-[var(--ink)]">
                      {activeReconciliationRow?.name ?? "대사 상세"}
                    </div>
                    <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                      {activeReconciliationRow?.sub ?? "확인할 항목이 없습니다"}
                    </div>
                  </div>
                  {activeReconciliationRow ? (
                    <span className={`sf-status-pill ${levelTone(activeReconciliationRow.level)}`}>
                      {activeReconciliationRow.level === "good"
                        ? "정상"
                        : activeReconciliationRow.level === "watch"
                          ? "주의"
                          : "위험"}
                    </span>
                  ) : null}
                </div>

                {activeReconciliation === "engine_delta" && (
                  <div className="space-y-2">
                    {engineDeltaAmount === 0 ? (
                      <div className="rounded-md border border-[var(--line)] px-3 py-4 text-center text-xs text-muted-foreground">
                        매출원장 공급가와 이익엔진 매출이 일치합니다
                      </div>
                    ) : engineDeltaCandidates.length > 0 ? (
                      engineDeltaCandidates.map((row) => (
                        <div
                          key={row.sale.sale_id}
                          className="rounded-md border border-[var(--line)] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-[var(--ink)]">
                                {row.sale.customer_name ?? "거래처 없음"} ·{" "}
                                {row.sale.product_code ?? row.sale.product_name ?? "품목 없음"}
                              </div>
                              <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                                {compactDate(saleListItemDate(row.sale))} · {row.reason}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="mono text-xs font-semibold">
                                {formatKRW(row.amount)}
                              </span>
                              <a href={row.actionHref} className="btn xs">
                                열기
                              </a>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      topSalesForDeltaReview.map((sale) => (
                        <div
                          key={sale.sale_id}
                          className="rounded-md border border-[var(--line)] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-[var(--ink)]">
                                {sale.customer_name ?? "거래처 없음"} ·{" "}
                                {sale.product_code ?? sale.product_name ?? "품목 없음"}
                              </div>
                              <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                                직접 후보 없음 · 상위 매출 범위 확인
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="mono text-xs font-semibold">
                                {formatKRW(saleSupplyAmount(sale))}
                              </span>
                              <a href={salesActionHref(sale)} className="btn xs">
                                열기
                              </a>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeReconciliation === "pending_invoice" && (
                  <div className="space-y-2">
                    {pendingInvoiceSales.slice(0, 6).map((sale) => (
                      <div
                        key={sale.sale_id}
                        className="rounded-md border border-[var(--line)] px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-[var(--ink)]">
                              {sale.customer_name ?? "거래처 없음"} ·{" "}
                              {sale.product_code ?? sale.product_name ?? "품목 없음"}
                            </div>
                            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                              {compactDate(saleListItemDate(sale))} · 세금계산서 미발행
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="mono text-xs font-semibold">
                              {formatKRW(saleSupplyAmount(sale))}
                            </span>
                            <a href={salesActionHref(sale)} className="btn xs">
                              열기
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                    {pendingInvoiceSales.length === 0 && (
                      <div className="rounded-md border border-[var(--line)] px-3 py-4 text-center text-xs text-muted-foreground">
                        미발행 계산서가 없습니다
                      </div>
                    )}
                  </div>
                )}

                {activeReconciliation === "missing_cost" && (
                  <div className="space-y-3">
                    {missingCostReasonSummary.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {missingCostReasonSummary.map((row) => (
                          <div
                            key={row.reason.key}
                            className="rounded-md border border-[var(--line)] px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`sf-status-pill ${levelTone(row.reason.tone)}`}>
                                {row.reason.label}
                              </span>
                              <span className="mono text-xs font-semibold">
                                {formatKRW(row.revenue)}
                              </span>
                            </div>
                            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                              {row.count.toLocaleString("ko-KR")}개 품목
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {missingCostDetailRows.map((row) => (
                        <div
                          key={`${row.item.product_code}-${row.item.spec_wp}-${row.reason.key}`}
                          className="rounded-md border border-[var(--line)] px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-xs font-medium text-[var(--ink)]">
                                  {row.item.product_code} ·{" "}
                                  {moduleLabel(row.item.manufacturer_name, row.item.spec_wp)}
                                </span>
                                <span className={`sf-status-pill ${levelTone(row.reason.tone)}`}>
                                  {row.reason.label}
                                </span>
                              </div>
                              <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                                {row.reason.detail} · 매출{" "}
                                {row.relatedSales.length.toLocaleString("ko-KR")}건
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="mono text-xs font-semibold">
                                {formatKRW(row.missingRevenue)}
                              </span>
                              <a href={row.actionHref} className="btn xs">
                                {row.reason.actionLabel}
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                      {missingCostDetailRows.length === 0 && (
                        <div className="rounded-md border border-[var(--line)] px-3 py-4 text-center text-xs text-muted-foreground">
                          원가 미연결 품목이 없습니다
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeReconciliation === "outstanding" && (
                  <div className="space-y-2">
                    {customerRiskRows.map(({ item, signal }) => (
                      <div
                        key={item.customer_id}
                        className="rounded-md border border-[var(--line)] px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-[var(--ink)]">
                              {item.customer_name}
                            </div>
                            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                              {signal} · 최장 {item.oldest_outstanding_days}일 ·{" "}
                              {item.avg_margin_rate != null
                                ? `이익률 ${item.avg_margin_rate.toFixed(1)}%`
                                : "이익률 없음"}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="mono text-xs font-semibold">
                              {formatKRW(item.outstanding_krw)}
                            </span>
                            <a href={customerActionHref(item.customer_id)} className="btn xs">
                              열기
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                    {customerRiskRows.length === 0 && (
                      <div className="rounded-md border border-[var(--line)] px-3 py-4 text-center text-xs text-muted-foreground">
                        미회수 위험 거래처가 없습니다
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardB>
          )}

          {activeAnalysisTab === "profit" && (
            <div className="grid grid-cols-1 gap-4">
              <CardB title="월별 매출·이익" sub="공급가 기준 (이익=추정)" padded>
                {monthlyRevenueProfit.length === 0 ? (
                  <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                    매출 데이터가 없습니다
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={monthlyRevenueProfit}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: number) => `${Math.round(v / 100000000)}억`}
                      />
                      <Tooltip
                        formatter={(value, name) => [formatKRW(Number(value)), String(name)]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="revenue"
                        fill="#2563eb"
                        name="공급가"
                        isAnimationActive
                        animationDuration={360}
                        animationEasing="ease-out"
                      />
                      <Line
                        type="monotone"
                        dataKey="margin"
                        stroke="#16a34a"
                        strokeWidth={2}
                        name="이익"
                        dot={{ r: 3 }}
                        activeDot={{ r: 4 }}
                        isAnimationActive
                        animationDuration={360}
                        animationEasing="ease-out"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardB>
            </div>
          )}

          {activeAnalysisTab === "customer" && (
            <div className="grid grid-cols-1 gap-4">
              <CardB
                title="거래처별 매출·이익"
                sub="상위 8개 거래처 + 기타"
                padded
                right={
                  <ColumnVisibilityMenu
                    columns={customerMarginColumns}
                    hidden={hiddenCustomerCols}
                    setHidden={setHiddenCustomerCols}
                  />
                }
              >
                <Table className="sf-motion-table">
                  <TableHeader>
                    <TableRow>
                      {showCustomerCol("name") && <TableHead>거래처</TableHead>}
                      {showCustomerCol("sales") && (
                        <TableHead className="text-right">매출액</TableHead>
                      )}
                      {showCustomerCol("share") && (
                        <TableHead className="text-right">비중</TableHead>
                      )}
                      {showCustomerCol("margin_rate") && (
                        <TableHead className="text-right">이익률</TableHead>
                      )}
                      {showCustomerCol("margin") && (
                        <TableHead className="text-right">이익액</TableHead>
                      )}
                      {showCustomerCol("kw") && (
                        <TableHead className="text-right">출고(MW)</TableHead>
                      )}
                      {showCustomerCol("count") && (
                        <TableHead className="text-right">거래건수</TableHead>
                      )}
                      {showCustomerCol("outstanding") && (
                        <TableHead className="text-right">미수액</TableHead>
                      )}
                      {showCustomerCol("outstanding_rate") && (
                        <TableHead className="text-right">미수율</TableHead>
                      )}
                      {showCustomerCol("pay_days") && (
                        <TableHead className="text-right">평균회수일</TableHead>
                      )}
                      {showCustomerCol("deposit_rate") && (
                        <TableHead className="text-right">평균 입금률</TableHead>
                      )}
                      {showCustomerCol("unit_price") && (
                        <TableHead className="text-right">평균 단가</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody ref={customerRowsParent}>
                    {shownCustomers.map((item) => {
                      const share =
                        customers.summary.total_sales_krw > 0
                          ? (item.total_sales_krw / customers.summary.total_sales_krw) * 100
                          : 0
                      const marginAmount =
                        item.avg_margin_rate != null
                          ? (item.total_sales_krw * item.avg_margin_rate) / 100
                          : null
                      const kw = customerKwMap.get(item.customer_id) ?? 0
                      const count = customerCountMap.get(item.customer_id) ?? 0
                      const outstandingRate =
                        item.total_sales_krw > 0
                          ? (item.outstanding_krw / item.total_sales_krw) * 100
                          : null
                      const unitPriceWp = kw > 0 ? item.total_sales_krw / (kw * 1000) : null
                      return (
                        <TableRow key={item.customer_id}>
                          {showCustomerCol("name") && (
                            <TableCell className="text-xs font-medium">
                              {item.customer_name}
                            </TableCell>
                          )}
                          {showCustomerCol("sales") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(item.total_sales_krw)}
                            </TableCell>
                          )}
                          {showCustomerCol("share") && (
                            <TableCell className="text-right text-xs">
                              {share.toFixed(1)}%
                            </TableCell>
                          )}
                          {showCustomerCol("margin_rate") && (
                            <TableCell className="text-right text-xs">
                              {item.avg_margin_rate != null
                                ? `${item.avg_margin_rate.toFixed(1)}%`
                                : "—"}
                            </TableCell>
                          )}
                          {showCustomerCol("margin") && (
                            <TableCell className="text-right text-xs">
                              {marginAmount != null ? formatKRW(marginAmount) : "—"}
                            </TableCell>
                          )}
                          {showCustomerCol("kw") && (
                            <TableCell className="text-right text-xs">
                              {(kw / 1000).toFixed(1)}MW
                            </TableCell>
                          )}
                          {showCustomerCol("count") && (
                            <TableCell className="text-right text-xs">
                              {count.toLocaleString("ko-KR")}
                            </TableCell>
                          )}
                          {showCustomerCol("outstanding") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(item.outstanding_krw)}
                            </TableCell>
                          )}
                          {showCustomerCol("outstanding_rate") && (
                            <TableCell className="text-right text-xs">
                              {outstandingRate != null ? `${outstandingRate.toFixed(1)}%` : "—"}
                            </TableCell>
                          )}
                          {showCustomerCol("pay_days") && (
                            <TableCell className="text-right text-xs">
                              {item.avg_payment_days != null
                                ? `${item.avg_payment_days.toFixed(0)}일`
                                : "—"}
                            </TableCell>
                          )}
                          {showCustomerCol("deposit_rate") && (
                            <TableCell className="text-right text-xs">
                              {item.avg_deposit_rate != null
                                ? `${item.avg_deposit_rate.toFixed(1)}%`
                                : "—"}
                            </TableCell>
                          )}
                          {showCustomerCol("unit_price") && (
                            <TableCell className="text-right text-xs">
                              {unitPriceWp != null ? `${unitPriceWp.toFixed(0)}원` : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                    {restCustomers.length > 0 && (
                      <TableRow key="__rest__">
                        {showCustomerCol("name") && (
                          <TableCell className="text-xs font-medium text-muted-foreground">
                            기타 ({restCustomers.length}개)
                          </TableCell>
                        )}
                        {showCustomerCol("sales") && (
                          <TableCell className="text-right text-xs">
                            {formatKRW(restCustomerTotals.sales)}
                          </TableCell>
                        )}
                        {showCustomerCol("share") && (
                          <TableCell className="text-right text-xs">
                            {customers.summary.total_sales_krw > 0
                              ? `${((restCustomerTotals.sales / customers.summary.total_sales_krw) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("margin_rate") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.sales > 0
                              ? `${((restCustomerTotals.margin / restCustomerTotals.sales) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("margin") && (
                          <TableCell className="text-right text-xs">
                            {formatKRW(restCustomerTotals.margin)}
                          </TableCell>
                        )}
                        {showCustomerCol("kw") && (
                          <TableCell className="text-right text-xs">
                            {(restCustomerTotals.kw / 1000).toFixed(1)}MW
                          </TableCell>
                        )}
                        {showCustomerCol("count") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.count.toLocaleString("ko-KR")}
                          </TableCell>
                        )}
                        {showCustomerCol("outstanding") && (
                          <TableCell className="text-right text-xs">
                            {formatKRW(restCustomerTotals.outstanding)}
                          </TableCell>
                        )}
                        {showCustomerCol("outstanding_rate") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.sales > 0
                              ? `${((restCustomerTotals.outstanding / restCustomerTotals.sales) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("pay_days") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.payDaysS > 0
                              ? `${(restCustomerTotals.payDaysW / restCustomerTotals.payDaysS).toFixed(0)}일`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("deposit_rate") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.depS > 0
                              ? `${(restCustomerTotals.depW / restCustomerTotals.depS).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("unit_price") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.kw > 0
                              ? `${(restCustomerTotals.sales / (restCustomerTotals.kw * 1000)).toFixed(0)}원`
                              : "—"}
                          </TableCell>
                        )}
                      </TableRow>
                    )}
                    {customers.items.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleCustomerColCount}
                          className="py-8 text-center text-xs text-muted-foreground"
                        >
                          거래처 분석 데이터가 없습니다
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {shownCustomers.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        {showCustomerCol("name") && (
                          <TableCell className="text-xs font-medium">합계</TableCell>
                        )}
                        {showCustomerCol("sales") && (
                          <TableCell className="text-right text-xs font-medium">
                            {formatKRW(allCustomerTotals.sales)}
                          </TableCell>
                        )}
                        {showCustomerCol("share") && (
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {customers.summary.total_sales_krw > 0
                              ? `${((allCustomerTotals.sales / customers.summary.total_sales_krw) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("margin_rate") && (
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {allCustomerTotals.sales > 0
                              ? `${((allCustomerTotals.margin / allCustomerTotals.sales) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("margin") && (
                          <TableCell className="text-right text-xs font-medium">
                            {formatKRW(allCustomerTotals.margin)}
                          </TableCell>
                        )}
                        {showCustomerCol("kw") && (
                          <TableCell className="text-right text-xs font-medium">
                            {(allCustomerTotals.kw / 1000).toFixed(1)}MW
                          </TableCell>
                        )}
                        {showCustomerCol("count") && (
                          <TableCell className="text-right text-xs font-medium">
                            {allCustomerTotals.count.toLocaleString("ko-KR")}
                          </TableCell>
                        )}
                        {showCustomerCol("outstanding") && (
                          <TableCell className="text-right text-xs font-medium">
                            {formatKRW(allCustomerTotals.outstanding)}
                          </TableCell>
                        )}
                        {showCustomerCol("outstanding_rate") && (
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {allCustomerTotals.sales > 0
                              ? `${((allCustomerTotals.outstanding / allCustomerTotals.sales) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("pay_days") && (
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {allCustomerTotals.payDaysS > 0
                              ? `${(allCustomerTotals.payDaysW / allCustomerTotals.payDaysS).toFixed(0)}일`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("deposit_rate") && (
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {allCustomerTotals.depS > 0
                              ? `${(allCustomerTotals.depW / allCustomerTotals.depS).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showCustomerCol("unit_price") && (
                          <TableCell className="text-right text-xs font-medium">
                            {allCustomerTotals.kw > 0
                              ? `${(allCustomerTotals.sales / (allCustomerTotals.kw * 1000)).toFixed(0)}원`
                              : "—"}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardB>
            </div>
          )}

          {activeAnalysisTab === "billing" && (
            <div className="grid grid-cols-1 gap-4">
              <CardB
                title="거래처별 청구/미수"
                sub="상위 8개 거래처 + 기타"
                padded
                right={
                  <ColumnVisibilityMenu
                    columns={billingColumns}
                    hidden={hiddenBillingCols}
                    setHidden={setHiddenBillingCols}
                  />
                }
              >
                <Table className="sf-motion-table">
                  <TableHeader>
                    <TableRow>
                      {showBillingCol("name") && <TableHead>거래처</TableHead>}
                      {showBillingCol("sales") && (
                        <TableHead className="text-right">청구액</TableHead>
                      )}
                      {showBillingCol("outstanding") && (
                        <TableHead className="text-right">미수액</TableHead>
                      )}
                      {showBillingCol("outstanding_rate") && (
                        <TableHead className="text-right">미수율</TableHead>
                      )}
                      {showBillingCol("collected") && (
                        <TableHead className="text-right">회수액</TableHead>
                      )}
                      {showBillingCol("count") && (
                        <TableHead className="text-right">거래건수</TableHead>
                      )}
                      {showBillingCol("outstanding_count") && (
                        <TableHead className="text-right">미수건수</TableHead>
                      )}
                      {showBillingCol("oldest_days") && (
                        <TableHead className="text-right">최고연체일</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shownCustomers.map((item) => {
                      const outstandingRate =
                        item.total_sales_krw > 0
                          ? (item.outstanding_krw / item.total_sales_krw) * 100
                          : null
                      const count = customerCountMap.get(item.customer_id) ?? 0
                      return (
                        <TableRow key={item.customer_id}>
                          {showBillingCol("name") && (
                            <TableCell className="text-xs font-medium">
                              {item.customer_name}
                            </TableCell>
                          )}
                          {showBillingCol("sales") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(item.total_sales_krw)}
                            </TableCell>
                          )}
                          {showBillingCol("outstanding") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(item.outstanding_krw)}
                            </TableCell>
                          )}
                          {showBillingCol("outstanding_rate") && (
                            <TableCell className="text-right text-xs">
                              {outstandingRate != null ? `${outstandingRate.toFixed(1)}%` : "—"}
                            </TableCell>
                          )}
                          {showBillingCol("collected") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(item.total_collected_krw)}
                            </TableCell>
                          )}
                          {showBillingCol("count") && (
                            <TableCell className="text-right text-xs">
                              {count.toLocaleString("ko-KR")}
                            </TableCell>
                          )}
                          {showBillingCol("outstanding_count") && (
                            <TableCell className="text-right text-xs">
                              {item.outstanding_count.toLocaleString("ko-KR")}
                            </TableCell>
                          )}
                          {showBillingCol("oldest_days") && (
                            <TableCell className="text-right text-xs">
                              {item.oldest_outstanding_days > 0
                                ? `${item.oldest_outstanding_days}일`
                                : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                    {restCustomers.length > 0 && (
                      <TableRow key="__rest__">
                        {showBillingCol("name") && (
                          <TableCell className="text-xs font-medium text-muted-foreground">
                            기타 ({restCustomers.length}개)
                          </TableCell>
                        )}
                        {showBillingCol("sales") && (
                          <TableCell className="text-right text-xs">
                            {formatKRW(restCustomerTotals.sales)}
                          </TableCell>
                        )}
                        {showBillingCol("outstanding") && (
                          <TableCell className="text-right text-xs">
                            {formatKRW(restCustomerTotals.outstanding)}
                          </TableCell>
                        )}
                        {showBillingCol("outstanding_rate") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.sales > 0
                              ? `${((restCustomerTotals.outstanding / restCustomerTotals.sales) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showBillingCol("collected") && (
                          <TableCell className="text-right text-xs">
                            {formatKRW(restCustomerTotals.collected)}
                          </TableCell>
                        )}
                        {showBillingCol("count") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.count.toLocaleString("ko-KR")}
                          </TableCell>
                        )}
                        {showBillingCol("outstanding_count") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.outstandingCount.toLocaleString("ko-KR")}
                          </TableCell>
                        )}
                        {showBillingCol("oldest_days") && (
                          <TableCell className="text-right text-xs">
                            {restCustomerTotals.oldestDays > 0
                              ? `${restCustomerTotals.oldestDays}일`
                              : "—"}
                          </TableCell>
                        )}
                      </TableRow>
                    )}
                    {customers.items.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleBillingColCount}
                          className="py-8 text-center text-xs text-muted-foreground"
                        >
                          청구/미수 데이터가 없습니다
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {shownCustomers.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        {showBillingCol("name") && (
                          <TableCell className="text-xs font-medium">합계</TableCell>
                        )}
                        {showBillingCol("sales") && (
                          <TableCell className="text-right text-xs font-medium">
                            {formatKRW(allCustomerTotals.sales)}
                          </TableCell>
                        )}
                        {showBillingCol("outstanding") && (
                          <TableCell className="text-right text-xs font-medium">
                            {formatKRW(allCustomerTotals.outstanding)}
                          </TableCell>
                        )}
                        {showBillingCol("outstanding_rate") && (
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {allCustomerTotals.sales > 0
                              ? `${((allCustomerTotals.outstanding / allCustomerTotals.sales) * 100).toFixed(1)}%`
                              : "—"}
                          </TableCell>
                        )}
                        {showBillingCol("collected") && (
                          <TableCell className="text-right text-xs font-medium">
                            {formatKRW(allCustomerTotals.collected)}
                          </TableCell>
                        )}
                        {showBillingCol("count") && (
                          <TableCell className="text-right text-xs font-medium">
                            {allCustomerTotals.count.toLocaleString("ko-KR")}
                          </TableCell>
                        )}
                        {showBillingCol("outstanding_count") && (
                          <TableCell className="text-right text-xs font-medium">
                            {allCustomerTotals.outstandingCount.toLocaleString("ko-KR")}
                          </TableCell>
                        )}
                        {showBillingCol("oldest_days") && (
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {allCustomerTotals.oldestDays > 0
                              ? `${allCustomerTotals.oldestDays}일`
                              : "—"}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardB>
            </div>
          )}

          {activeAnalysisTab === "receivable" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <CardB
                title="미수 거래처"
                sub="연체일 · 미수액 · 회수 우선순위"
                right={
                  <ColumnVisibilityMenu
                    columns={receivableColumns}
                    hidden={hiddenReceivableCols}
                    setHidden={setHiddenReceivableCols}
                  />
                }
              >
                <Table className="sf-motion-table">
                  <TableHeader>
                    <TableRow>
                      {showReceivableCol("name") && <TableHead>거래처</TableHead>}
                      {showReceivableCol("signal") && <TableHead>신호</TableHead>}
                      {showReceivableCol("outstanding") && (
                        <TableHead className="text-right">미수액</TableHead>
                      )}
                      {showReceivableCol("margin_rate") && (
                        <TableHead className="text-right">이익률</TableHead>
                      )}
                      {showReceivableCol("oldest_days") && (
                        <TableHead className="text-right">최장 연체일</TableHead>
                      )}
                      {showReceivableCol("sales") && (
                        <TableHead className="text-right">매출액</TableHead>
                      )}
                      {showReceivableCol("outstanding_rate") && (
                        <TableHead className="text-right">미수율</TableHead>
                      )}
                      {showReceivableCol("outstanding_count") && (
                        <TableHead className="text-right">미수건수</TableHead>
                      )}
                      {showReceivableCol("pay_days") && (
                        <TableHead className="text-right">평균회수일</TableHead>
                      )}
                      {showReceivableCol("deposit_rate") && (
                        <TableHead className="text-right">평균 입금률</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerRiskRows.map(({ item, signal }) => {
                      const outstandingRate =
                        item.total_sales_krw > 0
                          ? (item.outstanding_krw / item.total_sales_krw) * 100
                          : null
                      return (
                        <TableRow key={item.customer_id}>
                          {showReceivableCol("name") && (
                            <TableCell className="text-xs font-medium">
                              {item.customer_name}
                            </TableCell>
                          )}
                          {showReceivableCol("signal") && (
                            <TableCell className="text-xs">
                              <span
                                className={`sf-status-pill ${signal === "연체" ? "sf-tone-neg" : signal === "정상" ? "sf-tone-pos" : "sf-tone-warn"}`}
                              >
                                {signal}
                              </span>
                            </TableCell>
                          )}
                          {showReceivableCol("outstanding") && (
                            <TableCell className="text-right text-xs font-medium">
                              {formatKRW(item.outstanding_krw)}
                            </TableCell>
                          )}
                          {showReceivableCol("margin_rate") && (
                            <TableCell className="text-right text-xs">
                              {item.avg_margin_rate != null
                                ? `${item.avg_margin_rate.toFixed(1)}%`
                                : "—"}
                            </TableCell>
                          )}
                          {showReceivableCol("oldest_days") && (
                            <TableCell className="text-right text-xs">
                              {item.oldest_outstanding_days}일
                            </TableCell>
                          )}
                          {showReceivableCol("sales") && (
                            <TableCell className="text-right text-xs">
                              {formatKRW(item.total_sales_krw)}
                            </TableCell>
                          )}
                          {showReceivableCol("outstanding_rate") && (
                            <TableCell className="text-right text-xs">
                              {outstandingRate != null ? `${outstandingRate.toFixed(1)}%` : "—"}
                            </TableCell>
                          )}
                          {showReceivableCol("outstanding_count") && (
                            <TableCell className="text-right text-xs">
                              {item.outstanding_count.toLocaleString("ko-KR")}
                            </TableCell>
                          )}
                          {showReceivableCol("pay_days") && (
                            <TableCell className="text-right text-xs">
                              {item.avg_payment_days != null
                                ? `${item.avg_payment_days.toFixed(0)}일`
                                : "—"}
                            </TableCell>
                          )}
                          {showReceivableCol("deposit_rate") && (
                            <TableCell className="text-right text-xs">
                              {item.avg_deposit_rate != null
                                ? `${item.avg_deposit_rate.toFixed(1)}%`
                                : "—"}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                    {customerRiskRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleReceivableColCount}
                          className="py-8 text-center text-xs text-muted-foreground"
                        >
                          미수 위험 거래처가 없습니다
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardB>

              <CardB title="수금/계산서 상태" sub="수금액 · 미수금 · 계산서 미발행" padded>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-[var(--line)] px-3 py-2">
                    <div className="mono text-[10.5px] text-[var(--ink-3)]">수금액</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {formatKRW(customers.summary.total_collected_krw)}
                    </div>
                  </div>
                  <div className="rounded-md border border-[var(--line)] px-3 py-2">
                    <div className="mono text-[10.5px] text-[var(--ink-3)]">미수금</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--warn)]">
                      {formatKRW(customers.summary.total_outstanding_krw)}
                    </div>
                  </div>
                  <div className="rounded-md border border-[var(--line)] px-3 py-2">
                    <div className="mono text-[10.5px] text-[var(--ink-3)]">계산서 미발행</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                      {salesSummary.pending.toLocaleString("ko-KR")}건
                    </div>
                  </div>
                </div>

                <div className="mt-4 divide-y divide-[var(--line)]">
                  {pendingInvoiceSales.slice(0, 6).map((sale) => (
                    <div
                      key={sale.sale_id}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[var(--ink)]">
                          {sale.customer_name ?? "거래처 없음"}
                        </div>
                        <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                          {compactDate(saleListItemDate(sale))} ·{" "}
                          {sale.product_code ?? sale.product_name ?? "품목 없음"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="mono font-semibold">
                          {formatKRW(saleSupplyAmount(sale))}
                        </span>
                        <a href={salesActionHref(sale)} className="btn xs">
                          열기
                        </a>
                      </div>
                    </div>
                  ))}
                  {pendingInvoiceSales.length === 0 && (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      미발행 계산서가 없습니다
                    </div>
                  )}
                </div>
              </CardB>
            </div>
          )}

          {activeAnalysisTab === "profit" && (
            <CardB
              title="품목별 이익 분석"
              sub="판매가 · 원가 · 이익/Wp"
              right={
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="테이블 검색"
                    className="h-8 w-44 rounded-md border border-[var(--line)] bg-[var(--bg-1)] px-2 text-xs"
                  />
                  <FilterChips
                    options={marginFilterOptions}
                    value={marginFilter}
                    onChange={(value) => setMarginFilter(value as MarginFilter)}
                  />
                  <ColumnVisibilityMenu
                    columns={productMarginColumns}
                    hidden={hiddenProductMarginCols}
                    setHidden={setHiddenProductMarginCols}
                  />
                </div>
              }
            >
              <Table className="sf-motion-table">
                <TableHeader>
                  <TableRow>
                    {showProductMarginCol("module") && <TableHead>모듈</TableHead>}
                    {showProductMarginCol("product") && <TableHead>품번 / 품명</TableHead>}
                    {showProductMarginCol("qty") && (
                      <TableHead className="text-right">수량</TableHead>
                    )}
                    {showProductMarginCol("sale_price") && (
                      <TableHead className="text-right">판매가</TableHead>
                    )}
                    {showProductMarginCol("cost_state") && <TableHead>원가상태</TableHead>}
                    {showProductMarginCol("cost") && (
                      <TableHead className="text-right">원가</TableHead>
                    )}
                    {showProductMarginCol("margin_wp") && (
                      <TableHead className="text-right">이익/Wp</TableHead>
                    )}
                    {showProductMarginCol("margin_rate") && (
                      <TableHead className="text-right">이익률</TableHead>
                    )}
                    {showProductMarginCol("revenue") && (
                      <TableHead className="text-right">매출</TableHead>
                    )}
                    {showProductMarginCol("margin") && (
                      <TableHead className="text-right">이익</TableHead>
                    )}
                    {showProductMarginCol("kw") && (
                      <TableHead className="text-right">출고(MW)</TableHead>
                    )}
                    {showProductMarginCol("sale_count") && (
                      <TableHead className="text-right">거래건수</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody ref={marginRowsParent}>
                  {shownMarginItems.map((item) => {
                    const costCovered = item.avg_cost_wp != null && item.total_cost_krw != null
                    return (
                      <TableRow
                        key={`${item.manufacturer_name}-${item.product_code}-${item.spec_wp}`}
                        className={!costCovered ? "bg-yellow-50/40" : undefined}
                      >
                        {showProductMarginCol("module") && (
                          <TableCell className="text-xs font-medium">
                            {moduleLabel(item.manufacturer_name, item.spec_wp)}
                          </TableCell>
                        )}
                        {showProductMarginCol("product") && (
                          <TableCell className="text-xs">
                            <div className="font-medium">{item.product_code}</div>
                            <div className="text-muted-foreground">{item.product_name}</div>
                          </TableCell>
                        )}
                        {showProductMarginCol("qty") && (
                          <TableCell className="text-right text-xs">
                            {formatNumber(item.total_sold_qty)}
                          </TableCell>
                        )}
                        {showProductMarginCol("sale_price") && (
                          <TableCell className="text-right text-xs">
                            {formatNumber(item.avg_sale_price_wp)}원
                          </TableCell>
                        )}
                        {showProductMarginCol("cost_state") && (
                          <TableCell className="text-xs">
                            {costCovered ? (
                              <span className="sf-status-pill sf-tone-pos">원가 연결</span>
                            ) : (
                              <span className="sf-status-pill sf-tone-warn">원가 없음</span>
                            )}
                          </TableCell>
                        )}
                        {showProductMarginCol("cost") && (
                          <TableCell className="text-right text-xs">
                            {item.avg_cost_wp != null ? `${formatNumber(item.avg_cost_wp)}원` : "—"}
                          </TableCell>
                        )}
                        {showProductMarginCol("margin_wp") && (
                          <TableCell className="text-right text-xs">
                            {item.margin_wp != null ? `${formatNumber(item.margin_wp)}원` : "—"}
                          </TableCell>
                        )}
                        {showProductMarginCol("margin_rate") && (
                          <TableCell className="text-right text-xs font-medium">
                            {item.margin_rate != null ? `${item.margin_rate.toFixed(1)}%` : "—"}
                          </TableCell>
                        )}
                        {showProductMarginCol("revenue") && (
                          <TableCell className="text-right text-xs">
                            {formatKRW(item.total_revenue_krw)}
                          </TableCell>
                        )}
                        {showProductMarginCol("margin") && (
                          <TableCell className="text-right text-xs font-medium">
                            {item.total_margin_krw != null ? formatKRW(item.total_margin_krw) : "—"}
                          </TableCell>
                        )}
                        {showProductMarginCol("kw") && (
                          <TableCell className="text-right text-xs">
                            {(item.total_sold_kw / 1000).toFixed(1)}MW
                          </TableCell>
                        )}
                        {showProductMarginCol("sale_count") && (
                          <TableCell className="text-right text-xs">
                            {item.sale_count.toLocaleString("ko-KR")}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                  {shownMarginItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={visibleProductMarginColCount}
                        className="py-8 text-center text-xs text-muted-foreground"
                      >
                        이익 분석 데이터가 없습니다
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {shownMarginItems.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      {showProductMarginCol("module") && (
                        <TableCell className="text-xs font-medium">합계</TableCell>
                      )}
                      {showProductMarginCol("product") && (
                        <TableCell className="text-xs text-muted-foreground">
                          {shownMarginItems.length.toLocaleString("ko-KR")}건
                        </TableCell>
                      )}
                      {showProductMarginCol("qty") && (
                        <TableCell className="text-right text-xs font-medium">
                          {formatNumber(shownMarginTotals.qty)}
                        </TableCell>
                      )}
                      {showProductMarginCol("sale_price") && <TableCell />}
                      {showProductMarginCol("cost_state") && (
                        <TableCell className="text-xs text-muted-foreground">
                          원가 연결 {shownMarginCoveredCount.toLocaleString("ko-KR")}건
                        </TableCell>
                      )}
                      {showProductMarginCol("cost") && <TableCell />}
                      {showProductMarginCol("margin_wp") && <TableCell />}
                      {showProductMarginCol("margin_rate") && (
                        <TableCell className="text-right text-xs font-medium">
                          {shownMarginTotals.rate.toFixed(1)}%
                        </TableCell>
                      )}
                      {showProductMarginCol("revenue") && (
                        <TableCell className="text-right text-xs font-medium">
                          {formatKRW(shownMarginTotals.revenue)}
                        </TableCell>
                      )}
                      {showProductMarginCol("margin") && (
                        <TableCell className="text-right text-xs font-medium">
                          {formatKRW(shownMarginTotals.margin)}
                        </TableCell>
                      )}
                      {showProductMarginCol("kw") && (
                        <TableCell className="text-right text-xs font-medium">
                          {(shownMarginTotals.kw / 1000).toFixed(1)}MW
                        </TableCell>
                      )}
                      {showProductMarginCol("sale_count") && (
                        <TableCell className="text-right text-xs font-medium">
                          {shownMarginTotals.saleCount.toLocaleString("ko-KR")}
                        </TableCell>
                      )}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardB>
          )}
        </section>

        <aside className="sf-procurement-rail card">
          <RailBlock title="이익 신뢰도" count="원가 연결률">
            <div className="bignum text-[30px] text-[var(--solar-3)]">
              {costCoverageRate.toFixed(0)}
              <span className="mono text-sm text-[var(--ink-3)]">%</span>
            </div>
            <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
              원가 연결 {formatKRW(costCoveredRevenue)} · 미연결 {formatKRW(costMissingRevenue)}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-[var(--bg-2)]">
              <div
                className="h-full bg-[var(--solar-2)]"
                style={{ width: `${Math.min(100, costCoverageRate)}%` }}
              />
            </div>
            <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="font-medium text-[var(--ink-2)]">계산 이익률</span>
                <span className="mono font-semibold text-[var(--ink)]">
                  {margin.summary.overall_margin_rate.toFixed(1)}%
                </span>
              </div>
              <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                계산 이익 {formatKRW(margin.summary.total_margin_krw)}
              </div>
            </div>
          </RailBlock>
          <RailBlock title="우선 조치" count={`${actionQueue.length}`}>
            <div className="space-y-2">
              {actionQueue.map((action, index) => (
                <div
                  key={`${action.title}-${index}`}
                  className={index ? "border-t border-[var(--line)] pt-2" : ""}
                >
                  <div className="flex justify-between gap-2 text-[11.5px]">
                    <span className="font-medium text-[var(--ink)]">{action.title}</span>
                    <span className="mono text-[var(--ink-2)]">{action.value}</span>
                  </div>
                  <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">{action.detail}</div>
                </div>
              ))}
            </div>
          </RailBlock>
          <RailBlock title="상위 거래처" count="매출">
            {sortedCustomers.slice(0, 5).map((item, index) => (
              <div
                key={item.customer_id}
                className={`py-2 ${index ? "border-t border-[var(--line)]" : ""}`}
              >
                <div className="flex justify-between gap-2 text-[11.5px]">
                  <span className="truncate text-[var(--ink-2)]">{item.customer_name}</span>
                  <span className="mono font-semibold text-[var(--ink)]">
                    {formatKRW(item.total_sales_krw)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-[var(--line)]">
                  <div
                    className="h-full bg-[var(--solar-2)]"
                    style={{
                      width: `${customers.summary.total_sales_krw ? Math.min(100, (item.total_sales_krw / customers.summary.total_sales_krw) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </RailBlock>
          <RailBlock title="수금 상태" last>
            <div className="space-y-2 text-[11.5px] text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>수금액</span>
                <span className="mono">{formatKRW(customers.summary.total_collected_krw)}</span>
              </div>
              <div className="flex justify-between">
                <span>미수금</span>
                <span className="mono text-[var(--warn)]">
                  {formatKRW(customers.summary.total_outstanding_krw)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>원가 연결</span>
                <span className="mono">
                  {coveredCostCount}/{margin.items.length}
                </span>
              </div>
            </div>
            {topCustomer ? (
              <div className="mono mt-3 text-[10.5px] text-[var(--ink-3)]">
                TOP · {topCustomer.customer_name}
              </div>
            ) : null}
          </RailBlock>
        </aside>
      </div>
    </div>
  )
}
