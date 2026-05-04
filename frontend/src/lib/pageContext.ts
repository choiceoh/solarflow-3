/**
 * pathname → 페이지 라벨 매핑.
 * D-120 결정 이후 ui_configs 메타 시스템(UIConfigEditor + KNOWN_CONFIGS)이 제거되어
 * 어시스턴트는 페이지 라벨만 hint 로 노출하고 (scope, config_id) 자동 결정은 더 이상 안 한다.
 */

export interface PageContextInfo {
  /** 현재 pathname */
  path: string;
}

/**
 * pathname 으로부터 PageContextInfo 추론. 메타 config 추론은 폐기.
 */
export const detectPageContext = (pathname: string): PageContextInfo => ({ path: pathname });

/**
 * 매핑된 화면의 사용자 친화 라벨. drawer 헤더 hint 표시용.
 * 메타 KNOWN_CONFIGS 제거 후, 라벨은 assistantChips 의 PAGE_CHIPS 가 단일 정본.
 */
export const detectPageLabel = (_pathname: string): string | undefined => undefined;
