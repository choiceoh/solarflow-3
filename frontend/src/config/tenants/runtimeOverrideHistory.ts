// Phase 4 보강: tenant runtime override 의 변경 이력 (localStorage)
// 매 saveRuntimeOverride / clearRuntimeOverride 호출 시 "이전 값" 을 push.
// 편집기에서 "이력" 드롭다운으로 복원 가능 — 잘못 적용 시 안전망.
//
// 이력 키 prefix 가 `sf.tenant-history.` 라서 `sf.tenant.` 로 시작하는
// listRuntimeOverrides() 와 충돌하지 않음 (false positive 없음).

import type { TenantId } from '@/stores/tenantStore';
import type { ConfigKind } from './runtimeOverride';

const HISTORY_PREFIX = 'sf.tenant-history';
const MAX_ENTRIES = 10;

export interface HistoryEntry {
  ts: number; // Unix ms
  value: unknown | null; // null = 이전 상태 = override 없음 (삭제됨 또는 처음)
}

function key(tenantId: TenantId, kind: ConfigKind, configId: string): string {
  return `${HISTORY_PREFIX}.${tenantId}.${kind}.${configId}`;
}

export function loadHistory(tenantId: TenantId, kind: ConfigKind, configId: string): HistoryEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key(tenantId, kind, configId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function pushHistory(
  tenantId: TenantId, kind: ConfigKind, configId: string, prev: unknown | null,
): void {
  if (typeof localStorage === 'undefined') return;
  const list = loadHistory(tenantId, kind, configId);
  // 같은 값 연속 push 방지 (포맷만 바꾼 케이스)
  const last = list[0];
  if (last && JSON.stringify(last.value) === JSON.stringify(prev)) return;
  const next: HistoryEntry[] = [{ ts: Date.now(), value: prev }, ...list].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(key(tenantId, kind, configId), JSON.stringify(next));
  } catch {
    // quota exceeded 등은 무시 (이력은 best-effort)
  }
}

export function clearHistory(tenantId: TenantId, kind: ConfigKind, configId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(key(tenantId, kind, configId));
}
