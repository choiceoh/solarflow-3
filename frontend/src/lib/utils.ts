import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getCurrentPreferences } from "@/stores/preferencesStore"
import type { AmountUnit, CapacityUnit, UserPreferences } from "@/types/models"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- 포맷 유틸 ---

export function formatNumber(n: number | null | undefined): string {
  const value = Number(n);
  return Number.isFinite(value) ? value.toLocaleString('ko-KR') : '—';
}

export function formatUSD(n: number | null | undefined): string {
  const value = Number(n);
  return Number.isFinite(value)
    ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
}

// --- 금액 단위 환산 (개인 설정 amount_unit 적용) ---
// 기본은 store의 현재 prefs를 자동 참조 (Q7-C: 모든 호출처 자동 새 동작).
// 단위 변환 후 절댓값이 0.1 미만이면 한 단계 작은 단위로 강등 (Q11 fallback).

const AMOUNT_DIVISOR: Record<Exclude<AmountUnit, 'auto'>, number> = {
  won: 1,
  thousand: 1_000,
  manwon: 10_000,
  million: 1_000_000,
  eok: 100_000_000,
};

const AMOUNT_SUFFIX: Record<Exclude<AmountUnit, 'auto'>, string> = {
  won: '원',
  thousand: '천원',
  manwon: '만원',
  million: '백만원',
  eok: '억원',
};

// 작은 단위로 강등 시 사용하는 우선순위(큰→작은). manwon→won 두 단계 점프 등.
const FALLBACK_ORDER: Exclude<AmountUnit, 'auto'>[] = ['eok', 'million', 'manwon', 'thousand', 'won'];

function pickAutoUnit(absValue: number): Exclude<AmountUnit, 'auto'> {
  if (absValue >= 100_000_000) return 'eok';
  if (absValue >= 10_000) return 'manwon';
  return 'won';
}

function formatWithUnit(value: number, unit: Exclude<AmountUnit, 'auto'>): string {
  const divisor = AMOUNT_DIVISOR[unit];
  const suffix = AMOUNT_SUFFIX[unit];
  if (unit === 'won') {
    return `${Math.round(value).toLocaleString('ko-KR')}${suffix}`;
  }
  const scaled = value / divisor;
  return `${scaled.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`;
}

// 수동 단위 선택 시 너무 작은 값은 한 단계 작은 단위로 강등.
function applyFallback(value: number, unit: Exclude<AmountUnit, 'auto'>): Exclude<AmountUnit, 'auto'> {
  const idx = FALLBACK_ORDER.indexOf(unit);
  let current = unit;
  for (let i = idx; i < FALLBACK_ORDER.length - 1; i++) {
    const scaled = Math.abs(value) / AMOUNT_DIVISOR[current];
    if (scaled >= 0.1) return current;
    current = FALLBACK_ORDER[i + 1];
  }
  return 'won';
}

export function formatKRW(n: number | null | undefined, prefsOverride?: UserPreferences): string {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  const prefs = prefsOverride ?? getCurrentPreferences();
  const unit: Exclude<AmountUnit, 'auto'> =
    prefs.amount_unit === 'auto' ? pickAutoUnit(Math.abs(value)) : applyFallback(value, prefs.amount_unit);
  return formatWithUnit(value, unit);
}

export function formatPercent(n: number | null | undefined): string {
  const value = Number(n);
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—';
}

export function formatDate(d: string): string {
  if (!d) return '—';
  return d.slice(0, 10);
}

export function formatWp(n: number | null | undefined): string {
  const value = Number(n);
  return Number.isFinite(value) ? `${value}Wp` : '—';
}

// --- 용량 단위 환산 (개인 설정 capacity_unit 적용) ---
// auto: 1,000kW 기준 자동 (기존 동작 유지)
// kw: 항상 "X,XXXkW"
// mw: 항상 "X.XMW" (단, 0.1MW 미만이면 kW로 강등 — Q11 fallback)

function formatCapacityCore(kw: number, unit: CapacityUnit): string {
  if (unit === 'kw') {
    return `${Math.round(kw).toLocaleString('ko-KR')}kW`;
  }
  if (unit === 'mw') {
    if (Math.abs(kw) / 1000 < 0.1) {
      return `${Math.round(kw).toLocaleString('ko-KR')}kW`;
    }
    return `${(kw / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}MW`;
  }
  // auto: 기존 동작 — "X.XMW (X,XXXkW)"
  const mw = (kw / 1000).toFixed(1);
  const kwStr = Math.round(kw).toLocaleString('ko-KR');
  return `${mw}MW (${kwStr}kW)`;
}

/**
 * kW 값을 개인 설정 단위로 표시. 기본(자동) "X.XMW (X,XXXkW)".
 * EA는 formatCapacity로 추가.
 */
export function formatKw(n: number | null | undefined, prefsOverride?: UserPreferences): string {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  const prefs = prefsOverride ?? getCurrentPreferences();
  return formatCapacityCore(value, prefs.capacity_unit);
}

/**
 * kW + EA(모듈 장수) 동시 표시. show_ea=false 또는 ea 미지정 시 EA 생략.
 */
