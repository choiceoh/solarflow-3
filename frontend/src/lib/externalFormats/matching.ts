// 외부 양식 변환기에서 사용하는 마스터 매칭 유틸 (D-056).
//
// 정책 (사용자 지시):
//   1. 정확/정규화 일치 → 자동 매핑 (level: 'exact')
//   2. 유사 후보 있음 (Levenshtein ≤ 2 또는 substring) → 사용자 확인 (level: 'fuzzy')
//   3. 비슷한 것 전혀 없음 → 자동 신규 등록 (level: 'none')

import type { CompanyAlias, ProductAlias } from '@/types/aliases';

export interface CompanyLite {
  company_id: string;
  company_code: string;
  company_name: string;
}

export interface ProductLite {
  product_id: string;
  product_code: string;
  product_name?: string;
}

export type MatchLevel = 'exact' | 'fuzzy' | 'none';

export interface CompanyMatchResult {
  level: MatchLevel;
  matched?: CompanyLite;          // exact 일 때 채워짐
  candidates?: CompanyLite[];     // fuzzy 일 때 후보들 (최대 5)
  normalizedKey: string;          // alias 학습 시 사용
}

export interface ProductMatchResult {
  level: MatchLevel;
  matched?: ProductLite;
  candidates?: ProductLite[];
  normalizedKey: string;
}

// ──────────────────── 정규화 ────────────────────

const CORP_TOKENS = ['(주)', '㈜', '주식회사', '(株)', '(유)', '(합)'];

export function normalizeCompanyName(s: string): string {
  let out = String(s ?? '').trim();
  for (const t of CORP_TOKENS) {
    out = out.split(t).join('');
  }
  // 공백·하이픈·점 제거 + 소문자
  return out.replace(/[\s\-_.·,]/g, '').toLowerCase();
}

export function normalizeProductCode(s: string): string {
  // 영숫자만 + 대문자
  return String(s ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// ──────────────────── 거리·유사도 ────────────────────

// Levenshtein 편집거리 (문자열 길이 max ~50 이라 단순 DP 충분).
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

// 유사 후보 판별: 정규화 후 한쪽이 다른쪽의 substring 이거나, 편집거리 ≤ threshold.
// threshold 는 짧은 문자열은 1, 긴 문자열은 2.
export function isSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const threshold = Math.min(a.length, b.length) <= 6 ? 1 : 2;
  return levenshtein(a, b) <= threshold;
}

// ──────────────────── 회사 매칭 ────────────────────

export function findCompanyMatch(
  rawName: string,
  master: CompanyLite[],
  aliases: CompanyAlias[],
): CompanyMatchResult {
  const key = normalizeCompanyName(rawName);
  if (!key) return { level: 'none', normalizedKey: '' };

  // 1) alias 사전 hit
  const aliasHit = aliases.find((a) => a.alias_text_normalized === key);
  if (aliasHit) {
    const matched = master.find((c) => c.company_id === aliasHit.canonical_company_id);
    if (matched) return { level: 'exact', matched, normalizedKey: key };
  }

  // 2) 마스터 정규화 일치 (코드 또는 이름)
  for (const c of master) {
    if (
      normalizeCompanyName(c.company_code) === key
      || normalizeCompanyName(c.company_name) === key
    ) {
      return { level: 'exact', matched: c, normalizedKey: key };
    }
  }

  // 3) 유사 후보
  const candidates: CompanyLite[] = [];
  for (const c of master) {
    if (
      isSimilar(normalizeCompanyName(c.company_name), key)
      || isSimilar(normalizeCompanyName(c.company_code), key)
    ) {
      candidates.push(c);
      if (candidates.length >= 5) break;
    }
  }
  if (candidates.length > 0) {
    return { level: 'fuzzy', candidates, normalizedKey: key };
  }

  return { level: 'none', normalizedKey: key };
}

// ──────────────────── 품번 매칭 ────────────────────

export function findProductMatch(
  rawCode: string,
  master: ProductLite[],
  aliases: ProductAlias[],
): ProductMatchResult {
  const key = normalizeProductCode(rawCode);
  if (!key) return { level: 'none', normalizedKey: '' };

  const aliasHit = aliases.find((a) => a.alias_code_normalized === key);
  if (aliasHit) {
    const matched = master.find((p) => p.product_id === aliasHit.canonical_product_id);
    if (matched) return { level: 'exact', matched, normalizedKey: key };
  }

  for (const p of master) {
    if (normalizeProductCode(p.product_code) === key) {
      return { level: 'exact', matched: p, normalizedKey: key };
    }
  }

  const candidates: ProductLite[] = [];
  for (const p of master) {
    if (isSimilar(normalizeProductCode(p.product_code), key)) {
      candidates.push(p);
      if (candidates.length >= 5) break;
    }
  }
  if (candidates.length > 0) {
    return { level: 'fuzzy', candidates, normalizedKey: key };
  }

  return { level: 'none', normalizedKey: key };
}
