import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef as TSColumnDef,
  type ColumnPinningState,
  type ColumnOrderState,
  type FilterFn,
  type Column,
  type PaginationState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowDown, ArrowUp, ArrowUpDown, EyeOff, Pin, PinOff, RotateCcw } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import EmptyState from "./EmptyState"
import { cn } from "@/lib/utils"
import { buildTableSummary, type TableSummaryMode } from "@/lib/tableSummary"
import type { ColumnVisibilityMeta } from "@/lib/columnVisibility"
import { useColumnWidths, type ColumnSizingState } from "@/lib/columnWidths"
import { useColumnSort, type SortingState } from "@/lib/columnSort"
import type { ColumnPinningState as SfColumnPinningState } from "@/lib/columnPinning"
import { useColumnOrder, resolveOrder } from "@/lib/columnOrder"

const DRAG_THRESHOLD_PX = 5

export interface ColumnDef<T> extends ColumnVisibilityMeta {
  cell: (item: T) => ReactNode
  /** 헤더 셀 커스텀 렌더 — 기본 라벨(+정렬 아이콘) 대신 이 결과를 사용.
   * 예: 모두선택 체크박스. headerCell 이 있으면 정렬 옵트인은 무시됨. */
  headerCell?: () => ReactNode
  align?: "left" | "right" | "center"
  className?: string
  headerClassName?: string
  /** 폭 조절 가능 여부 — 기본 true. actions 같은 고정 폭 컬럼만 false 권장. */
  resizable?: boolean
  /** 사용자 순서 변경(드래그) 가능 여부 — 기본 true. */
  reorderable?: boolean
  /** 사용자 고정(pin) 가능 여부 — 기본 true. 액션·셀렉트 컬럼은 false 권장. */
  pinnable?: boolean
  /** 기본 폭(px). 미지정이면 TanStack 기본 150. */
  defaultWidth?: number
  /** 최소 폭(px). 미지정 40. */
  minWidth?: number
  /** 최대 폭(px). 미지정 800. */
  maxWidth?: number
  /**
   * 정렬 옵트인 — 함수가 주어지면 해당 컬럼 헤더가 클릭 정렬 가능해짐.
   * cell 이 자유 JSX 라 정렬에 쓸 원본 값을 명시 (string | number | Date | null).
   * 예) sortAccessor: (ob) => ob.outbound_date
   */
  sortAccessor?: (item: T) => string | number | Date | null | undefined
  /**
   * 글로벌 검색 시 매칭 대상 텍스트. 미지정이면 cell 결과 텍스트화 fallback (오버헤드 큼).
   * 명시하면 검색이 정확하고 빠름. 예) globalFilterText: (ob) => ob.product_name ?? ''
   */
  globalFilterText?: (item: T) => string
  /**
   * 하단 합계 줄. 미지정 시 컬럼 key/label 기준으로 합산 가능한 숫자만 자동 합산.
   * 단가·환율·규격·일수처럼 더하면 안 되는 값은 자동 제외한다.
   */
  summary?: TableSummaryMode
  summaryAccessor?: (item: T) => number | null | undefined
  summaryFormatter?: (value: number, rows: T[]) => ReactNode
}

export interface MetaTableServerMode {
  pageIndex: number
  pageSize: number
  totalRowCount: number
  onPageChange: (next: { pageIndex: number; pageSize: number }) => void
  sorting?: SortingState
  onSortingChange?: (next: SortingState) => void
  sortableColumnIds?: ReadonlySet<string>
}

