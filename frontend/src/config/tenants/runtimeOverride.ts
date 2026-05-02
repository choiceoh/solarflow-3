// Phase 4 PoC: tenant 별 runtime override (localStorage)
// 운영자(admin) 가 GUI 로 편집해 코드 오버레이 위에 한 층 더 얹음.
// 적용 흐름: defaultConfig → 코드 tenant overlay → runtime tenant overlay → DB override → 화면

import type { ScreenOverride, FormOverride } from './index';
import type { TenantId } from '@/stores/tenantStore';
import { pushHistory } from './runtimeOverrideHistory';

export type ConfigKind = 'screen' | 'form';

const STORAGE_PREFIX = 'sf.tenant';
function key(tenantId: TenantId, kind: ConfigKind, configId: string): string {
  return `${STORAGE_PREFIX}.${tenantId}.${kind}.${configId}`;
}

export function loadRuntimeOverride<T = ScreenOverride | FormOverride>(
  tenantId: TenantId, kind: ConfigKind, configId: string,
): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key(tenantId, kind, configId));
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function saveRuntimeOverride(
  tenantId: TenantId, kind: ConfigKind, configId: string,
  override: ScreenOverride | FormOverride,
): void {
  if (typeof localStorage === 'undefined') return;
  // 이전 값을 이력에 push (실수 복구용 안전망)
  pushHistory(tenantId, kind, configId, loadRuntimeOverride(tenantId, kind, configId));
  localStorage.setItem(key(tenantId, kind, configId), JSON.stringify(override));
  // 화면/폼이 즉시 반영하도록 이벤트 발행
  window.dispatchEvent(new CustomEvent('sf-tenant-runtime-changed', {
    detail: { tenantId, kind, configId },
  }));
}

export function clearRuntimeOverride(tenantId: TenantId, kind: ConfigKind, configId: string): void {
  if (typeof localStorage === 'undefined') return;
  // 이전 값을 이력에 push (삭제 후에도 복원 가능)
  pushHistory(tenantId, kind, configId, loadRuntimeOverride(tenantId, kind, configId));
  localStorage.removeItem(key(tenantId, kind, configId));
  window.dispatchEvent(new CustomEvent('sf-tenant-runtime-changed', {
    detail: { tenantId, kind, configId },
  }));
}

// 모든 tenant runtime overrides 목록 — 편집기에서 활성 표시용
export function listRuntimeOverrides(): { tenantId: TenantId; kind: ConfigKind; configId: string }[] {
  if (typeof localStorage === 'undefined') return [];
  const out: { tenantId: TenantId; kind: ConfigKind; configId: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX + '.')) continue;
    const parts = k.slice(STORAGE_PREFIX.length + 1).split('.');
    if (parts.length < 3) continue;
    const [tenantId, kind, ...rest] = parts;
    if ((tenantId === 'topworks' || tenantId === 'topenergy') && (kind === 'screen' || kind === 'form')) {
      out.push({ tenantId, kind, configId: rest.join('.') });
    }
  }
  return out;
}
