// PaginationBar — 서버 페이지네이션 표 하단 (예: "1–100 / 1234 · ‹ 1 2 3 ... ›").
// 4 ListTable (POListTable / LCListTable / TTListTable / BLListTable) 공유.

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  page: number              // 1-based
  pageSize: number
  total: number             // 전체 행 수 (X-Total-Count)
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}

const DEFAULT_PAGE_SIZES = [50, 100, 200]

export default function PaginationBar({
  page, pageSize, total, onPageChange, onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES, className,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className={cn('flex items-center justify-between gap-2 border-t bg-background px-3 py-2 text-xs', className)}>
      <div className="text-muted-foreground tabular-nums">
        {total === 0 ? '0건' : `${start.toLocaleString('ko-KR')}–${end.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}건`}
      </div>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select
            className="h-7 rounded border bg-background px-2 text-xs"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}건/p</option>
            ))}
          </select>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <span className="text-muted-foreground tabular-nums min-w-[64px] text-center">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}
