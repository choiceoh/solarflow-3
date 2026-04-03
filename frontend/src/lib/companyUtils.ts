// D-060: "전체(all)" 법인 선택 시 다중 법인 조회 지원
import { fetchWithAuth } from './api';
import type { Company } from '@/types/masters';

let cachedCompanyIds: string[] | null = null;
let cacheTimer: ReturnType<typeof setTimeout> | null = null;

/** "all"이거나 falsy이면 전체 법인 모드 */
export function isAllCompanies(id: string | null): boolean {
  return !id || id === 'all';
}

/** CRUD API용 URLSearchParams — "all"이면 company_id 생략 */
export function companyParams(companyId: string | null): URLSearchParams {
  if (isAllCompanies(companyId)) return new URLSearchParams();
  return new URLSearchParams({ company_id: companyId! });
}

/** CRUD GET URL — "all"이면 company_id 쿼리 파라미터 생략 */
export function companyQueryUrl(base: string, companyId: string | null): string {
  if (isAllCompanies(companyId)) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}company_id=${companyId}`;
}

/** 활성 법인 ID 목록 (5분 캐시) */
async function getActiveCompanyIds(): Promise<string[]> {
  if (cachedCompanyIds) return cachedCompanyIds;
  const companies = await fetchWithAuth<Company[]>('/api/v1/companies');
  cachedCompanyIds = companies.filter((c) => c.is_active).map((c) => c.company_id);
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => { cachedCompanyIds = null; }, 5 * 60 * 1000);
  return cachedCompanyIds;
}

/**
 * Calc API 호출 — "all"이면 법인별로 호출 후 merge, 아니면 단일 호출
 */
export async function fetchCalc<T>(
  companyId: string | null,
  endpoint: string,
  extraBody: Record<string, unknown>,
  merge: (results: T[]) => T,
): Promise<T> {
  if (!isAllCompanies(companyId)) {
    return fetchWithAuth<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId, ...extraBody }),
    });
  }
  const ids = await getActiveCompanyIds();
  const results = await Promise.all(
    ids.map((id) =>
      fetchWithAuth<T>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ company_id: id, ...extraBody }),
      }).catch(() => null)
    ),
  );
  const valid = results.filter((r) => r !== null) as T[];
  return merge(valid);
}
