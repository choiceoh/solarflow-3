// Insights 드릴다운 페이지용 집계 유틸 — sparkUtils 보다 큰 윈도우 + 차원별 분해.
//
// sparkUtils.monthlyTrend 는 KPI 타일 sparkline (최근 6개월) 용도라 윈도우가 짧다.
// 드릴다운 페이지는 YoY 비교가 가능해야 하므로 24개월(2년) 윈도우를 기본으로 쓴다.

const TREND_MONTHS = 24

function dateToMonth(s: string | null | undefined): string | null {
  if (!s) return null
  const m = String(s).slice(0, 7)
  return /^\d{4}-\d{2}$/.test(m) ? m : null
}

function monthsAgoLabel(n: number): string {
  const d = new Date()
  const target = new Date(d.getFullYear(), d.getMonth() - n, 1)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
}

function monthLabels(from: string, to: string): string[] {
  if (from > to) return []
  const [fy, fm] = from.split('-').map(Number) as [number, number]
  const [ty, tm] = to.split('-').map(Number) as [number, number]
  const out: string[] = []
  let y = fy
  let m = fm
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { y += 1; m = 1 }
  }
  return out
}

export interface TrendPoint {
  month: string  // 'YYYY-MM'
  value: number
}

// 24개월 (또는 데이터 시작월부터 — 더 짧으면) 월별 트렌드.
// reducer 가 'count' 면 행 개수, 'sum' 이면 getValue 합계.
export function trend24<T>(
  items: readonly T[],
  getDate: (item: T) => string | null | undefined,
  getValue?: (item: T) => number,
): TrendPoint[] {
  const start = monthsAgoLabel(TREND_MONTHS - 1)
  const end = monthsAgoLabel(0)
  const labels = monthLabels(start, end)
  const idx = new Map(labels.map((l, i) => [l, i] as const))
  const buckets = labels.map(() => 0)
  for (const item of items) {
    const m = dateToMonth(getDate(item))
    if (!m) continue
    const i = idx.get(m)
    if (i === undefined) continue
    buckets[i] += getValue ? (getValue(item) || 0) : 1
  }
  return labels.map((month, i) => ({ month, value: buckets[i]! }))
}

export interface BreakdownRow {
  key: string
  label: string
  value: number
  share: number  // 0..1
  count: number  // 항목 수
}

// items 를 dimension 별로 묶고, value 합계 / share / count 계산. value 내림차순 정렬.
// label 미지정 시 fallback 표기 ('미지정').
export function breakdownBy<T>(
  items: readonly T[],
  getKey: (item: T) => string | null | undefined,
  getLabel: (item: T) => string | null | undefined,
  getValue: (item: T) => number,
): BreakdownRow[] {
  const map = new Map<string, { label: string; value: number; count: number }>()
  let total = 0
  for (const item of items) {
    const v = getValue(item) || 0
    if (!Number.isFinite(v)) continue
    const key = getKey(item) || '__unset__'
    const label = getLabel(item) || '미지정'
    const cur = map.get(key)
    if (cur) {
      cur.value += v
      cur.count += 1
    } else {
      map.set(key, { label, value: v, count: 1 })
    }
    total += v
  }
  const rows: BreakdownRow[] = []
  for (const [key, { label, value, count }] of map) {
    rows.push({
      key,
      label,
      value,
      count,
      share: total > 0 ? value / total : 0,
    })
  }
  rows.sort((a, b) => b.value - a.value)
  return rows
}

// MM 라벨 ('1월' / '12월') — XAxis tick 용.
export function monthShort(label: string): string {
  const m = label.split('-')[1]
  return m ? `${Number(m)}월` : label
}
