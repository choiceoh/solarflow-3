/**
 * pathname → (scope, config_id) 매핑.
 * 어시스턴트가 현재 화면을 조회·설명할 때 어느 ui_configs 행을 참조할지 자동 결정.
 *
 * 단일 정본 — config/knownConfigs.ts 의 KNOWN_CONFIGS 에서 routeHint 가
 * 정확히 pathname 인 screen 항목만 매핑. 새 화면 추가 시 KNOWN_CONFIGS 만
 * 갱신하면 어시스턴트도 자동으로 인식.
 */

import { KNOWN_CONFIGS } from '@/config/knownConfigs';

export interface PageContextInfo {
  /** 현재 pathname (예: '/masters/partners-v2') */
  path: string;
  /** scope: 'screen' | 'form' | 'detail'. 추론 실패 시 undefined */
  scope?: 'screen' | 'form' | 'detail';
  /** config_id: 추론 실패 시 undefined */
  config_id?: string;
}

const screenPathToId = new Map<string, string>(
  KNOWN_CONFIGS.filter((c) => c.kind === 'screen' && typeof c.routeHint === 'string')
    .map((c) => [c.routeHint as string, c.id]),
);

/**
 * pathname 으로부터 PageContextInfo 추론. 매핑 못 찾으면 path 만 채워서 반환.
 * 매핑된 화면 = AI 가 read_ui_config 호출 시 (scope, config_id) 자동 사용.
 */
export const detectPageContext = (pathname: string): PageContextInfo => {
  const id = screenPathToId.get(pathname);
  if (id) {
    return { path: pathname, scope: 'screen', config_id: id };
  }
  return { path: pathname };
};

/**
 * 매핑된 화면의 사용자 친화 라벨. drawer 헤더 hint 표시용.
 * 매핑 못 찾으면 undefined → drawer 가 hint 안 표시.
 */
export const detectPageLabel = (pathname: string): string | undefined => {
  const entry = KNOWN_CONFIGS.find(
    (c) => c.kind === 'screen' && c.routeHint === pathname,
  );
  return entry?.label;
};
