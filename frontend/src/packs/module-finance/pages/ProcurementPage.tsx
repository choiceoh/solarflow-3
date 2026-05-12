import { useState, useEffect, useRef, useMemo } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { History, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent } from "@/components/ui/tabs"

import { useAppStore } from "@/stores/appStore"
import {
  usePOList,
  usePOListPaged,
  useLCListPaged,
  useTTListPaged,
  usePOSummary,
  useLCSummary,
  useTTSummary,
} from "@/hooks/useProcurement"
import { fetchWithAuth } from "@/lib/api"
import LoadingSpinner from "@/components/common/LoadingSpinner"
import SkeletonRows from "@/components/common/SkeletonRows"
import EmptyState from "@/components/common/EmptyState"
import POListTable from "@/components/procurement/POListTable"
import PODetailView from "@/components/procurement/PODetailView"
import POCreateDialog from "@/components/procurement/POCreateDialog"
import LCCreateDialog from "@/components/procurement/LCCreateDialog"
import BLCreateDialog from "@/components/inbound/BLCreateDialog"
import TTCreateDialog, { type TTCreateInitialValues } from "@/components/procurement/TTCreateDialog"
import LCListTable from "@/components/procurement/LCListTable"
import TTListTable from "@/components/procurement/TTListTable"
import DepositStatusPanel from "@/components/procurement/DepositStatusPanel"
import ExcelToolbar from "@/components/excel/ExcelToolbar"
import {
  PO_STATUS_LABEL,
  CONTRACT_TYPE_LABEL,
  CONTRACT_TYPES_ACTIVE,
  LC_STATUS_LABEL,
  TT_STATUS_LABEL,
} from "@/types/procurement"
import type { PurchaseOrder, POStatus, LCStatus, TTStatus } from "@/types/procurement"
import type { Manufacturer, Bank } from "@/types/masters"
import { useBLListPaged, useBLSummary } from "@/hooks/useInbound"
import PaginationBar from "@/components/common/PaginationBar"
import { useServerSort } from "@/hooks/useServerSort"
import { useFxTimeseries } from "@/hooks/usePublicFx"
import BLListTable from "@/components/inbound/BLListTable"
import BLDetailView from "@/components/inbound/BLDetailView"
import {
  INBOUND_TYPE_LABEL,
  BL_STATUS_LABEL,
  type InboundType,
  type BLStatus,
} from "@/types/inbound"
import {
  CardB,
  CommandTopLine,
  FilterButton,
  FilterChips,
  RailBlock,
  Sparkline,
  TileB,
  type DateRangeValue,
} from "@/components/command/MockupPrimitives"

import { BreakdownRows } from "@/components/command/BreakdownRows"
import { KpiStrip } from "@/components/command/KpiStrip"
import { flatSparkFromValue, monthlyTrend, monthlyCount } from "@/templates/sparkUtils"

const PROCUREMENT_TABS = new Set(["po", "tt", "lc", "bl"])
const PROCUREMENT_DETAIL_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function safeDetailId(value: string | null): string | null {
  return value && PROCUREMENT_DETAIL_ID_RE.test(value) ? value : null
}

const fxNumberFmt = new Intl.NumberFormat("en-US")

const PROC_TAB_OPTIONS = [
  { key: "po", label: "PO" },
  { key: "tt", label: "계약금" },
  { key: "lc", label: "LC" },
  { key: "bl", label: "B/L" },
]

type ProcurementMetric = {
  lbl: string
  v: string
  /** NumberTween 보간을 위한 raw 숫자 값. formatter 와 함께 주어지면 카운트업. */
  numericValue?: number
  formatter?: (n: number) => string
  u?: string
  sub?: string
  tone: "solar" | "ink" | "info" | "warn" | "pos"
  delta?: string
  spark?: number[]
  metricId?: string
}

function fmtUsdM(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00"
  return (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)
}

function fmtMw(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00"
  return value.toFixed(value >= 100 ? 1 : 2)
}

