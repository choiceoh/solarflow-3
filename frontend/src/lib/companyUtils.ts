// D-060: "전체(all)" 법인 선택 시 다중 법인 조회 지원
import { fetchWithAuth } from './api';
import { useAppStore } from '@/stores/appStore';

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

/** 활성 법인 ID 목록 — appStore에서 가져옴 (중복 호출 제거) */
async function getActiveCompanyIds(): Promise<string[]> {
  const store = useAppStore.getState();
  if (store.companiesLoaded) {
    return store.companies.map((c) => c.company_id);
  }
  await store.loadCompanies();
  return useAppStore.getState().companies.map((c) => c.company_id);
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
  // 법인별 호출은 Promise.allSettled로 모은 뒤, 하나라도 실패하면 명시적으로 throw
  // — 일부 법인이 빠진 합산을 정상처럼 보여주는 것이 가장 위험한 시나리오이므로
  //   호출자가 부분 실패를 인지하고 에러 상태를 표시하도록 함
  const settled = await Promise.allSettled(
    ids.map((id) =>
      fetchWithAuth<T>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ company_id: id, ...extraBody }),
      }),
    ),
  );

  const failed = settled
    .map((r, i) => ({ r, id: ids[i] }))
    .filter((x) => x.r.status === 'rejected');

  if (failed.length > 0) {
    const reasons = failed
      .map((x) => `${x.id}: ${(x.r as PromiseRejectedResult).reason?.message ?? 'unknown'}`)
      .join('; ');
    console.warn(`[SolarFlow] 다중 법인 조회 실패 (${endpoint}): ${reasons}`);
    throw new Error(`전체 법인 계산 중 ${failed.length}/${ids.length}개 법인 계산에 실패했습니다 (${reasons})`);
  }

  const values = settled.map((r) => (r as PromiseFulfilledResult<T>).value);
  return merge(values);
}