export interface MetaTableProps<T> {
  /** localStorage scope — 컬럼 폭/정렬/고정/순서 영속 저장에 사용. 미지정 시 영속 비활성. */
  tableId?: string
  columns: ColumnDef<T>[]
  hidden: Set<string>
  items: T[]
  getRowKey: (item: T) => string
  defaultSort?: { key: string; direction: "asc" | "desc" }
  onRowClick?: (item: T) => void
  emptyMessage?: string
  emptyAction?: { label: string; onClick: () => void }
  /** 페이지가 직접 구성한 하단 요약 행. 미지정 시 MetaTable 이 자동 합계를 만든다. */
  footer?: ReactNode
  /** 단순 테이블 호환용 — 컬럼 폭 합계 대신 부모 폭을 채운다. */
  fillWidth?: boolean
  rowClassName?: (item: T) => string | undefined
  tableClassName?: string
  /** 글로벌 검색어 — 외부(예: ToolbarBar 검색 input)에서 제어. */
  globalFilter?: string
  /** 글로벌 검색 적용 후 행 갯수 변동 시 호출. tableSub 같은 외부 카운트 표시용. */
  onFilteredRowCountChange?: (count: number) => void
  /** 컬럼 고정 상태 — ColumnVisibilityMenu 와 공유하도록 페이지가 보유.
   *  미지정 시 고정 비활성. */
  pinning?: SfColumnPinningState
  /** 고정 상태 변경 콜백 — TanStack 의 onColumnPinningChange 시그니처. */
  onPinningChange?: (next: SfColumnPinningState) => void
  /** 숨김 컬럼 변경 — 헤더 우클릭 메뉴에서 "열 숨기기"용. 미지정 시 메뉴에 항목 미노출. */
  onHiddenChange?: (next: Set<string>) => void
  /** 페이지당 행 수 기본값. 미지정 시 페이지네이션 비활성. */
  pageSize?: number
  /** 페이지 크기 선택지. 기본 [25, 50, 100]. */
  pageSizeOptions?: number[]
  /**
   * 서버사이드 모드 제어. 미지정 시 기존 클라이언트 모드(items 전체 적재 후 client 페이지네이션·정렬·필터).
   * 지정 시 items 는 이미 서버에서 페이지/정렬/필터된 한 페이지 분량이고,
   * 페이지·정렬·전체 카운트·페이지 변경 콜백을 외부에서 통제한다.
   *
   * 모드 호환: serverMode 미지정 → 기존 동작 그대로. 다른 화면들은 영향 없음.
   */
  serverMode?: MetaTableServerMode
}

function alignClass(align?: "left" | "right" | "center"): string | undefined {
  if (align === "right") return "text-right"
  if (align === "center") return "text-center"
  return undefined
}

type PinnedLayer = "header" | "body" | "footer"

/** 고정 컬럼 sticky 위치 계산 — 같은 사이드의 누적 폭. */
function getPinnedStyle<T>(
  column: Column<T>,
  layer: PinnedLayer = "body",
): CSSProperties | undefined {
  const isPinned = column.getIsPinned()
  if (!isPinned) return undefined
  const zIndex = layer === "header" ? 5 : layer === "footer" ? 4 : 3
  if (isPinned === "left") {
    return {
      position: "sticky",
      left: column.getStart("left"),
      zIndex,
    }
  }
  return {
    position: "sticky",
    right: column.getAfter("right"),
    zIndex,
  }
}

function primitiveTitle(value: ReactNode): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim()
    return text && text !== "—" ? text : undefined
  }
  return undefined
}

function TableText({ children }: { children: string | number }) {
  const title = primitiveTitle(children)
  return (
    <span className="sf-meta-table-text" title={title}>
      {children}
    </span>
  )
}

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100]