function daysUntil(date?: string) {
  if (!date) return null
  const at = new Date(date)
  if (Number.isNaN(at.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  at.setHours(0, 0, 0, 0)
  return Math.ceil((at.getTime() - today.getTime()) / 86_400_000)
}

// 월요일 시작 ISO week. 현지 시간대 기준.
function weekStartOf(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay()
  const offset = day === 0 ? -6 : 1 - day
  r.setDate(r.getDate() + offset)
  r.setHours(0, 0, 0, 0)
  return r
}

function recentWeekStartKeys(count: number): string[] {
  const base = weekStartOf(new Date())
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i * 7)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export default function ProcurementPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId)
  const location = useLocation()
  const navigate = useNavigate()
  const initialTab = new URLSearchParams(location.search).get("tab") ?? "po"
  const [activeTab, setActiveTab] = useState(PROCUREMENT_TABS.has(initialTab) ? initialTab : "po")
  const focusLCId = safeDetailId(new URLSearchParams(location.search).get("lc_id"))
  const focusTTId = safeDetailId(new URLSearchParams(location.search).get("tt_id"))

  // 단가 탭은 /purchase-history로 통합 — query param ?tab=price 진입 시 새 페이지로 리다이렉트
  useEffect(() => {
    if (new URLSearchParams(location.search).get("tab") === "price") {
      navigate("/purchase-history", { replace: true })
    }
  }, [location.search, navigate])
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  // 계약금 탭용 전체 PO 목록 (필터 없음) — usePOList hook으로 관리하여 취소 처리 시 reloadPoList()로 동기화
  const { data: poList, reload: reloadPoList } = usePOList({})

  const [poStatusFilter, setPoStatusFilter] = useState("")
  const [poMfgFilter, setPoMfgFilter] = useState("")
  const [poTypeFilter, setPoTypeFilter] = useState("")
  const [poRiskFilter, setPoRiskFilter] = useState("")
  const [poDateRange, setPoDateRange] = useState<DateRangeValue>(null)
  const [poPage, setPoPage] = useState(1)
  const [poPageSize, setPoPageSize] = useState(100)
  // server sort — backend default (contract_date desc) 와 동일하게 시작.
  const poSort = useServerSort("contract_date", "desc", () => setPoPage(1))
  // 필터 변경 시 page 1 로 리셋.
  useEffect(() => {
    setPoPage(1)
  }, [poStatusFilter, poMfgFilter, poTypeFilter, poRiskFilter, poDateRange])
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  // R1-1: 사이드바 "발주/결제" 클릭 시 슬라이드 패널 닫기
  useEffect(() => {
    void location.key
    setSelectedPO(null)
  }, [location.key])
  useEffect(() => {
    const nextTab = new URLSearchParams(location.search).get("tab") ?? "po"
    if (PROCUREMENT_TABS.has(nextTab)) setActiveTab(nextTab)
  }, [location.search])
  // /purchase-history → /procurement?po_id=... 딥링크: pos 로드 후 자동 선택.
  // po_id는 URL을 통해 외부에서 조작 가능하므로 형식 검증 후에만 매칭 시도.
  useEffect(() => {
    const targetId = new URLSearchParams(location.search).get("po_id")
    if (!targetId || poList.length === 0) return
    if (!safeDetailId(targetId)) return
    const target = poList.find((p) => p.po_id === targetId)
    if (target) setSelectedPO(target)
  }, [location.search, poList])
  // 서버 페이지네이션 — 모든 필터 (status/mfg/contract_type/date_range) 가 server query.
  // 활성 탭만 fetch (lazy).
  const {
    items: pos,
    total: poTotal,
    loading: poLoading,
    error: poError,
    reload: reloadPO,
  } = usePOListPaged({
    status: poStatusFilter || undefined,
    manufacturer_id: poMfgFilter || undefined,
    contract_type: poTypeFilter || undefined,
    contract_date_from: poDateRange?.start,
    contract_date_to: poDateRange?.end,
    quick_filter: poRiskFilter || undefined,
    sort: poSort.queryParams.sort,
    order: poSort.queryParams.order,
    page: poPage,
    pageSize: poPageSize,
    enabled: activeTab === "po",
  })
  const { data: poSummary } = usePOSummary({
    status: poStatusFilter || undefined,
    manufacturer_id: poMfgFilter || undefined,
    contract_type: poTypeFilter || undefined,
    quick_filter: poRiskFilter || undefined,
  })

  const [lcAggVersion, setLcAggVersion] = useState(0)
  const [lcStatusFilter, setLcStatusFilter] = useState("")
  const [lcBankFilter, setLcBankFilter] = useState("")
  const [lcMfgFilter, setLcMfgFilter] = useState("")
  const [lcDateRange, setLcDateRange] = useState<DateRangeValue>(null)
  const [lcPage, setLcPage] = useState(1)
  const [lcPageSize, setLcPageSize] = useState(100)
  const lcSort = useServerSort("open_date", "desc", () => setLcPage(1))
  useEffect(() => {
    setLcPage(1)
  }, [lcStatusFilter, lcBankFilter, lcMfgFilter, lcDateRange])
  const {
    items: lcs,
    total: lcTotal,
    loading: lcLoading,
    error: lcError,
    reload: reloadLC,
  } = useLCListPaged({
    status: lcStatusFilter || undefined,
    bank_id: lcBankFilter || undefined,
    manufacturer_id: lcMfgFilter || undefined,
    open_date_from: lcDateRange?.start,
    open_date_to: lcDateRange?.end,
    sort: lcSort.queryParams.sort,
    order: lcSort.queryParams.order,
    page: lcPage,
    pageSize: lcPageSize,
    enabled: activeTab === "lc",
  })
  const { data: lcSummary } = useLCSummary({
    status: lcStatusFilter || undefined,
    bank_id: lcBankFilter || undefined,
    manufacturer_id: lcMfgFilter || undefined,
  })

  const [ttStatusFilter, setTtStatusFilter] = useState("")
  const [ttPoFilter, setTtPoFilter] = useState("")
  const [ttDateRange, setTtDateRange] = useState<DateRangeValue>(null)
  const [ttPage, setTtPage] = useState(1)
  const [ttPageSize, setTtPageSize] = useState(100)
  useEffect(() => {
    setTtPage(1)
  }, [ttStatusFilter, ttPoFilter, ttDateRange])
  const {
    items: tts,
    total: ttTotal,
    loading: ttLoading,
    reload: reloadTT,
  } = useTTListPaged({
    status: ttStatusFilter || undefined,
    po_id: ttPoFilter || undefined,
    remit_date_from: ttDateRange?.start,
    remit_date_to: ttDateRange?.end,
    page: ttPage,
    pageSize: ttPageSize,
    enabled: activeTab === "tt",
  })
  const { data: ttSummary } = useTTSummary({
    status: ttStatusFilter || undefined,
    po_id: ttPoFilter || undefined,
  })

  // BL 탭
  const [blTypeFilter, setBlTypeFilter] = useState("")
  const [blStatusFilter, setBlStatusFilter] = useState("")
  const [blMfgFilter, setBlMfgFilter] = useState("")
  const [blDateRange, setBlDateRange] = useState<DateRangeValue>(null)
  const [selectedBL, setSelectedBL] = useState<string | null>(null)
  useEffect(() => {
    const targetId = new URLSearchParams(location.search).get("bl_id")
    if (!targetId) return
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(targetId)) return
    setActiveTab("bl")
    setSelectedBL(targetId)
  }, [location.search])
  const [blsVersion, setBlsVersion] = useState(0)
  const [blPage, setBlPage] = useState(1)
  const [blPageSize, setBlPageSize] = useState(100)
  const blSort = useServerSort("eta", "desc", () => setBlPage(1))
  useEffect(() => {
    setBlPage(1)
  }, [blTypeFilter, blStatusFilter, blMfgFilter, blDateRange])
  const {
    items: bls,
    total: blTotal,
    loading: blLoading,
    reload: reloadBL,
  } = useBLListPaged({
    inbound_type: blTypeFilter || undefined,
    status: blStatusFilter || undefined,
    manufacturer_id: blMfgFilter || undefined,
    eta_from: blDateRange?.start,
    eta_to: blDateRange?.end,
    sort: blSort.queryParams.sort,
    order: blSort.queryParams.order,
    page: blPage,
    pageSize: blPageSize,
    enabled: activeTab === "bl",
  })
  const { data: blSummary } = useBLSummary({
    inbound_type: blTypeFilter || undefined,
    status: blStatusFilter || undefined,
    manufacturer_id: blMfgFilter || undefined,
  })

  const [depositMfgFilter, setDepositMfgFilter] = useState("")

  // PO/LC 신규 등록 다이얼로그.
  const [poCreateOpen, setPoCreateOpen] = useState(false)
  const [lcCreateOpen, setLcCreateOpen] = useState(false)
  const [blCreateOpen, setBlCreateOpen] = useState(false)
  const [ttCreateOpen, setTtCreateOpen] = useState(false)
  const [ttCreateInitial, setTtCreateInitial] = useState<TTCreateInitialValues | null>(null)
  const [lcCreateInitial, setLcCreateInitial] = useState<{
    poId?: string
    poLineId?: string
    targetQty?: number
    amountUsd?: number
  } | null>(null)

  // 우측 슬라이드 패널 — 드래그 리사이즈
  const [panelWidth, setPanelWidth] = useState(900)
  const panelRef = useRef<HTMLDivElement>(null)

  function onDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = panelWidth
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX
      setPanelWidth(Math.max(520, Math.min(window.innerWidth - 60, startW + delta)))
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  // ESC 키로 패널 닫기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedPO) {
        setSelectedPO(null)
        reloadPO()
        reloadPoList()
        setLcAggVersion((v) => v + 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [selectedPO, reloadPO, reloadPoList])

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>("/api/v1/manufacturers")
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`)
        .then((list) => setBanks(list.filter((b) => b.is_active)))
        .catch(() => {})
    }
  }, [selectedCompanyId])

  // USD/KRW 시계열 — LC 탭 우측 레일(30일) + PO 탭 JKO 12주 단가 변환(90일).
  const fxDays = activeTab === "po" ? 90 : 30
  const fxEnabled = activeTab === "lc" || activeTab === "po"
  const { data: fx } = useFxTimeseries("usdkrw", fxDays, fxEnabled)

  // ⚠️ 모든 useMemo는 early return(아래 selectedCompanyId 분기) 이전이어야 함 — Hook 순서 규칙
  const poRows = useMemo(
    () =>
      pos.map((p) => {
        const mfg = manufacturers.find((m) => m.manufacturer_id === p.manufacturer_id)
        return {
          ...p,
          manufacturer_name: mfg?.short_name?.trim() || mfg?.name_kr || p.manufacturer_name || "—",
        }
      }),
    [pos, manufacturers],
  )
  // 칩 필터(lcs)에서 이미 manufacturer_id 까지 적용됨.
  const lcRows = lcs
  const blRows = useMemo(
    () =>
      bls.map((bl) => ({
        ...bl,
        manufacturer_name:
          bl.manufacturer_name ??
          manufacturers.find((m) => m.manufacturer_id === bl.manufacturer_id)?.name_kr ??
          "—",
      })),
    [bls, manufacturers],
  )

  const poActiveCount =
    poSummary?.active_count ??
    poRows.filter((po) => !["completed", "cancelled"].includes(po.status)).length
  const poTotalMw = poSummary?.total_mw ?? poRows.reduce((sum, po) => sum + (po.total_mw ?? 0), 0)
  const poShippingCount =
    poSummary?.shipping_count ??
    poRows.filter((po) => po.status === "shipping" || po.status === "in_progress").length
  const poTotalCount = poSummary?.total ?? poRows.length
  const lcTotalUsd =
    lcSummary?.amount_usd ?? lcRows.reduce((sum, lc) => sum + (lc.amount_usd ?? 0), 0)
  const lcOpenedCount =
    lcSummary?.opened_count ??
    lcRows.filter((lc) => lc.status === "opened" || lc.status === "docs_received").length
  const lcTotalCount = lcSummary?.total ?? lcRows.length
  const lcMaturitySoon = useMemo(
    () =>
      lcRows.filter((lc) => {
        const d = daysUntil(lc.maturity_date)
        return (
          d != null && d >= 0 && d <= 30 && lc.status !== "settled" && lc.status !== "cancelled"
        )
      }),
    [lcRows],
  )
  const lcMaturitySoonCount = lcSummary?.maturity_soon_count ?? lcMaturitySoon.length
  const blActiveCount =
    blSummary?.active_count ??
    blRows.filter((bl) => !["completed", "erp_done"].includes(bl.status)).length
  const blShippingCount =
    blSummary != null
      ? blSummary.shipping_count + blSummary.arrived_count
      : blRows.filter((bl) => bl.status === "shipping" || bl.status === "arrived").length
  const blCustomsCount =
    blSummary?.customs_count ?? blRows.filter((bl) => bl.status === "customs").length
  const blTotalCount = blSummary?.total ?? blRows.length
  const ttCompletedUsd =
    ttSummary?.completed_amount_usd ??
    tts.filter((tt) => tt.status === "completed").reduce((sum, tt) => sum + (tt.amount_usd ?? 0), 0)
  const ttTotalCount = ttSummary?.total ?? tts.length

  // JKO · 12주 단가 — poList(공급사 필터 없는 전체 PO)에서 JKO 매뉴팩처러 발주만 추려
  // 주차별 가중 USD/Wp → 해당 주 환율로 KRW/Wp 환산. 포워드/백워드 fill 적용.
  const jkoMfg = useMemo(
    () =>
      manufacturers.find((m) => {
        const s = (m.short_name ?? "").trim().toUpperCase()
        if (s === "JKO") return true
        const en = (m.name_en ?? "").toLowerCase()
        return en.includes("jinko")
      }),
    [manufacturers],
  )
  const jkoTrend = useMemo(() => {
    if (!jkoMfg || !fx || fx.series.length === 0) return null
    const weekKeys = recentWeekStartKeys(12)
    const earliest = weekKeys[0]

    const aggMap = new Map<string, { usdSum: number; weight: number }>()
    for (const k of weekKeys) aggMap.set(k, { usdSum: 0, weight: 0 })

    for (const po of poList) {
      if (po.manufacturer_id !== jkoMfg.manufacturer_id) continue
      if (!po.contract_date) continue
      const usd = po.line_total_usd ?? 0
      const wp = po.line_total_wp ?? 0
      if (usd <= 0 || wp <= 0) continue
      const dt = new Date(po.contract_date)
      if (Number.isNaN(dt.getTime())) continue
      const key = weekStartOf(dt).toISOString().slice(0, 10)
      if (key < earliest) continue
      const a = aggMap.get(key)
      if (!a) continue
      a.usdSum += usd
      a.weight += wp
    }

    const fxByDate = new Map(fx.series.map((p) => [p.date, p.rate] as const))
    const latestFx = fx.latest ?? fx.series[fx.series.length - 1]?.rate ?? null
    const fxAt = (dateStr: string): number => {
      const d = new Date(dateStr)
      for (let i = 0; i < 14; i++) {
        const t = new Date(d)
        t.setDate(t.getDate() - i)
        const r = fxByDate.get(t.toISOString().slice(0, 10))
        if (r) return r
      }
      return latestFx ?? 1365
    }

    const raw: (number | null)[] = weekKeys.map((k) => {
      const a = aggMap.get(k)!
      if (a.weight === 0) return null
      const usdWp = a.usdSum / a.weight
      return usdWp * fxAt(k)
    })
    if (!raw.some((v) => v != null)) return null

    let prev: number | null = null
    const ff: (number | null)[] = raw.map((v) => {
      if (v != null) prev = v
      return prev
    })
    let next: number | null = null
    const filled = new Array<number>(ff.length).fill(0)
    for (let i = ff.length - 1; i >= 0; i--) {
      if (ff[i] != null) next = ff[i]
      filled[i] = next ?? 0
    }
    if (filled.every((v) => v === 0)) return null

    const current = filled[filled.length - 1]
    const first = filled.find((v) => v > 0) ?? 0
    const deltaPct = first > 0 ? ((current - first) / first) * 100 : 0
    return { data: filled, current, deltaPct }
  }, [poList, jkoMfg, fx])

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    )
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    navigate(tab === "po" ? "/procurement" : `/procurement?tab=${tab}`, { replace: true })
  }

  const openLCCreate = (initial?: typeof lcCreateInitial) => {
    setLcCreateInitial(initial ?? null)
    setLcCreateOpen(true)
  }

  const handleSettleLC = async (
    lc: import("@/types/procurement").LCRecord,
    repaymentDate: string,
  ) => {
    await fetchWithAuth(`/api/v1/lcs/${lc.lc_id}`, {
      method: "PUT",
      body: JSON.stringify({ repaid: true, repayment_date: repaymentDate, status: "settled" }),
    })
    reloadLC()
  }

  const selectedRailPO = selectedPO ?? poRows[0] ?? null

  const pageTitle =
    activeTab === "lc"
      ? "L/C 개설 · 한도"
      : activeTab === "bl"
        ? "B/L · 입고 진행"
        : activeTab === "tt"
          ? "계약금 · T/T 송금"
          : "P/O 발주 관리"
  const pageSub =
    activeTab === "lc"
      ? `${lcTotalCount}건 · USD ${fmtUsdM(lcTotalUsd)}M`
      : activeTab === "bl"
        ? `${blTotalCount}건 · 진행 ${blActiveCount}건`
        : activeTab === "tt"
          ? `${ttTotalCount}건 · 완료 USD ${fmtUsdM(ttCompletedUsd)}M`
          : `${poTotalCount}건 · ${fmtMw(poTotalMw)} MW`
  // KPI sparkline 시계열 — 데이터 범위 기반 (최근 6개월 캡, sparkUtils 참고).
  const lcOpenSpark = monthlyCount(lcRows, (l) => l.open_date)
  const lcAmountSpark = monthlyTrend(
    lcRows,
    (l) => l.open_date,
    (l) => (l.amount_usd ?? 0) / 1_000_000,
  )
  const blDateOf = (b: (typeof blRows)[number]) => b.actual_arrival ?? b.eta ?? b.etd ?? null
  const blAllSpark = monthlyCount(blRows, blDateOf)
  const ttSpark = monthlyCount(tts, (t) => t.remit_date)
  const ttAmountSpark = monthlyTrend(
    tts.filter((t) => t.status === "completed"),
    (t) => t.remit_date,
    (t) => (t.amount_usd ?? 0) / 1_000_000,
  )
  const poSpark = monthlyCount(poRows, (p) => p.contract_date)

  const fmtCount = (n: number) => String(Math.round(n))
  const lcBanksCount = lcSummary?.bank_count ?? new Set(lcRows.map((lc) => lc.bank_id)).size
  const lcSettledCount = lcSummary?.by_status?.settled ?? lcRows.filter((lc) => lc.status === "settled").length
  const lcAmountAvgUsd = lcTotalCount > 0 ? lcTotalUsd / lcTotalCount : 0
  const lcProgressRate = lcTotalCount > 0 ? (lcOpenedCount / lcTotalCount) * 100 : 0
  const blCompletedCount = blSummary?.completed_count ?? blRows.filter((bl) => bl.status === "completed").length
  const blErpDoneCount = blSummary?.erp_done_count ?? blRows.filter((bl) => bl.status === "erp_done").length
  const blArrivedCount = blSummary?.arrived_count ?? blRows.filter((bl) => bl.status === "arrived").length
  const blScheduledCount = blSummary?.scheduled_count ?? blRows.filter((bl) => bl.status === "scheduled").length
  const ttCompletedCount = ttSummary?.completed_count ?? tts.filter((t) => t.status === "completed").length
  const ttAvgAmountUsd = ttTotalCount > 0 ? ttCompletedUsd / ttTotalCount : 0
  const poChangedCount = poRows.filter((p) => (p.parent_po_id ?? null) != null).length
  const poAvgMw = poTotalCount > 0 ? poTotalMw / poTotalCount : 0
  const blImportCount =
    blSummary?.import_count ?? blRows.filter((bl) => bl.inbound_type === "import").length
  const ttPlannedCount =
    ttSummary?.planned_count ?? tts.filter((tt) => tt.status === "planned").length
  const ttPoCount = ttSummary?.po_count ?? new Set(tts.map((tt) => tt.po_id)).size
  const contractTypesCount =
    Object.keys(poSummary?.by_contract_type ?? {}).length ||
    new Set(poRows.map((po) => po.contract_type)).size
  const metrics: ProcurementMetric[] =
    activeTab === "lc"
      ? [
          {
            lbl: "L/C 전체",
            v: String(lcTotalCount),
            numericValue: lcTotalCount,
            formatter: fmtCount,
            u: "건",
            sub: `사용중 ${lcOpenedCount}건`,
            tone: "solar" as const,
            spark: lcOpenSpark,
            metricId: "procurement.lc_total",
          },
          {
            lbl: "개설 금액",
            v: fmtUsdM(lcTotalUsd),
            numericValue: lcTotalUsd,
            formatter: fmtUsdM,
            u: "M$",
            sub: "활성 필터 기준",
            tone: "warn" as const,
            spark: lcAmountSpark,
            metricId: "procurement.lc_amount",
          },
          {
            lbl: "만기 30일",
            v: String(lcMaturitySoonCount),
            numericValue: lcMaturitySoonCount,
            formatter: fmtCount,
            u: "건",
            sub: lcMaturitySoon[0]?.lc_number ?? "긴급 만기 없음",
            tone: "info" as const,
            metricId: "procurement.lc_maturity",
          },
          {
            lbl: "은행",
            v: String(lcBanksCount),
            numericValue: lcBanksCount,
            formatter: fmtCount,
            u: "곳",
            sub: "한도 사용처",
            tone: "ink" as const,
            metricId: "procurement.lc_banks",
          },
          {
            lbl: "결제 완료",
            v: String(lcSettledCount),
            numericValue: lcSettledCount,
            formatter: fmtCount,
            u: "건",
            sub: "settled",
            tone: "pos" as const,
            metricId: "procurement.lc_settled",
          },
          {
            lbl: "평균 개설액",
            v: fmtUsdM(lcAmountAvgUsd),
            numericValue: lcAmountAvgUsd,
            formatter: fmtUsdM,
            u: "M$",
            sub: "필터 기준",
            tone: "ink" as const,
            metricId: "procurement.lc_avg_amount",
          },
          {
            lbl: "진행률",
            v: lcProgressRate.toFixed(1),
            numericValue: lcProgressRate,
            formatter: (n: number) => n.toFixed(1),
            u: "%",
            sub: "opened / total",
            tone: "info" as const,
            metricId: "procurement.lc_progress",
          },
        ]
      : activeTab === "bl"
        ? [
            {
              lbl: "B/L 전체",
              v: String(blTotalCount),
              numericValue: blTotalCount,
              formatter: fmtCount,
              u: "건",
              sub: `진행 ${blActiveCount}건`,
              tone: "solar" as const,
              spark: blAllSpark,
              metricId: "procurement.bl_total",
            },
            {
              lbl: "선적/입항",
              v: String(blShippingCount),
              numericValue: blShippingCount,
              formatter: fmtCount,
              u: "건",
              sub: "해상 운송 구간",
              tone: "info" as const,
              spark: monthlyCount(
                blRows.filter((b) => b.status === "shipping" || b.status === "arrived"),
                blDateOf,
              ),
              metricId: "procurement.bl_shipping",
            },
            {
              lbl: "통관중",
              v: String(blCustomsCount),
              numericValue: blCustomsCount,
              formatter: fmtCount,
              u: "건",
              sub: "면장 확인 필요",
              tone: "warn" as const,
              spark: monthlyCount(
                blRows.filter((b) => b.status === "customs"),
                blDateOf,
              ),
              metricId: "procurement.bl_customs",
            },
            {
              lbl: "해외직수입",
              v: String(blImportCount),
              numericValue: blImportCount,
              formatter: fmtCount,
              u: "건",
              sub: "OCR 자동입력 대상",
              tone: "pos" as const,
              spark: monthlyCount(
                blRows.filter((bl) => bl.inbound_type === "import"),
                blDateOf,
              ),
              metricId: "procurement.bl_import",
            },
            {
              lbl: "입항",
              v: String(blArrivedCount),
              numericValue: blArrivedCount,
              formatter: fmtCount,
              u: "건",
              sub: "통관 대기",
              tone: "info" as const,
              metricId: "procurement.bl_arrived",
            },
            {
              lbl: "입고 예정",
              v: String(blScheduledCount),
              numericValue: blScheduledCount,
              formatter: fmtCount,
              u: "건",
              sub: "ETD 등록 전 포함",
              tone: "ink" as const,
              metricId: "procurement.bl_scheduled",
            },
            {
              lbl: "입고 완료",
              v: String(blCompletedCount),
              numericValue: blCompletedCount,
              formatter: fmtCount,
              u: "건",
              sub: "재고 반영",
              tone: "pos" as const,
              metricId: "procurement.bl_completed",
            },
            {
              lbl: "ERP 마감",
              v: String(blErpDoneCount),
              numericValue: blErpDoneCount,
              formatter: fmtCount,
              u: "건",
              sub: "회계 처리 완료",
              tone: "pos" as const,
              metricId: "procurement.bl_erp_done",
            },
          ]
        : activeTab === "tt"
          ? [
              {
                lbl: "T/T 이력",
                v: String(ttTotalCount),
                numericValue: ttTotalCount,
                formatter: fmtCount,
                u: "건",
                sub: "계약금/잔금 송금",
                tone: "solar" as const,
                spark: ttSpark,
                metricId: "procurement.tt_total",
              },
              {
                lbl: "완료 금액",
                v: fmtUsdM(ttCompletedUsd),
                numericValue: ttCompletedUsd,
                formatter: fmtUsdM,
                u: "M$",
                sub: "completed 기준",
                tone: "pos" as const,
                spark: ttAmountSpark,
                metricId: "procurement.tt_completed",
              },
              {
                lbl: "대기",
                v: String(ttPlannedCount),
                numericValue: ttPlannedCount,
                formatter: fmtCount,
                u: "건",
                sub: "송금 예정",
                tone: "warn" as const,
                spark: monthlyCount(
                  tts.filter((t) => t.status === "planned"),
                  (t) => t.remit_date,
                ),
                metricId: "procurement.tt_planned",
              },
              {
                lbl: "PO 연결",
                v: String(ttPoCount),
                numericValue: ttPoCount,
                formatter: fmtCount,
                u: "건",
                sub: "계약금 집계 대상",
                tone: "ink" as const,
                metricId: "procurement.tt_po_linked",
              },
              {
                lbl: "완료 건수",
                v: String(ttCompletedCount),
                numericValue: ttCompletedCount,
                formatter: fmtCount,
                u: "건",
                sub: "송금 처리",
                tone: "pos" as const,
                metricId: "procurement.tt_completed_count",
              },
              {
                lbl: "평균 송금",
                v: fmtUsdM(ttAvgAmountUsd),
                numericValue: ttAvgAmountUsd,
                formatter: fmtUsdM,
                u: "M$",
                sub: "건당 평균",
                tone: "ink" as const,
                metricId: "procurement.tt_avg_amount",
              },
              {
                lbl: "PO 미연결",
                v: String(Math.max(0, ttTotalCount - ttPoCount)),
                numericValue: Math.max(0, ttTotalCount - ttPoCount),
                formatter: fmtCount,
                u: "건",
                sub: "할당 검토",
                tone: ttTotalCount > ttPoCount ? ("warn" as const) : ("pos" as const),
                metricId: "procurement.tt_orphan",
              },
            ]
          : [
              {
                lbl: "진행 P/O",
                v: String(poActiveCount),
                numericValue: poActiveCount,
                formatter: fmtCount,
                u: "건",
                sub: `${fmtMw(poTotalMw)} MW · 전체 ${poTotalCount}건`,
                tone: "solar" as const,
                spark: poSpark,
                metricId: "procurement.po_active",
              },
              {
                lbl: "L/C 연결",
                v: String(lcOpenedCount),
                numericValue: lcOpenedCount,
                formatter: fmtCount,
                u: "건",
                sub: `USD ${fmtUsdM(lcTotalUsd)}M`,
                tone: "info" as const,
                spark: lcOpenSpark,
                metricId: "procurement.lc_linked",
              },
              {
                lbl: "운송중",
                v: String(poShippingCount),
                numericValue: poShippingCount,
                formatter: fmtCount,
                u: "건",
                sub: "입고 전환 대기",
                tone: "warn" as const,
                spark: monthlyCount(
                  poRows.filter((p) => p.status === "shipping" || p.status === "in_progress"),
                  (p) => p.contract_date,
                ),
                metricId: "procurement.shipping",
              },
              {
                lbl: "계약 유형",
                v: String(contractTypesCount),
                numericValue: contractTypesCount,
                formatter: fmtCount,
                u: "종",
                sub: "spot/frame 관리",
                tone: "pos" as const,
                metricId: "procurement.contract_types",
              },
              {
                lbl: "평균 PO 용량",
                v: fmtMw(poAvgMw),
                numericValue: poAvgMw,
                formatter: fmtMw,
                u: "MW",
                sub: "건당 평균",
                tone: "ink" as const,
                metricId: "procurement.po_avg_mw",
              },
              {
                lbl: "변경계약",
                v: String(poChangedCount),
                numericValue: poChangedCount,
                formatter: fmtCount,
                u: "건",
                sub: "parent 보유",
                tone: poChangedCount > 0 ? ("warn" as const) : ("ink" as const),
                metricId: "procurement.po_changed",
              },
              {
                lbl: "PO 전체",
                v: String(poTotalCount),
                numericValue: poTotalCount,
                formatter: fmtCount,
                u: "건",
                sub: "필터 기준 전체",
                tone: "ink" as const,
                metricId: "procurement.po_total",
              },
              {
                lbl: "운송중 비중",
                v:
                  poTotalCount > 0
                    ? ((poShippingCount / poTotalCount) * 100).toFixed(1)
                    : "0.0",
                numericValue:
                  poTotalCount > 0 ? (poShippingCount / poTotalCount) * 100 : 0,
                formatter: (n: number) => n.toFixed(1),
                u: "%",
                sub: "이동 중인 PO",
                tone: "info" as const,
                metricId: "procurement.po_shipping_ratio",
              },
            ]

  const procurementCardControls = (
    <div
      className="sf-card-controls"
      style={{ flex: 1, minWidth: 0, justifyContent: "flex-start" }}
    >
      {activeTab === "po" && (
        <>
          <FilterButton
            items={[
              {
                kind: "date_range",
                label: "기간",
                value: poDateRange,
                onChange: setPoDateRange,
              },
              {
                label: "상태",
                value: poStatusFilter,
                onChange: setPoStatusFilter,
                options: (Object.entries(PO_STATUS_LABEL) as [POStatus, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
              {
                label: "제조사",
                value: poMfgFilter,
                onChange: setPoMfgFilter,
                options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
              },
              {
                label: "유형",
                value: poTypeFilter,
                onChange: setPoTypeFilter,
                options: CONTRACT_TYPES_ACTIVE.map(({ value, label }) => ({ value, label })),
              },
              {
                label: "빠른 조건",
                value: poRiskFilter,
                onChange: setPoRiskFilter,
                options: [
                  { value: "active_only", label: "완료 제외" },
                  { value: "missing_number", label: "번호 미부여" },
                  { value: "changed_contract", label: "변경계약" },
                ],
              },
            ]}
          />
          <Button size="xs" onClick={() => setPoCreateOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            PO 신규 등록
          </Button>
          <Button size="xs" variant="outline" onClick={() => navigate("/purchase-history")}>
            <History className="mr-1 h-3 w-3" />
            구매 이력
          </Button>
        </>
      )}
      {activeTab === "lc" && (
        <>
          <FilterButton
            items={[
              {
                kind: "date_range",
                label: "기간",
                value: lcDateRange,
                onChange: setLcDateRange,
              },
              {
                label: "상태",
                value: lcStatusFilter,
                onChange: setLcStatusFilter,
                options: (Object.entries(LC_STATUS_LABEL) as [LCStatus, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
              {
                label: "은행",
                value: lcBankFilter,
                onChange: setLcBankFilter,
                options: banks.map((b) => ({ value: b.bank_id, label: b.bank_name })),
              },
              {
                label: "제조사",
                value: lcMfgFilter,
                onChange: setLcMfgFilter,
                options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
              },
            ]}
          />
          <Button size="xs" onClick={() => openLCCreate()}>
            <Plus className="mr-1 h-3 w-3" />
            LC 신규 등록
          </Button>
        </>
      )}
      {activeTab === "bl" && (
        <>
          <FilterButton
            items={[
              {
                kind: "date_range",
                label: "기간",
                value: blDateRange,
                onChange: setBlDateRange,
              },
              {
                label: "입고 구분",
                value: blTypeFilter,
                onChange: setBlTypeFilter,
                options: (Object.entries(INBOUND_TYPE_LABEL) as [InboundType, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
              {
                label: "입고 현황",
                value: blStatusFilter,
                onChange: setBlStatusFilter,
                options: (Object.entries(BL_STATUS_LABEL) as [BLStatus, string][]).map(
                  ([k, v]) => ({ value: k, label: v }),
                ),
              },
              {
                label: "제조사",
                value: blMfgFilter,
                onChange: setBlMfgFilter,
                options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
              },
            ]}
          />
          <ExcelToolbar
            type="inbound"
            onImportComplete={() => {
              reloadBL()
              setBlsVersion((v) => v + 1)
            }}
          />
          <Button size="xs" onClick={() => setBlCreateOpen(true)}>
            BL 신규 등록
          </Button>
        </>
      )}
      <div style={{ flex: 1 }} />
      <FilterChips options={PROC_TAB_OPTIONS} value={activeTab} onChange={handleTabChange} />
    </div>
  )

  return (
    <div className="sf-page sf-procurement-page min-h-[calc(100vh-5rem)] transition-shadow">
      {/* BL 상세 — 탭 바깥에서 전체 화면으로 표시 */}
      {selectedBL && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto">
          <div className="p-6">
            <BLDetailView
              blId={selectedBL}
              onBack={() => {
                setSelectedBL(null)
                reloadBL()
              }}
            />
          </div>
        </div>
      )}

      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
          <KpiStrip metrics={metrics} scopeId={`procurement.${activeTab}`}>
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

          <CommandTopLine title={pageTitle} sub={pageSub} right={procurementCardControls} />

          <CardB title={pageTitle} sub={pageSub} right={procurementCardControls} headerless>
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsContent value="po">
                  {poError ? (
                    <EmptyState
                      tone="error"
                      message="PO 목록을 불러오지 못했습니다"
                      description={poError}
                      actionLabel="다시 시도"
                      onAction={reloadPO}
                    />
                  ) : poLoading ? (
                    <SkeletonRows rows={8} />
                  ) : (
                    <>
                      <POListTable
                        items={poRows}
                        onDetail={setSelectedPO}
                        onSelectBL={setSelectedBL}
                        aggVersion={lcAggVersion}
                        sortField={poSort.sortField}
                        sortDirection={poSort.sortDirection}
                        onSort={poSort.onSort}
                      />
                      <PaginationBar
                        page={poPage}
                        pageSize={poPageSize}
                        total={poTotal}
                        onPageChange={setPoPage}
                        onPageSizeChange={(s) => {
                          setPoPageSize(s)
                          setPoPage(1)
                        }}
                      />
                    </>
                  )}
                </TabsContent>

                <TabsContent value="lc">
                  {lcError ? (
                    <EmptyState
                      tone="error"
                      message="LC 목록을 불러오지 못했습니다"
                      description={lcError}
                      actionLabel="다시 시도"
                      onAction={reloadLC}
                    />
                  ) : lcLoading ? (
                    <SkeletonRows rows={8} />
                  ) : (
                    <>
                      <LCListTable
                        items={lcRows}
                        onSettle={handleSettleLC}
                        onSelectBL={setSelectedBL}
                        blsVersion={blsVersion}
                        focusLCId={focusLCId}
                        sortField={lcSort.sortField}
                        sortDirection={lcSort.sortDirection}
                        onSort={lcSort.onSort}
                      />
                      <PaginationBar
                        page={lcPage}
                        pageSize={lcPageSize}
                        total={lcTotal}
                        onPageChange={setLcPage}
                        onPageSizeChange={(s) => {
                          setLcPageSize(s)
                          setLcPage(1)
                        }}
                      />
                    </>
                  )}
                </TabsContent>

                <TabsContent value="tt" className="space-y-5">
                  {/* 계약금 현황 — PO별 계약금 자동 집계 */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">계약금 현황</h2>
                      <div className="flex-1" />
                      <FilterButton
                        items={[
                          {
                            label: "제조사",
                            value: depositMfgFilter,
                            onChange: setDepositMfgFilter,
                            options: manufacturers.map((m) => ({
                              value: m.manufacturer_id,
                              label: m.name_kr,
                            })),
                          },
                        ]}
                      />
                    </div>
                    <DepositStatusPanel
                      pos={
                        depositMfgFilter
                          ? poList.filter((p) => p.manufacturer_id === depositMfgFilter)
                          : poList
                      }
                      tts={tts}
                      onCreateTT={(init) => {
                        setTtCreateInitial({
                          po_id: init.po_id,
                          amount_usd: init.amount_usd,
                          purpose: init.purpose,
                          status: "completed",
                        })
                        setTtCreateOpen(true)
                      }}
                    />
                  </div>

                  {/* 구분선 */}
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">T/T 송금 이력</h2>
                      <div className="flex-1" />
                      <FilterButton
                        items={[
                          {
                            kind: "date_range",
                            label: "기간",
                            value: ttDateRange,
                            onChange: setTtDateRange,
                          },
                          {
                            label: "상태",
                            value: ttStatusFilter,
                            onChange: setTtStatusFilter,
                            options: (Object.entries(TT_STATUS_LABEL) as [TTStatus, string][]).map(
                              ([k, v]) => ({ value: k, label: v }),
                            ),
                          },
                          {
                            label: "PO",
                            value: ttPoFilter,
                            onChange: setTtPoFilter,
                            options: poList.map((p) => ({
                              value: p.po_id,
                              label: p.po_number || p.po_id.slice(0, 8),
                            })),
                          },
                        ]}
                      />
                      <Button
                        size="xs"
                        onClick={() => {
                          setTtCreateInitial(ttPoFilter ? { po_id: ttPoFilter } : null)
                          setTtCreateOpen(true)
                        }}
                      >
                        T/T 신규 등록
                      </Button>
                    </div>
                    {ttLoading ? (
                      <LoadingSpinner />
                    ) : (
                      <>
                        <TTListTable items={tts} focusTTId={focusTTId} />
                        <PaginationBar
                          page={ttPage}
                          pageSize={ttPageSize}
                          total={ttTotal}
                          onPageChange={setTtPage}
                          onPageSizeChange={(s) => {
                            setTtPageSize(s)
                            setTtPage(1)
                          }}
                        />
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="bl" className="space-y-3">
                  {blLoading ? (
                    <SkeletonRows rows={8} />
                  ) : (
                    <>
                      <BLListTable
                        items={blRows}
                        onSelect={(bl) => setSelectedBL(bl.bl_id)}
                        sortField={blSort.sortField}
                        sortDirection={blSort.sortDirection}
                        onSort={blSort.onSort}
                      />
                      <PaginationBar
                        page={blPage}
                        pageSize={blPageSize}
                        total={blTotal}
                        onPageChange={setBlPage}
                        onPageSizeChange={(s) => {
                          setBlPageSize(s)
                          setBlPage(1)
                        }}
                      />
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </CardB>
        </section>

        <aside className="sf-procurement-rail card">
          {activeTab === "po" && (
            <>
              <RailBlock title="선택 P/O" count={selectedRailPO?.po_number ?? "—"}>
                {selectedRailPO ? (
                  <div>
                    <div className="text-[13px] font-bold text-[var(--ink)]">
                      {selectedRailPO.manufacturer_name ?? "제조사 미지정"}
                    </div>
                    <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                      {selectedRailPO.po_number ?? selectedRailPO.po_id.slice(0, 8)} ·{" "}
                      {fmtMw(selectedRailPO.total_mw ?? 0)} MW
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <div className="eyebrow">계약일</div>
                        <div className="mono mt-1 text-[var(--ink-2)]">
                          {selectedRailPO.contract_date ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div className="eyebrow">상태</div>
                        <div className="mt-1 text-[var(--ink-2)]">
                          {PO_STATUS_LABEL[selectedRailPO.status]}
                        </div>
                      </div>
                      <div>
                        <div className="eyebrow">유형</div>
                        <div className="mt-1 text-[var(--ink-2)]">
                          {CONTRACT_TYPE_LABEL[selectedRailPO.contract_type]}
                        </div>
                      </div>
                      <div>
                        <div className="eyebrow">수량</div>
                        <div className="mono mt-1 text-[var(--ink-2)]">
                          {(selectedRailPO.total_qty ?? 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--ink-3)]">선택할 P/O가 없습니다.</div>
                )}
              </RailBlock>
              <RailBlock title="진행 단계" count={`${poActiveCount} active`}>
                {[
                  [
                    "작성/계약",
                    poRows.filter((po) => po.status === "draft" || po.status === "contracted")
                      .length,
                  ],
                  [
                    "L/C/선적",
                    poRows.filter((po) => po.status === "in_progress" || po.status === "shipping")
                      .length,
                  ],
                  ["완료", poRows.filter((po) => po.status === "completed").length],
                ].map(([label, count]) => (
                  <div key={label} className="mb-2 last:mb-0">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-[var(--ink-2)]">{label}</span>
                      <span className="mono text-[var(--ink-3)]">{count}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded bg-[var(--line)]">
                      <div
                        className="h-full bg-[var(--solar-2)]"
                        style={{
                          width: `${poRows.length ? (Number(count) / poRows.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </RailBlock>
              <RailBlock title="JKO · 12주 단가" last>
                {jkoTrend ? (
                  <>
                    <Sparkline data={jkoTrend.data} w={220} h={42} color="var(--solar-2)" area />
                    <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                      <span>
                        현재{" "}
                        <span className="font-bold text-[var(--ink)]">
                          {fxNumberFmt.format(Math.round(jkoTrend.current))}
                        </span>{" "}
                        KRW/Wp
                      </span>
                      <span
                        className={`font-bold ${jkoTrend.deltaPct >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}
                      >
                        {jkoTrend.deltaPct >= 0 ? "+" : ""}
                        {jkoTrend.deltaPct.toFixed(1)}%
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-[var(--ink-3)]">JKO 12주 단가 데이터 없음</div>
                )}
              </RailBlock>
            </>
          )}

          {activeTab === "lc" && (
            <>
              <RailBlock
                title="은행별 L/C"
                count={`${new Set(lcRows.map((lc) => lc.bank_id)).size} banks`}
              >
                {banks.slice(0, 5).map((bank) => {
                  const bankLcs = lcRows.filter((lc) => lc.bank_id === bank.bank_id)
                  const amount = bankLcs.reduce((sum, lc) => sum + (lc.amount_usd ?? 0), 0)
                  if (bankLcs.length === 0) return null
                  return (
                    <div key={bank.bank_id} className="mb-3 last:mb-0">
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[12px] font-semibold text-[var(--ink)]">
                          {bank.bank_name}
                        </span>
                        <span className="mono text-[10.5px] text-[var(--ink-3)]">
                          {fmtUsdM(amount)} M$
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-[var(--line)]">
                        <div
                          className="h-full bg-[var(--solar-2)]"
                          style={{
                            width: `${lcTotalUsd ? Math.min(100, (amount / lcTotalUsd) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </RailBlock>
              <RailBlock title="만기 30일 이내" count={lcMaturitySoon.length}>
                {lcMaturitySoon.slice(0, 5).map((lc, index) => (
                  <div
                    key={lc.lc_id}
                    className={`grid grid-cols-[1fr_auto] gap-2 py-2 text-[11.5px] ${index ? "border-t border-[var(--line)]" : ""}`}
                  >
                    <span className="mono font-semibold text-[var(--ink-2)]">
                      {lc.lc_number ?? lc.lc_id.slice(0, 8)}
                    </span>
                    <span className="mono font-bold text-[var(--warn)]">
                      D-{daysUntil(lc.maturity_date)}
                    </span>
                    <span className="text-[var(--ink-3)]">{lc.bank_name ?? "은행 미지정"}</span>
                    <span className="mono text-[var(--ink-3)]">{fmtUsdM(lc.amount_usd)}M$</span>
                  </div>
                ))}
                {lcMaturitySoon.length === 0 && (
                  <div className="text-xs text-[var(--ink-3)]">임박 만기가 없습니다.</div>
                )}
              </RailBlock>
              <RailBlock title={`USD/KRW · ${fx?.series.length ?? 30}일`} last>
                {fx && fx.series.length > 0 ? (
                  <>
                    <Sparkline
                      data={fx.series.map((p) => p.rate)}
                      w={220}
                      h={42}
                      color="var(--solar-2)"
                      area
                    />
                    <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                      <span>
                        현재{" "}
                        <span className="font-bold text-[var(--ink)]">
                          {fx.latest != null
                            ? fxNumberFmt.format(Math.round(fx.latest * 10) / 10)
                            : "—"}
                        </span>
                      </span>
                      {fx.change_pct != null && (
                        <span
                          className={`font-bold ${fx.change_pct >= 0 ? "text-[var(--pos)]" : "text-[var(--neg)]"}`}
                        >
                          {fx.change_pct >= 0 ? "+" : ""}
                          {fx.change_pct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-[var(--ink-3)]">환율 로드 중…</div>
                )}
              </RailBlock>
            </>
          )}

          {activeTab === "bl" && (
            <>
              <RailBlock title="입고 상태" count={`${blActiveCount} active`}>
                <BreakdownRows
                  items={(
                    ["scheduled", "shipping", "arrived", "customs", "completed"] as BLStatus[]
                  ).map((status) => ({
                    key: status,
                    label: BL_STATUS_LABEL[status],
                    count: blRows.filter((bl) => bl.status === status).length,
                  }))}
                />
              </RailBlock>
              <RailBlock title="주요 항구" last>
                <BreakdownRows
                  items={Object.entries(
                    blRows.reduce<Record<string, number>>((acc, bl) => {
                      const key = bl.port || "미지정"
                      acc[key] = (acc[key] ?? 0) + 1
                      return acc
                    }, {}),
                  )
                    .slice(0, 5)
                    .map(([port, count]) => ({
                      key: port,
                      label: port,
                      count,
                    }))}
                />
              </RailBlock>
            </>
          )}

          {activeTab === "tt" && (
            <RailBlock title="구매 데이터 연결" count={`${tts.length} T/T`} last>
              <div className="space-y-2 text-[11.5px] text-[var(--ink-2)]">
                <div className="flex justify-between">
                  <span>P/O</span>
                  <span className="mono">{poRows.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>L/C</span>
                  <span className="mono">{lcRows.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>B/L</span>
                  <span className="mono">{blRows.length}</span>
                </div>
              </div>
            </RailBlock>
          )}
        </aside>
      </div>

      {/* 딤 오버레이 — 클릭하면 패널 닫기 */}
      {selectedPO && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity"
          onClick={() => {
            setSelectedPO(null)
            reloadPO()
            reloadPoList()
            setLcAggVersion((v) => v + 1)
          }}
        />
      )}

      {/* PO 우측 슬라이드 패널 — 왼쪽 드래그 핸들로 폭 조절 */}
      <div
        ref={panelRef}
        className={[
          "fixed inset-y-0 right-0 z-50 flex flex-col bg-background border-l shadow-2xl",
          "transition-transform duration-200 ease-out",
          selectedPO ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        style={{ width: panelWidth }}
      >
        {/* 왼쪽 드래그 핸들 */}
        <div
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-10 group select-none"
          onMouseDown={onDragHandleMouseDown}
          title="드래그하여 패널 너비 조절"
        >
          <div className="h-full w-full transition-colors group-hover:bg-primary/20 group-active:bg-primary/30" />
          {/* 가운데 그립 점 */}
          <div className="absolute top-1/2 left-0 -translate-y-1/2 flex flex-col gap-1 items-center w-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-0.5 h-3 rounded-full bg-border group-hover:bg-primary/40" />
            ))}
          </div>
        </div>

        {/* 상단 헤더 — 너비 표시 + 닫기 버튼 */}
        <div className="flex items-center justify-between border-b px-6 py-2.5 shrink-0 bg-muted/30">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {Math.round(panelWidth)}px
          </span>
          <div className="flex items-center gap-1">
            {/* 너비 프리셋 버튼 */}
            {[600, 800, 1000, 1200].map((w) => (
              <button
                key={w}
                onClick={() => setPanelWidth(w)}
                className={[
                  "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                  Math.abs(panelWidth - w) < 50
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {w}px
              </button>
            ))}
            <button
              onClick={() => {
                setSelectedPO(null)
                reloadPO()
                reloadPoList()
                setLcAggVersion((v) => v + 1)
              }}
              className="ml-2 rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="닫기 (ESC)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1l12 12M13 1L1 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 스크롤 가능한 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedPO && (
            <PODetailView
              po={selectedPO}
              onBack={() => {
                setSelectedPO(null)
                reloadPO()
                reloadPoList()
                setLcAggVersion((v) => v + 1)
              }}
              onReload={() => {
                reloadPO()
                reloadPoList()
                setLcAggVersion((v) => v + 1)
              }}
              onVariantCreated={(created) => {
                setSelectedPO(created)
                reloadPO()
                reloadPoList()
                setLcAggVersion((v) => v + 1)
              }}
              onCreateLC={(initial) => openLCCreate(initial)}
              onOpenBLTab={(po) => {
                setSelectedPO(null)
                setBlMfgFilter(po.manufacturer_id)
                setBlStatusFilter("")
                setBlPage(1)
                setActiveTab("bl")
                navigate("/procurement?tab=bl", { replace: true })
              }}
              onSelectBL={setSelectedBL}
              allPos={pos}
            />
          )}
        </div>
      </div>

      <POCreateDialog
        open={poCreateOpen}
        onClose={() => setPoCreateOpen(false)}
        onCreated={() => {
          reloadPO()
          reloadPoList()
        }}
      />
      <LCCreateDialog
        open={lcCreateOpen}
        initialPoId={lcCreateInitial?.poId}
        initialTargetQty={lcCreateInitial?.targetQty}
        initialAmountUsd={lcCreateInitial?.amountUsd}
        onClose={() => {
          setLcCreateOpen(false)
          setLcCreateInitial(null)
        }}
        onCreated={() => {
          reloadLC()
          setLcAggVersion((v) => v + 1)
          setLcCreateInitial(null)
        }}
      />
      <BLCreateDialog
        open={blCreateOpen}
        initialManufacturerId={blMfgFilter || undefined}
        onClose={() => setBlCreateOpen(false)}
        onCreated={() => {
          reloadBL()
          setBlsVersion((v) => v + 1)
        }}
      />
      <TTCreateDialog
        open={ttCreateOpen}
        initialValues={ttCreateInitial}
        onClose={() => {
          setTtCreateOpen(false)
          setTtCreateInitial(null)
        }}
        onCreated={() => {
          reloadTT()
          setTtCreateInitial(null)
        }}
      />
    </div>
  )
}
