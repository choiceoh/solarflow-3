/**
 * pathname → (scope, config_id) 매핑.
 * 어시스턴트가 "이 화면" 변경 요청을 받았을 때 어느 ui_configs 행을 다룰지 자동 결정.
 *
 * KNOWN_CONFIGS (UIConfigEditorPage.tsx) 와 별도로 *최소* 매핑 — pathname 일치 단순화.
 * 향후 KNOWN_CONFIGS 가 별도 모듈로 추출되면 그걸 import 로 변경 권장.
 */

export interface PageContextInfo {
  /** 현재 pathname (예: '/masters/partners-v2') */
  path: string;
  /** scope: 'screen' | 'form' | 'detail'. 추론 실패 시 undefined */
  scope?: 'screen' | 'form' | 'detail';
  /** config_id: 추론 실패 시 undefined */
  config_id?: string;
}

interface ScreenMapping {
  path: string;
  configId: string;
}

const SCREEN_MAPPINGS: ScreenMapping[] = [
  { path: '/masters/partners-v2', configId: 'partners' },
  { path: '/masters/companies-v2', configId: 'companies' },
  { path: '/masters/banks-v2', configId: 'banks' },
  { path: '/masters/warehouses-v2', configId: 'warehouses' },
  { path: '/masters/manufacturers-v2', configId: 'manufacturers' },
  { path: '/masters/products-v2', configId: 'products' },
  { path: '/masters/construction-sites-v2', configId: 'construction_sites' },
  { path: '/outbound-v2', configId: 'outbound_page' },
];

/**
 * pathname 으로부터 PageContextInfo 추론. 매핑 못 찾으면 path 만 채워서 반환.
 * 매핑된 화면 = AI 가 read_ui_config / propose_ui_config_update 호출 시 (scope, config_id) 자동 사용.
 */
export const detectPageContext = (pathname: string): PageContextInfo => {
  const screen = SCREEN_MAPPINGS.find((m) => m.path === pathname);
  if (screen) {
    return { path: pathname, scope: 'screen', config_id: screen.configId };
  }
  return { path: pathname };
};