export function formatCapacity(kw: number | null | undefined, ea?: number, prefsOverride?: UserPreferences): string {
  const value = Number(kw);
  if (!Number.isFinite(value)) return '—';
  const prefs = prefsOverride ?? getCurrentPreferences();
  const base = formatCapacityCore(value, prefs.capacity_unit);
  if (!prefs.show_ea || ea == null || ea === 0) return base;
  const eaStr = `${Math.round(ea).toLocaleString('ko-KR')}EA`;
  // auto 모드: "X.XMW (X,XXXkW)" 형태 → 닫는 괄호 안에 EA 삽입
  if (prefs.capacity_unit === 'auto') {
    return `${base.slice(0, -1)} / ${eaStr})`;
  }
  // kw/mw 모드: "X kW" 또는 "X.X MW" → 괄호로 EA 추가
  return `${base} (${eaStr})`;
}

export function formatMW(n: number | null | undefined): string {
  const value = Number(n);
  return Number.isFinite(value) ? `${(value / 1000).toFixed(1)}MW` : '—';
}

export function formatSize(w: number, h: number): string {
  return `${w} x ${h} mm`;
}

// --- 모듈 레이블 ---

// ─── 제조사명 간략 표기 (실무 관행) ────────────────────────────────────────
// "진코솔라" → "진코", "트리나솔라" → "트리나", "LONGi" → "론지" 등
const _MFG_OVERRIDE: Record<string, string> = {
  longi: '론지',
  'longi solar': '론지',
  tongwei: '통웨이',
};
// 제거할 접미사 (긴 것 먼저 매칭)
const _MFG_SUFFIX_RE = /(에너지솔루션|에너지솔라|에너지|솔루션|솔라|[ ]?[Ss]olar[ ]?[Ee]nergy|[ ]?[Ss]olar|[ ]?[Ee]nergy)$/;

/**
 * 제조사 전체명 → 실무 약칭.
 * "진코솔라" → "진코", "트리나솔라" → "트리나", "라이젠에너지" → "라이젠", "LONGi" → "론지"
 */
export function shortMfgName(name: string | null | undefined): string {
  if (!name) return '—';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (_MFG_OVERRIDE[lower]) return _MFG_OVERRIDE[lower];
  return trimmed.replace(_MFG_SUFFIX_RE, '').trim() || trimmed;
}

/**
 * 제조사 약칭 + 사양 조합 레이블. 예: "진코 640W", "트리나 730W"
 * @param mfg   short_name 우선, 없으면 name_kr → shortMfgName 적용
 * @param specWp 모듈 사양(Wp). 없으면 제조사명만 반환
 */
export function moduleLabel(
  mfg: { short_name?: string | null; name_kr?: string | null } | string | null | undefined,
  specWp?: number | null,
): string {
  let name: string;
  if (!mfg) {
    name = '—';
  } else if (typeof mfg === 'string') {
    name = shortMfgName(mfg);   // 문자열은 자동 약칭 처리
  } else {
    // DB short_name이 있으면 그대로, 없으면 name_kr을 약칭 처리
    name = mfg.short_name?.trim() || shortMfgName(mfg.name_kr) || '—';
  }
  if (!specWp) return name;
  return `${name} ${specWp}W`;   // → "진코 640W"
}

/**
 * 제조사 ID로 약칭 조회 후 모듈 레이블 반환.
 * manufacturers 리스트가 있는 페이지 레벨에서 사용.
 */
export function moduleLabelById(
  manufacturers: { manufacturer_id: string; short_name?: string | null; name_kr?: string | null }[],
  manufacturerId: string | null | undefined,
  specWp?: number | null,
): string {
  const mfg = manufacturers.find((m) => m.manufacturer_id === manufacturerId);
  return moduleLabel(mfg ?? null, specWp);
}

// --- PO 정보 박스 공통 라벨 (LC/TT/BL 폼에서 공유) ---

type _POLineLike = {
  product_id?: string;
  product_code?: string;
  product_name?: string;
  spec_wp?: number;
  payment_type?: 'paid' | 'free' | null;
  products?: { product_code?: string; product_name?: string; spec_wp?: number };
};
type _ProductLike = { product_id: string; spec_wp?: number; product_code?: string; product_name?: string };

/**
 * "제조사/규격" 칸 표시용 — 제조사 약칭 + 첫 라인 spec_wp.
 * 예: "진코 640W"
 */
export function poMfgSpecLabel(
  manufacturerName: string | null | undefined,
  lines: _POLineLike[],
  products: _ProductLike[] = [],
): string {
  const first = lines[0];
  const prod = first ? products.find((p) => p.product_id === first.product_id) : undefined;
  const spec = prod?.spec_wp ?? first?.products?.spec_wp ?? first?.spec_wp;
  return moduleLabel(manufacturerName ?? null, spec);
}

/**
 * "품명 / 품번 외 N건" 요약. 기본은 유상(paid) 라인만 카운트 (무상 스페어 제외).
 */
export function poLineSummary(
  lines: _POLineLike[],
  products: _ProductLike[] = [],
  options?: { paidOnly?: boolean },
): { productName: string; productCodeWithCount: string; paidCount: number } {
  const paidOnly = options?.paidOnly !== false;
  const filtered = paidOnly
    ? lines.filter((l) => l.payment_type == null || l.payment_type === 'paid')
    : lines;
  const first = filtered[0];
  const prod = first ? products.find((p) => p.product_id === first.product_id) : undefined;
  const productName = prod?.product_name ?? first?.products?.product_name ?? first?.product_name ?? '—';
  const code = prod?.product_code ?? first?.products?.product_code ?? first?.product_code ?? '—';
  const productCodeWithCount = filtered.length > 1 ? `${code} 외 ${filtered.length - 1}건` : code;
  return { productName, productCodeWithCount, paidCount: filtered.length };
}
