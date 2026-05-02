// Phase 4 PoC: 계열사 포크 — tenant override 프레임워크
// 메타 화면/폼 config 에 tenant 별 오버레이를 적용.
// 동일 코드 베이스로 다른 도메인(라벨/컬럼/필드/메트릭) 시연 가능.

import type { ListScreenConfig, MetaFormConfig } from '@/templates/types';
import type { TenantId } from '@/stores/tenantStore';
import { topEnergyOverrides } from './topenergy';

// 부분 override — 모든 필드 선택적
// 배열(columns/metrics/sections 등)은 override 가 있으면 통째로 교체
// page / title 같은 객체는 shallow merge 됨
export type ScreenOverride = Partial<Omit<ListScreenConfig, 'page'>> & {
  page?: Partial<ListScreenConfig['page']>;
};
export type FormOverride = Partial<Omit<MetaFormConfig, 'title'>> & {
  title?: Partial<MetaFormConfig['title']>;
};

export interface TenantOverrides {
  // config.id → override 매핑 (예: { companies: {...}, banks: {...} })
  screens?: Record<string, ScreenOverride>;
  forms?: Record<string, FormOverride>;
}

// tenant 별 overrides 레지스트리
export const tenantOverrides: Record<TenantId, TenantOverrides> = {
  topworks: {},  // 기본 — 오버레이 없음
  topenergy: topEnergyOverrides,
};

// override 적용 — 객체는 shallow merge, 그 외(배열/원시값)는 교체
// nestedKeys: 객체로 deep-merge 할 필드 (예: 'page', 'title')
function applyOverride<T>(
  base: T,
  override: Partial<T> | undefined,
  nestedKeys: string[],
): T {
  if (!override) return base;
  const baseRec = base as unknown as Record<string, unknown>;
  const overRec = override as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = { ...baseRec };
  for (const [k, v] of Object.entries(overRec)) {
    if (v === undefined) continue;
    if (nestedKeys.includes(k) && v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const baseVal = baseRec[k];
      const baseObj = (baseVal && typeof baseVal === 'object' ? baseVal : {}) as Record<string, unknown>;
      result[k] = { ...baseObj, ...(v as Record<string, unknown>) };
    } else {
      result[k] = v;
    }
  }
  return result as T;
}

// Runtime override 가 있으면 코드 overlay 위에 한 층 더 적용
// 적용 흐름: base → 코드 overlay → runtime overlay → 결과
import { loadRuntimeOverride } from './runtimeOverride';

export function applyTenantToScreen(
  base: ListScreenConfig,
  tenantId: TenantId,
): ListScreenConfig {
  const codeOverride = tenantOverrides[tenantId]?.screens?.[base.id];
  const afterCode = applyOverride(base, codeOverride as Partial<ListScreenConfig> | undefined, ['page']);
  const runtimeOverride = loadRuntimeOverride<ScreenOverride>(tenantId, 'screen', base.id);
  return applyOverride(afterCode, runtimeOverride as Partial<ListScreenConfig> | undefined, ['page']);
}

export function applyTenantToForm(
  base: MetaFormConfig,
  tenantId: TenantId,
): MetaFormConfig {
  const codeOverride = tenantOverrides[tenantId]?.forms?.[base.id];
  const afterCode = applyOverride(base, codeOverride as Partial<MetaFormConfig> | undefined, ['title']);
  const runtimeOverride = loadRuntimeOverride<FormOverride>(tenantId, 'form', base.id);
  return applyOverride(afterCode, runtimeOverride as Partial<MetaFormConfig> | undefined, ['title']);
}