export function MetaTable<T>({
  tableId,
  columns,
  hidden,
  items,
  getRowKey,
  defaultSort,
  onRowClick,
  emptyMessage,
  emptyAction,
  footer,
  fillWidth,
  rowClassName,
  tableClassName,
  globalFilter,
  onFilteredRowCountChange,
  pinning,
  onPinningChange,
  onHiddenChange,
  pageSize,
  pageSizeOptions,
  serverMode,
}: MetaTableProps<T>) {
  const isServerMode = serverMode != null
  const paginationEnabled = isServerMode || pageSize != null
  const [clientPagination, setClientPagination] = useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize: pageSize ?? 50,
  }))
  const pagination: PaginationState = isServerMode
    ? { pageIndex: serverMode.pageIndex, pageSize: serverMode.pageSize }
    : clientPagination
  // ─── 영속 hooks — tableId 없으면 빈 scope 로 비영속 동작 ──────────────────
  // 폭/정렬/순서는 MetaTable 이 보유. pinning 은 ColumnVisibilityMenu 와 공유 필요해
  // 페이지가 보유하고 prop 으로 받음.
  const widths = useColumnWidths(tableId ?? "")
  const sortPersist = useColumnSort(tableId ?? "")
  const orderPersist = useColumnOrder(tableId ?? "")
  const persistEnabled = !!tableId
  const pinningEnabled = !!pinning

  // ─── 포인터 기반 헤더 리오더 상태 ────────────────────────────────────────
  // 같은 헤더에서 짧은 클릭=정렬, 임계값 초과 드래그=리오더 로 분기.
  // HTML5 D&D 대신 PointerEvent 로 처리해 고스트 분리감과 모드 토글을 모두 제거.
  const [dragState, setDragState] = useState<{
    columnId: string
    startX: number
    pointerX: number
    pointerY: number
    active: boolean
    rect: { left: number; top: number; width: number; height: number }
    label: string
    align: "left" | "right" | "center"
  } | null>(null)
  const headerRefs = useRef<Map<string, HTMLElement>>(new Map())
  // 드래그 직후 click 이벤트(정렬 토글) 가 발화되는 것을 막기 위한 단발 플래그.
  const justDraggedRef = useRef(false)

  // ─── 헤더 우클릭 컨텍스트 메뉴 상태 ──────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ columnId: string; x: number; y: number } | null>(null)
  // floating-ui — 커서 위치 기준 virtual reference. 화면 가장자리에서 자동 flip + shift.
  const { refs: ctxRefs, floatingStyles: ctxFloatingStyles } = useFloating({
    placement: "bottom-start",
    middleware: [
      offset(2),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(120, availableHeight)}px`
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  })
  useEffect(() => {
    if (!ctxMenu) return
    ctxRefs.setPositionReference({
      getBoundingClientRect: () => ({
        x: ctxMenu.x,
        y: ctxMenu.y,
        width: 0,
        height: 0,
        top: ctxMenu.y,
        left: ctxMenu.x,
        right: ctxMenu.x,
        bottom: ctxMenu.y,
      }),
    })
  }, [ctxMenu, ctxRefs])

  const [localSorting, setLocalSorting] = useState<SortingState>(() =>
    defaultSort ? [{ id: defaultSort.key, desc: defaultSort.direction === "desc" }] : [],
  )

  // ─── visibility — 외부에서 받은 hidden Set 을 TanStack 형태로 변환 ───────
  const columnVisibility: VisibilityState = useMemo(() => {
    const v: VisibilityState = {}
    for (const c of columns) v[c.key] = !hidden.has(c.key)
    return v
  }, [columns, hidden])

  // ─── 컬럼 순서 해결 (저장값 + 현재 컬럼 병합) ────────────────────────────
  const defaultIds = useMemo(() => columns.map((c) => c.key), [columns])
  const resolvedOrder: ColumnOrderState = useMemo(
    () => (persistEnabled ? resolveOrder(orderPersist.order, defaultIds) : defaultIds),
    [persistEnabled, orderPersist.order, defaultIds],
  )

  // ─── TanStack column defs ────────────────────────────────────────────────
  const tsColumns = useMemo<TSColumnDef<T>[]>(
    () =>
      columns.map((c) => {
        const accessor = c.sortAccessor
        const serverSortEnabled =
          !isServerMode ||
          (serverMode?.onSortingChange != null &&
            (serverMode.sortableColumnIds == null || serverMode.sortableColumnIds.has(c.key)))
        return {
          id: c.key,
          header: c.label,
          cell: ({ row }) => c.cell(row.original),
          enableSorting: !!accessor && serverSortEnabled,
          accessorFn: accessor
            ? (row: T) => {
                const v = accessor(row)
                if (v == null) return ""
                if (v instanceof Date) return v.getTime()
                return v
              }
            : undefined,
          sortUndefined: "last" as const,
          enableHiding: c.hideable ?? false,
          enableResizing: c.resizable !== false,
          enablePinning: c.pinnable !== false,
          size: c.defaultWidth ?? 150,
          minSize: c.minWidth ?? 40,
          maxSize: c.maxWidth ?? 800,
          meta: {
            align: c.align,
            className: c.className,
            headerClassName: c.headerClassName,
            headerCell: c.headerCell,
            reorderable: c.reorderable !== false,
            globalFilterText: c.globalFilterText,
          } as {
            align?: "left" | "right" | "center"
            className?: string
            headerClassName?: string
            headerCell?: () => ReactNode
            reorderable?: boolean
            globalFilterText?: (item: T) => string
          },
        }
      }),
    [columns, isServerMode, serverMode?.onSortingChange, serverMode?.sortableColumnIds],
  )

  // ─── 글로벌 필터 함수 — 모든 컬럼의 globalFilterText 결과를 OR 매치 ──────
  const globalFilterFn: FilterFn<T> = useMemo(
    () => (row, _columnId, filterValue: string) => {
      if (!filterValue) return true
      const q = String(filterValue).toLowerCase()
      for (const c of columns) {
        if (!c.globalFilterText) continue
        const text = c.globalFilterText(row.original).toLowerCase()
        if (text.includes(q)) return true
      }
      return false
    },
    [columns],
  )

  // ─── 서버 모드 정렬 상태 — serverMode.sorting / onSortingChange 위임 ─────
  const sortingState: SortingState = isServerMode
    ? (serverMode.sorting ?? [])
    : persistEnabled
      ? sortPersist.sorting
      : localSorting

  // ─── useReactTable ───────────────────────────────────────────────────────
  const table = useReactTable({
    data: items,
    columns: tsColumns,
    state: {
      columnVisibility,
      columnSizing: persistEnabled ? widths.sizing : {},
      sorting: sortingState,
      columnPinning: (pinning as ColumnPinningState | undefined) ?? { left: [], right: [] },
      columnOrder: resolvedOrder,
      globalFilter: globalFilter ?? "",
      ...(paginationEnabled ? { pagination } : {}),
    },
    onColumnSizingChange: persistEnabled
      ? (updater) =>
          widths.setSizing(
            updater as ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState),
          )
      : undefined,
    onSortingChange: isServerMode
      ? (updater) => {
          if (!serverMode.onSortingChange) return
          const prev = sortingState
          const next = typeof updater === "function" ? updater(prev) : updater
          serverMode.onSortingChange(next as SortingState)
        }
      : persistEnabled
        ? (updater) =>
            sortPersist.setSorting(updater as SortingState | ((prev: SortingState) => SortingState))
        : (updater) => {
            setLocalSorting((prev) => {
              const next = typeof updater === "function" ? updater(prev) : updater
              return next as SortingState
            })
          },
    onColumnPinningChange:
      pinningEnabled && onPinningChange
        ? (updater) => {
            const prev = pinning ?? { left: [], right: [] }
            const tsNext =
              typeof updater === "function"
                ? updater({ left: prev.left, right: prev.right })
                : updater
            onPinningChange({ left: tsNext.left ?? [], right: tsNext.right ?? [] })
          }
        : undefined,
    onColumnOrderChange: persistEnabled
      ? (updater) =>
          orderPersist.setOrder(
            updater as ColumnOrderState | ((prev: ColumnOrderState) => ColumnOrderState),
          )
      : undefined,
    onPaginationChange: paginationEnabled
      ? (updater) => {
          if (isServerMode) {
            const prev = pagination
            const next = typeof updater === "function" ? updater(prev) : updater
            serverMode.onPageChange({ pageIndex: next.pageIndex, pageSize: next.pageSize })
            return
          }
          setClientPagination(updater)
        }
      : undefined,
    autoResetPageIndex: !isServerMode,
    columnResizeMode: "onChange",
    enableColumnResizing: persistEnabled,
    enableColumnPinning: pinningEnabled,
    enableSortingRemoval: !isServerMode,
    manualPagination: isServerMode,
    manualSorting: isServerMode,
    manualFiltering: isServerMode,
    pageCount: isServerMode
      ? Math.max(1, Math.ceil(serverMode.totalRowCount / serverMode.pageSize))
      : undefined,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    ...(isServerMode ? {} : { getSortedRowModel: getSortedRowModel() }),
    ...(isServerMode ? {} : { getFilteredRowModel: getFilteredRowModel() }),
    ...(paginationEnabled && !isServerMode
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    getRowId: (row) => getRowKey(row),
  })

  // 필터된 행 갯수 변동 시 외부 알림 (tableSub 카운트 표시 등).
  // server 모드: totalRowCount 그대로 (한 페이지가 아닌 필터 후 전체).
  // client 모드: 클라이언트 필터 후 행 수.
  const filteredRowCount = isServerMode
    ? serverMode.totalRowCount
    : table.getFilteredRowModel().rows.length
  const filteredRows = isServerMode
    ? items
    : table.getFilteredRowModel().rows.map((row) => row.original)
  const summaryCells = useMemo(
    () =>
      buildTableSummary(columns, filteredRows, (column, row) => {
        const source = columns.find((c) => c.key === column.key)
        if (source?.sortAccessor) return source.sortAccessor(row)
        return (row as Record<string, unknown>)[column.key]
      }),
    [columns, filteredRows],
  )
  useEffect(() => {
    onFilteredRowCountChange?.(filteredRowCount)
  }, [filteredRowCount, onFilteredRowCountChange])

  // ─── 포인터 기반 헤더 리오더 — 임계값 5px 이전엔 클릭(정렬), 이후엔 드래그.
  // 드롭 위치 계산: 커서 X 가 어느 컬럼 중심을 지났는지 기준으로 삽입 인덱스 결정.
  const commitReorder = useCallback(
    (sourceId: string, pointerX: number) => {
      if (!persistEnabled) return
      const refs = headerRefs.current
      const entries: Array<{ id: string; left: number; right: number; mid: number }> = []
      refs.forEach((el, id) => {
        if (id === sourceId) return
        const r = el.getBoundingClientRect()
        entries.push({ id, left: r.left, right: r.right, mid: (r.left + r.right) / 2 })
      })
      if (entries.length === 0) return
      entries.sort((a, b) => a.left - b.left)
      // 어떤 컬럼의 좌/우 절반에 떨어졌는지 찾는다.
      let targetId: string | null = null
      let insertBefore = true
      for (const e of entries) {
        if (pointerX < e.mid) {
          targetId = e.id
          insertBefore = true
          break
        }
        if (pointerX < e.right) {
          targetId = e.id
          insertBefore = false
          break
        }
      }
      if (!targetId) {
        targetId = entries[entries.length - 1].id
        insertBefore = false
      }
      if (targetId === sourceId) return
      orderPersist.setOrder(() => {
        const current = resolvedOrder.length ? resolvedOrder : defaultIds
        const without = current.filter((x) => x !== sourceId)
        const idx = without.indexOf(targetId!)
        if (idx === -1) return [...without, sourceId]
        const insertIdx = insertBefore ? idx : idx + 1
        return [...without.slice(0, insertIdx), sourceId, ...without.slice(insertIdx)]
      })
    },
    [persistEnabled, orderPersist, resolvedOrder, defaultIds],
  )

  // 드롭 인디케이터 위치 — 드래그 active 동안 현재 커서 위치 기준 삽입 갭의 left/top/height.
  const dropIndicator = useMemo(() => {
    if (!dragState?.active) return null
    const refs = headerRefs.current
    const entries: Array<{
      id: string
      left: number
      right: number
      mid: number
      top: number
      height: number
    }> = []
    refs.forEach((el, id) => {
      if (id === dragState.columnId) return
      const r = el.getBoundingClientRect()
      entries.push({
        id,
        left: r.left,
        right: r.right,
        mid: (r.left + r.right) / 2,
        top: r.top,
        height: r.height,
      })
    })
    if (entries.length === 0) return null
    entries.sort((a, b) => a.left - b.left)
    const px = dragState.pointerX
    for (const e of entries) {
      if (px < e.mid) return { x: e.left, top: e.top, height: e.height }
      if (px < e.right) return { x: e.right, top: e.top, height: e.height }
    }
    const last = entries[entries.length - 1]
    return { x: last.right, top: last.top, height: last.height }
  }, [dragState])

  useEffect(() => {
    if (!dragState) return
    const onMove = (ev: PointerEvent) => {
      setDragState((prev) => {
        if (!prev) return null
        const active = prev.active || Math.abs(ev.clientX - prev.startX) > DRAG_THRESHOLD_PX
        return { ...prev, pointerX: ev.clientX, pointerY: ev.clientY, active }
      })
    }
    const onUp = (ev: PointerEvent) => {
      setDragState((prev) => {
        if (!prev) return null
        if (prev.active) {
          commitReorder(prev.columnId, ev.clientX)
          justDraggedRef.current = true
          // 같은 tick 의 click 만 막고 다음부턴 정상 동작
          window.setTimeout(() => {
            justDraggedRef.current = false
          }, 0)
        }
        return null
      })
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setDragState(null)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("keydown", onKey)
    }
  }, [dragState, commitReorder])

  // 컨텍스트 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setCtxMenu(null)
    }
    window.addEventListener("mousedown", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [ctxMenu])

  // 행 추가/삭제/순서 변경 시 자동 슬라이드 — 필터/정렬/페이지네이션 전환을 부드럽게.
  const [bodyRef] = useAutoAnimate<HTMLTableSectionElement>({
    duration: 180,
    easing: "ease-out",
  })

  // server 모드는 한 페이지가 비어도 totalRowCount > 0 이면 데이터 있는 상태 — 페이지 컨트롤 보존이 필요.
  const isEmpty = isServerMode ? filteredRowCount === 0 : items.length === 0
  if (isEmpty) {
    return (
      <EmptyState
        message={emptyMessage}
        actionLabel={emptyAction?.label}
        onAction={emptyAction?.onClick}
      />
    )
  }

  const onHeaderPointerDown = (
    e: React.PointerEvent,
    columnId: string,
    label: string,
    reorderable: boolean,
    align: "left" | "right" | "center",
  ) => {
    // 좌클릭만, 리사이저 영역은 제외
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest(".sf-col-resizer")) return
    if (!persistEnabled || !reorderable) return
    const el = headerRefs.current.get(columnId)
    if (!el) return
    const r = el.getBoundingClientRect()
    setDragState({
      columnId,
      startX: e.clientX,
      pointerX: e.clientX,
      pointerY: e.clientY,
      active: false,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      label,
      align,
    })
  }

  const onHeaderContextMenu = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault()
    setCtxMenu({ columnId, x: e.clientX, y: e.clientY })
  }

  const sizeOptions = pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS
  const currentPageIndex = pagination.pageIndex
  const totalPageCount = paginationEnabled ? table.getPageCount() : 1
  const showPagination = paginationEnabled && filteredRowCount > pagination.pageSize
  const pageRange = showPagination ? buildPageRange(currentPageIndex, totalPageCount) : []
  const rangeStart =
    paginationEnabled && filteredRowCount > 0 ? currentPageIndex * pagination.pageSize + 1 : 0
  const rangeEnd = paginationEnabled
    ? Math.min((currentPageIndex + 1) * pagination.pageSize, filteredRowCount)
    : filteredRowCount

  return (
    <div className="sf-meta-table">
      <Table
        className={cn("text-xs", tableClassName)}
        style={
          fillWidth
            ? { width: "100%", minWidth: table.getTotalSize(), tableLayout: "fixed" }
            : { width: table.getTotalSize(), tableLayout: "fixed" }
        }
      >
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const meta = header.column.columnDef.meta as
                  | {
                      align?: "left" | "right" | "center"
                      headerClassName?: string
                      headerCell?: () => ReactNode
                      reorderable?: boolean
                    }
                  | undefined
                const canResize = header.column.getCanResize()
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                const SortIcon =
                  sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown
                const reorderable =
                  persistEnabled && meta?.reorderable !== false && !meta?.headerCell
                const pinSide = header.column.getIsPinned() as "left" | "right" | false
                const pinnedStyle = getPinnedStyle(header.column, "header")
                const isDragging = dragState?.active && dragState.columnId === header.id
                const labelText =
                  typeof header.column.columnDef.header === "string"
                    ? (header.column.columnDef.header as string)
                    : header.id
                return (
                  <TableHead
                    key={header.id}
                    ref={(el) => {
                      if (el) headerRefs.current.set(header.id, el)
                      else headerRefs.current.delete(header.id)
                    }}
                    className={cn(
                      "relative",
                      alignClass(meta?.align),
                      meta?.headerClassName,
                      reorderable && "sf-col-grab",
                      isDragging && "sf-col-dragging",
                      pinSide === "left" && "sf-col-pinned-left",
                      pinSide === "right" && "sf-col-pinned-right",
                    )}
                    style={{ width: header.getSize(), ...pinnedStyle }}
                    aria-sort={
                      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"
                    }
                    data-align={meta?.align ?? "left"}
                    data-pinned={pinSide || undefined}
                    data-sorted={sorted || undefined}
                    onPointerDown={
                      reorderable
                        ? (e) =>
                            onHeaderPointerDown(
                              e,
                              header.id,
                              labelText,
                              reorderable,
                              meta?.align ?? "left",
                            )
                        : undefined
                    }
                    onContextMenu={(e) => onHeaderContextMenu(e, header.id)}
                  >
                    {meta?.headerCell ? (
                      meta.headerCell()
                    ) : canSort ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          if (justDraggedRef.current) {
                            e.preventDefault()
                            e.stopPropagation()
                            return
                          }
                          header.column.getToggleSortingHandler()?.(e)
                        }}
                        className={cn(
                          "sf-meta-table-sort",
                          sorted ? "text-foreground font-semibold" : "text-muted-foreground",
                          meta?.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon
                          className={cn("sf-meta-table-sort-icon", !sorted && "opacity-40")}
                        />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                    {canResize && (
                      <span
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => {
                          e.stopPropagation()
                          header.column.resetSize()
                        }}
                        draggable={false}
                        className={cn(
                          "sf-col-resizer",
                          header.column.getIsResizing() && "sf-col-resizer-active",
                        )}
                        role="separator"
                        aria-orientation="vertical"
                        title="드래그: 폭 조정 · 더블클릭: 기본값"
                      />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody ref={bodyRef}>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(onRowClick && "cursor-pointer", rowClassName?.(row.original))}
              data-clickable={onRowClick ? "true" : undefined}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as
                  | { align?: "left" | "right" | "center"; className?: string }
                  | undefined
                const pinSide = cell.column.getIsPinned() as "left" | "right" | false
                const pinnedStyle = getPinnedStyle(cell.column, "body")
                const content = flexRender(cell.column.columnDef.cell, cell.getContext())
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      alignClass(meta?.align),
                      meta?.className,
                      pinSide === "left" && "sf-col-pinned-left",
                      pinSide === "right" && "sf-col-pinned-right",
                    )}
                    style={{ width: cell.column.getSize(), ...pinnedStyle }}
                    data-align={meta?.align ?? "left"}
                    data-pinned={pinSide || undefined}
                  >
                    {typeof content === "string" || typeof content === "number" ? (
                      <TableText>{content}</TableText>
                    ) : (
                      content
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
        {filteredRowCount > 0 && (footer || summaryCells.size > 0) && (
          <TableFooter>
            {footer ?? (
              <TableRow>
                {table.getVisibleLeafColumns().map((column, idx) => {
                  const meta = column.columnDef.meta as
                    | { align?: "left" | "right" | "center"; className?: string }
                    | undefined
                  const pinSide = column.getIsPinned() as "left" | "right" | false
                  const pinnedStyle = getPinnedStyle(column, "footer")
                  const content = summaryCells.get(column.id)
                  const hasSummary = idx !== 0 && content != null
                  return (
                    <TableCell
                      key={column.id}
                      className={cn(
                        alignClass(meta?.align),
                        hasSummary && "tabular-nums font-medium",
                        hasSummary && !meta?.align && "text-right",
                        pinSide === "left" && "sf-col-pinned-left",
                        pinSide === "right" && "sf-col-pinned-right",
                      )}
                      style={{ width: column.getSize(), ...pinnedStyle }}
                      data-align={meta?.align ?? (hasSummary ? "right" : "left")}
                      data-pinned={pinSide || undefined}
                    >
                      {idx === 0 ? (
                        <span className="whitespace-nowrap font-medium">
                          합계 · {filteredRowCount.toLocaleString("ko-KR")}건
                        </span>
                      ) : (
                        (content ?? null)
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            )}
          </TableFooter>
        )}
      </Table>
      {paginationEnabled && filteredRowCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              {rangeStart.toLocaleString("ko-KR")}–{rangeEnd.toLocaleString("ko-KR")} /{" "}
              {filteredRowCount.toLocaleString("ko-KR")}건
            </span>
            <span className="text-[var(--line)]">·</span>
            <label className="inline-flex items-center gap-1.5">
              <span>페이지당</span>
              <select
                value={pagination.pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  const newSize = Number.isFinite(next) ? next : pagination.pageSize
                  if (isServerMode) {
                    serverMode.onPageChange({ pageIndex: 0, pageSize: newSize })
                  } else {
                    setClientPagination({ pageIndex: 0, pageSize: newSize })
                  }
                }}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
              >
                {sizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {showPagination && (
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    text="이전"
                    href="#"
                    aria-disabled={!table.getCanPreviousPage()}
                    className={
                      !table.getCanPreviousPage() ? "pointer-events-none opacity-40" : undefined
                    }
                    onClick={(e) => {
                      e.preventDefault()
                      if (table.getCanPreviousPage()) table.previousPage()
                    }}
                  />
                </PaginationItem>
                {pageRange.map((entry, idx) => (
                  <PaginationItem key={`${entry}-${idx}`}>
                    {entry === "ellipsis" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href="#"
                        isActive={entry === currentPageIndex}
                        onClick={(e) => {
                          e.preventDefault()
                          table.setPageIndex(entry)
                        }}
                      >
                        {entry + 1}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    text="다음"
                    href="#"
                    aria-disabled={!table.getCanNextPage()}
                    className={
                      !table.getCanNextPage() ? "pointer-events-none opacity-40" : undefined
                    }
                    onClick={(e) => {
                      e.preventDefault()
                      if (table.getCanNextPage()) table.nextPage()
                    }}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {dragState?.active && (
              <motion.div
                key="drag-preview"
                className="sf-col-drag-preview"
                style={{
                  left: dragState.pointerX - (dragState.startX - dragState.rect.left),
                  top: dragState.rect.top,
                  width: dragState.rect.width,
                  height: dragState.rect.height,
                  justifyContent:
                    dragState.align === "right"
                      ? "flex-end"
                      : dragState.align === "center"
                        ? "center"
                        : "flex-start",
                }}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 0.92, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.6 }}
              >
                <span className="sf-col-drag-preview-label">{dragState.label}</span>
              </motion.div>
            )}
            {dragState?.active && dropIndicator && (
              <motion.div
                key="drop-indicator"
                className="sf-col-drop-indicator"
                style={{ top: dropIndicator.top, height: dropIndicator.height }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, left: dropIndicator.x }}
                exit={{ opacity: 0 }}
                transition={{
                  left: { type: "spring", stiffness: 600, damping: 40 },
                  opacity: { duration: 0.12 },
                }}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
      <AnimatePresence>
        {ctxMenu &&
          (() => {
            const col = columns.find((c) => c.key === ctxMenu.columnId)
            if (!col) return null
            const tsCol = table.getColumn(ctxMenu.columnId)
            const sorted = tsCol?.getIsSorted()
            const pinned = tsCol?.getIsPinned() as "left" | "right" | false | undefined
            const canSort = !!tsCol?.getCanSort()
            const canResize = !!tsCol?.getCanResize()
            const canHide = col.hideable === true && !!onHiddenChange
            const canPin = pinningEnabled && tsCol?.getCanPin()
            const items: ReactNode[] = []
            if (canSort) {
              items.push(
                <button
                  key="sort-asc"
                  type="button"
                  className="sf-col-ctx-item"
                  onClick={() => {
                    tsCol?.toggleSorting(false)
                    setCtxMenu(null)
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                  오름차순 정렬{sorted === "asc" ? " ✓" : ""}
                </button>,
                <button
                  key="sort-desc"
                  type="button"
                  className="sf-col-ctx-item"
                  onClick={() => {
                    tsCol?.toggleSorting(true)
                    setCtxMenu(null)
                  }}
                >
                  <ArrowDown className="h-3 w-3" />
                  내림차순 정렬{sorted === "desc" ? " ✓" : ""}
                </button>,
              )
              if (sorted) {
                items.push(
                  <button
                    key="sort-clear"
                    type="button"
                    className="sf-col-ctx-item"
                    onClick={() => {
                      tsCol?.clearSorting()
                      setCtxMenu(null)
                    }}
                  >
                    <ArrowUpDown className="h-3 w-3" />
                    정렬 해제
                  </button>,
                )
              }
            }
            if (canPin) {
              if (items.length > 0) items.push(<div key="sep-pin" className="sf-col-ctx-sep" />)
              if (pinned === "left") {
                items.push(
                  <button
                    key="unpin"
                    type="button"
                    className="sf-col-ctx-item"
                    onClick={() => {
                      tsCol?.pin(false)
                      setCtxMenu(null)
                    }}
                  >
                    <PinOff className="h-3 w-3" />
                    왼쪽 고정 해제
                  </button>,
                )
              } else {
                items.push(
                  <button
                    key="pin-left"
                    type="button"
                    className="sf-col-ctx-item"
                    onClick={() => {
                      tsCol?.pin("left")
                      setCtxMenu(null)
                    }}
                  >
                    <Pin className="h-3 w-3 -rotate-90" />
                    왼쪽 고정
                  </button>,
                )
              }
              if (pinned === "right") {
                items.push(
                  <button
                    key="unpin-r"
                    type="button"
                    className="sf-col-ctx-item"
                    onClick={() => {
                      tsCol?.pin(false)
                      setCtxMenu(null)
                    }}
                  >
                    <PinOff className="h-3 w-3" />
                    오른쪽 고정 해제
                  </button>,
                )
              } else {
                items.push(
                  <button
                    key="pin-right"
                    type="button"
                    className="sf-col-ctx-item"
                    onClick={() => {
                      tsCol?.pin("right")
                      setCtxMenu(null)
                    }}
                  >
                    <Pin className="h-3 w-3 rotate-90" />
                    오른쪽 고정
                  </button>,
                )
              }
            }
            if (canResize) {
              if (items.length > 0) items.push(<div key="sep-w" className="sf-col-ctx-sep" />)
              items.push(
                <button
                  key="reset-width"
                  type="button"
                  className="sf-col-ctx-item"
                  onClick={() => {
                    tsCol?.resetSize()
                    setCtxMenu(null)
                  }}
                >
                  <RotateCcw className="h-3 w-3" />폭 기본값
                </button>,
              )
            }
            if (canHide) {
              if (items.length > 0) items.push(<div key="sep-h" className="sf-col-ctx-sep" />)
              items.push(
                <button
                  key="hide"
                  type="button"
                  className="sf-col-ctx-item sf-col-ctx-danger"
                  onClick={() => {
                    const next = new Set(hidden)
                    next.add(ctxMenu.columnId)
                    onHiddenChange?.(next)
                    setCtxMenu(null)
                  }}
                >
                  <EyeOff className="h-3 w-3" />열 숨기기
                </button>,
              )
            }
            if (items.length === 0) return null
            return (
              <FloatingPortal>
                <motion.div
                  key="ctx-menu"
                  ref={ctxRefs.setFloating}
                  style={ctxFloatingStyles}
                  className="sf-col-ctx-menu"
                  onMouseDown={(e) => e.stopPropagation()}
                  role="menu"
                  initial={{ opacity: 0, scale: 0.94, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -4 }}
                  transition={{ duration: 0.11, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {items}
                </motion.div>
              </FloatingPortal>
            )
          })()}
      </AnimatePresence>
    </div>
  )
}

function buildPageRange(current: number, total: number, neighbors = 1): (number | "ellipsis")[] {
  if (total <= 1) return []
  const range: (number | "ellipsis")[] = []
  for (let i = 0; i < total; i++) {
    if (i === 0 || i === total - 1 || (i >= current - neighbors && i <= current + neighbors)) {
      range.push(i)
    } else if (range[range.length - 1] !== "ellipsis") {
      range.push("ellipsis")
    }
  }
  return range
}

export default MetaTable
