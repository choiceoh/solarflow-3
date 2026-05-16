/**
 * Assistant 등에 넘기는 최소 페이지 컨텍스트(pathname).
 * D-121 이후 UI 메타(ui_configs) 기반 라벨·scope 추론은 제거됐고,
 * 사용자 친화 라벨은 `lib/assistantChips.ts` 의 PAGE_CHIPS 가 단일 정본이다.
 */

export interface PageContextInfo {
  /** 현재 pathname */
  path: string;
}

/**
 * pathname 으로부터 PageContextInfo 추론. 메타 config 추론은 폐기.
 */
export const detectPageContext = (pathname: string): PageContextInfo => ({ path: pathname });
