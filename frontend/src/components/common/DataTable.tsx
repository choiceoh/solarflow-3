import { useMemo, type ReactNode } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TableSummaryMode } from "@/lib/tableSummary"
import EmptyState from "./EmptyState"
import MetaTable, { type ColumnDef } from "./MetaTable"
import SearchInput from "./SearchInput"

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  render?: (row: T) => ReactNode
  /** 헤더 셀 커스텀 렌더 — 모두선택 체크박스 등. 지정 시 label 대신 사용. */
  headerCell?: () => ReactNode
  /** 기본 폭(px). 좁은 셀렉트 컬럼처럼 고정 폭이 필요할 때 사용. */
  defaultWidth?: number
  resizable?: boolean
  reorderable?: boolean
  pinnable?: boolean
  summary?: TableSummaryMode
  summaryAccessor?: (row: T) => number | null | undefined
  summaryFormatter?: (value: number, rows: T[]) => ReactNode
}

interface DataTableProps<T extends object> {
  columns: Column<T>[]
  data: T[]
  loading: boolean
  /** 데이터 로드 실패 메시지. 비어있지 않으면 loading/data 보다 우선해서 error EmptyState 렌더. */
  error?: string | null
  /** 실패 시 재시도 버튼 핸들러 — error 와 함께 지정해야 노출. */
  onRetry?: () => void
  searchable?: boolean
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  actions?: (row: T) => ReactNode
  emptyMessage?: string
  defaultSort?: { key: string; direction: "asc" | "desc" }
  footer?: ReactNode
}

const NO_HIDDEN_COLUMNS = new Set<string>()

function getCellValue<T extends object>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}

function getSortValue<T extends object>(
  row: T,
  key: string,
): string | number | Date | null | undefined {
  const value = getCellValue(row, key)
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Date
  ) {
    return value
  }
  return ""
}

export default function DataTable<T extends object>({
  columns,
  data,
  loading,
  error,
  onRetry,
  searchable,
  searchPlaceholder,
  onSearch,
  actions,
  emptyMessage,
  defaultSort,
  footer,
}: DataTableProps<T>) {
  const rowKeys = useMemo(() => {
    const map = new Map<T, string>()
    data.forEach((row, index) => {
      const id = getCellValue(row, "id")
      map.set(row, String(id ?? index))
    })
    return map
  }, [data])

  const metaColumns = useMemo<ColumnDef<T>[]>(() => {
    const mapped = columns.map(
      (col): ColumnDef<T> => ({
        key: col.key,
        label: col.label,
        cell: (row) => (col.render ? col.render(row) : String(getCellValue(row, col.key) ?? "—")),
        headerCell: col.headerCell,
        sortAccessor: col.sortable ? (row) => getSortValue(row, col.key) : undefined,
        defaultWidth: col.defaultWidth,
        resizable: col.resizable,
        reorderable: col.reorderable,
        pinnable: col.pinnable,
        summary: col.summary,
        summaryAccessor: col.summaryAccessor,
        summaryFormatter: col.summaryFormatter,
      }),
    )

    if (actions) {
      mapped.push({
        key: "__actions",
        label: "수정",
        cell: actions,
        align: "right",
        resizable: false,
        reorderable: false,
        pinnable: false,
        defaultWidth: 96,
        summary: false,
      })
    }

    return mapped
  }, [columns, actions])

  return (
    <div className="space-y-3">
      {searchable && onSearch && (
        <SearchInput placeholder={searchPlaceholder} onChange={onSearch} />
      )}
      <div className="rounded-md border">
        {error ? (
          <EmptyState
            tone="error"
            message="데이터를 불러오지 못했습니다"
            description={error}
            actionLabel={onRetry ? "다시 시도" : undefined}
            onAction={onRetry}
          />
        ) : loading ? (
          <div className="sf-meta-table sf-meta-table-loading" aria-busy="true">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.key}>{col.label}</TableHead>
                  ))}
                  {actions && <TableHead className="w-20">수정</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {columns.map((col, colIndex) => (
                      <TableCell key={col.key}>
                        <div
                          className="sf-skeleton h-4"
                          style={{ width: `${88 - ((rowIndex + colIndex) % 4) * 4}%` }}
                        />
                      </TableCell>
                    ))}
                    {actions && (
                      <TableCell>
                        <div className="sf-skeleton h-4 w-12" />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <MetaTable
            columns={metaColumns}
            hidden={NO_HIDDEN_COLUMNS}
            items={data}
            getRowKey={(row) => rowKeys.get(row) ?? ""}
            defaultSort={defaultSort}
            emptyMessage={emptyMessage}
            footer={footer}
            fillWidth
          />
        )}
      </div>
    </div>
  )
}
