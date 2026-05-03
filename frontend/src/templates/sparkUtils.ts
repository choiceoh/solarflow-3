// KPI 타일 sparkline 데이터 생성 유틸 — 실제 데이터 또는 현재값 기반.
//
// 원칙:
// - 시계열이 있으면 monthlyTrend / monthlyCount 로 월 버킷 집계
//   · 데이터 범위가 MAX_TREND_MONTHS 이상이면 [현재월-(MAX-1) → 현재월] 최근 구간만 표시
//   · 더 짧으면 [데이터 시작월 → 현재월] 전체 표시
//   · 좌측 = 시작점, 우측 = 현재월
// - 시계열이 없는 스냅샷 메트릭은 flatSpark 로 "이전과 같다고 가정"한 평행선
// 가짜 데이터(라벨 해시 기반 generic 모양)는 더 이상 사용하지 않는다.

const FLAT_POINTS = 8;
const MAX_TREND_MONTHS = 6;

export function flatSpark(value: number, count = FLAT_POINTS): number[] {
  const v = Number.isFinite(value) ? value : 0;
  return Array.from({ length: count }, () => v);
}

// UI 포맷 문자열 ("1.23억", "12,345", "78.5%") 에서 숫자 부분만 파싱.
function parseNumeric(s: string): number {
  const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

export function flatSparkFromValue(value: string | number, count = FLAT_POINTS): number[] {
  const n = typeof value === 'number' ? value : parseNumeric(value);
  return flatSpark(n, count);
}

function dateToMonth(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 현재월 기준 N개월 전 ('YYYY-MM'). N=0 이면 현재월.
function monthsAgo(n: number): string {
  const d = new Date();
  const target = new Date(d.getFullYear(), d.getMonth() - n, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' 라벨 from..to (양 끝 포함). from > to 면 빈 배열.
function monthLabels(from: string, to: string): string[] {
  if (from > to) return [];
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { y += 1; m = 1; }
  }
  return out;
}

// 항목들을 월 버킷으로 집계. 좌측 경계는 max(데이터 최초월, 현재월-(MAX_TREND_MONTHS-1)).
// 데이터가 없거나 유효한 날짜가 하나도 없으면 빈 배열 (Sparkline 미표시).
export function monthlyTrend<T>(
  items: readonly T[],
  getDate: (item: T) => string | null | undefined,
  getValue: (item: T) => number,
): number[] {
  let minMonth: string | null = null;
  for (const item of items) {
    const m = dateToMonth(getDate(item));
    if (m && (minMonth === null || m < minMonth)) minMonth = m;
  }
  if (minMonth === null) return [];
  const cap = monthsAgo(MAX_TREND_MONTHS - 1);
  const start = minMonth < cap ? cap : minMonth;
  const labels = monthLabels(start, currentMonth());
  const idx = new Map(labels.map((l, i) => [l, i] as const));
  const buckets = labels.map(() => 0);
  for (const item of items) {
    const m = dateToMonth(getDate(item));
    if (!m) continue;
    const i = idx.get(m);
    if (i !== undefined) buckets[i] += getValue(item);
  }
  return buckets;
}

export function monthlyCount<T>(
  items: readonly T[],
  getDate: (item: T) => string | null | undefined,
): number[] {
  return monthlyTrend(items, getDate, () => 1);
}
