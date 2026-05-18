// KPI scope 별 metric 옵션(라벨 포함)을 localStorage 에 캐시.
//
// 목적: 운영자 UI 기본값 페이지가 각 KPI 섹션의 metric 목록을 사람용 라벨과 함께
// 보여줄 수 있도록 한다. 페이지가 한 번이라도 마운트된 적이 있으면 그 시점의
// metric 목록이 캐시에 남고, 운영자는 OperatorUiDefaultsPage 에서 그걸 본다.
//
// 캐시 키: `sf.kpi-options.{scopeId}` → `{ options: [{id,label}], updatedAt }`.
// 페이지 metrics 가 바뀌면 다음 마운트 때 덮어쓴다. TTL 없이 영구 캐시 — 한
// 브라우저에서 한 번만 방문해도 영속한다.
//
// 운영자가 본 적 없는 scope 는 캐시에 없으므로, 그 페이지로 가서 한 번 열어달라고
// 안내해야 한다(OperatorUiDefaultsPage 에 hint 표시).

import type { KpiVisibilityOption } from '@/hooks/useKpiVisibility';

const PREFIX = 'sf.kpi-options.';

interface CacheEntry {
  options: KpiVisibilityOption[];
  updatedAt: number;
}

export function saveKpiOptions(scopeId: string, options: KpiVisibilityOption[]): void {
  if (typeof localStorage === 'undefined') return;
  if (!scopeId || options.length === 0) return;
  try {
    const payload: CacheEntry = { options, updatedAt: Date.now() };
    localStorage.setItem(PREFIX + scopeId, JSON.stringify(payload));
  } catch {
    // localStorage 가득찼거나 비활성 — 조용히 무시. 캐시는 best-effort.
  }
}

export function loadKpiOptions(scopeId: string): KpiVisibilityOption[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFIX + scopeId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (!parsed || !Array.isArray(parsed.options)) return null;
    return parsed.options
      .filter((o): o is KpiVisibilityOption =>
        !!o && typeof o.id === 'string' && typeof o.label === 'string',
      );
  } catch {
    return null;
  }
}

/** 캐시된 모든 scope id 를 나열. operator UI 가 모르는 scope 도 노출하고 싶을 때 사용. */
export function listCachedKpiScopes(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      out.push(key.slice(PREFIX.length));
    }
  }
  return out;
}
