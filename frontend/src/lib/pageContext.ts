/**
 * 어시스턴트가 백엔드로 보내는 page_context.path 용 pathname 스냅샷.
 * D-121 이후 UI 메타에서 (scope, config_id) 를 추론하지 않는다. 화면 라벨은 assistantChips 만 사용.
 */

export interface PageContextInfo {
  /** 현재 pathname */
  path: string;
}

/**
 * pathname 으로부터 PageContextInfo 추론. 메타 config 추론은 폐기.
 */
export const detectPageContext = (pathname: string): PageContextInfo => ({ path: pathname });
