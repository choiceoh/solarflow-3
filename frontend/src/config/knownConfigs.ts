// 단일 정본 — UIConfigEditor / 어시스턴트 페이지 컨텍스트 / 향후 모든 메타 인덱스가 여기 import.
// 새 화면/폼/상세 추가 시 *이 파일만* 갱신하면 양쪽 자동 동기화.

import type { ConfigKind } from '@/templates/configOverride';
import partnersScreen from '@/config/screens/partners';
import outboundScreen from '@/config/screens/outbound';
import banksScreen from '@/config/screens/banks';
import warehousesScreen from '@/config/screens/warehouses';
import manufacturersScreen from '@/config/screens/manufacturers';
import productsScreen from '@/config/screens/products';
import constructionSitesScreen from '@/config/screens/construction_sites';
import partnerForm from '@/config/forms/partners';
import bankForm from '@/config/forms/banks';
import warehouseForm from '@/config/forms/warehouses';
import manufacturerForm from '@/config/forms/manufacturers';
import productForm from '@/config/forms/products';
import constructionSiteForm from '@/config/forms/construction_sites';
import depsDemoForm from '@/config/forms/deps_demo';

export interface KnownConfig {
  kind: ConfigKind;
  id: string;
  label: string;
  /** 사용자가 어떤 페이지에서 이 config 가 사용되는지 알 수 있는 hint.
   * screen 의 경우 정확한 pathname (어시스턴트 페이지 컨텍스트 자동 매핑에 활용).
   * form/detail 은 화면 흐름 설명 (예: "/masters/partners-v2 → 새로 등록"). */
  routeHint?: string;
  default: { id: string };
}

export const KNOWN_CONFIGS: KnownConfig[] = [
  { kind: 'screen', id: 'partners', label: '거래처 목록', routeHint: '/masters/partners-v2', default: partnersScreen },
  { kind: 'screen', id: 'outbound_page', label: '출고/판매 (탭)', routeHint: '/outbound-v2', default: outboundScreen },
  { kind: 'screen', id: 'banks', label: '은행 마스터', routeHint: '/masters/banks-v2', default: banksScreen },
  { kind: 'screen', id: 'warehouses', label: '창고 마스터', routeHint: '/masters/warehouses-v2', default: warehousesScreen },
  { kind: 'screen', id: 'manufacturers', label: '제조사 마스터', routeHint: '/masters/manufacturers-v2', default: manufacturersScreen },
  { kind: 'screen', id: 'products', label: '품번 마스터', routeHint: '/masters/products-v2', default: productsScreen },
  { kind: 'screen', id: 'construction_sites', label: '발전소 마스터', routeHint: '/masters/construction-sites-v2', default: constructionSitesScreen },
  { kind: 'form', id: 'partner_form_v2', label: '거래처 폼', routeHint: '/masters/partners-v2 → 새로 등록', default: partnerForm },
  { kind: 'form', id: 'bank_form_v2', label: '은행 폼', routeHint: '/masters/banks-v2 → 새로 등록', default: bankForm },
  { kind: 'form', id: 'warehouse_form_v2', label: '창고 폼', routeHint: '/masters/warehouses-v2 → 새로 등록', default: warehouseForm },
  { kind: 'form', id: 'manufacturer_form_v2', label: '제조사 폼', routeHint: '/masters/manufacturers-v2 → 새로 등록', default: manufacturerForm },
  { kind: 'form', id: 'product_form_v2', label: '품번 폼 (13 필드)', routeHint: '/masters/products-v2 → 새로 등록', default: productForm },
  { kind: 'form', id: 'construction_site_form_v2', label: '발전소 폼', routeHint: '/masters/construction-sites-v2 → 새 현장 등록', default: constructionSiteForm },
  { kind: 'form', id: 'deps_demo', label: '의존성·동적옵션 데모', routeHint: '/meta-form-deps-demo', default: depsDemoForm },
];
