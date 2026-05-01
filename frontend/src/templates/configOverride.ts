// Phase 3 PoC: 메타 config 오버라이드 — localStorage 기반
// ───────────────────────────────────────────────────────────────────────────
// 운영자가 GUI에서 화면/폼/상세 config를 편집하면 localStorage에 저장.
// 각 템플릿은 useResolvedConfig를 통해 default(코드 import) vs override(localStorage)를
// 우선순위로 선택. localStorage에 값 있으면 override 사용, 없으면 default.
//
// 다음 단계(별도 PR): localStorage → DB(`ui_configs` 테이블)로 저장소 교체.
// 이 파일의 인터페이스(load/save/clear/list)만 보존하면 호환됨.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'sf.ui-config:';

export type ConfigKind = 'screen' | 'form' | 'detail';

export function configKey(kind: ConfigKind, id: string): string {
  return `${STORAGE_PREFIX}${kind}:${id}`;
}

export function loadOverride<T>(kind: ConfigKind, id: string): T | null {
  try {
    const raw = localStorage.getItem(configKey(kind, id));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveOverride<T>(kind: ConfigKind, id: string, value: T): void {
  localStorage.setItem(configKey(kind, id), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('sf-ui-config-changed', { detail: { kind, id } }));
}

export function clearOverride(kind: ConfigKind, id: string): void {
  localStorage.removeItem(configKey(kind, id));
  window.dispatchEvent(new CustomEvent('sf-ui-config-changed', { detail: { kind, id } }));
}

export function listOverrides(): { kind: ConfigKind; id: string }[] {
  const out: { kind: ConfigKind; id: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(STORAGE_PREFIX)) continue;
    const rest = k.slice(STORAGE_PREFIX.length);
    const [kind, ...idParts] = rest.split(':');
    if (kind === 'screen' || kind === 'form' || kind === 'detail') {
      out.push({ kind, id: idParts.join(':') });
    }
  }
  return out;
}

// ─── 훅: default config + localStorage override 우선순위 ─────────────────
// `id`는 default config의 id 필드 — 매번 default로 폴백 가능하게 동일 id 사용
export function useResolvedConfig<T extends { id: string }>(
  defaultConfig: T,
  kind: ConfigKind,
): T {
  const [override, setOverride] = useState<T | null>(() => loadOverride<T>(kind, defaultConfig.id));

  useEffect(() => {
    setOverride(loadOverride<T>(kind, defaultConfig.id));
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ kind: ConfigKind; id: string }>).detail;
      if (detail.kind === kind && detail.id === defaultConfig.id) {
        setOverride(loadOverride<T>(kind, defaultConfig.id));
      }
    };
    window.addEventListener('sf-ui-config-changed', onChange);
    return () => window.removeEventListener('sf-ui-config-changed', onChange);
  }, [kind, defaultConfig.id]);

  return override ?? defaultConfig;
}
