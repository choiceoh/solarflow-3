// 단일 정본 — UIConfigEditor / 어시스턴트 페이지 컨텍스트 / 향후 모든 메타 인덱스가 여기 import.
// 새 화면/폼/상세 추가 시 *이 파일만* 갱신하면 양쪽 자동 동기화.

import type { ConfigKind } from '@/templates/configOverride';
import partnersScreen from '@/config/screens/partners';
import outboundScreen from '@/config/screens/outbound';
import companiesScreen from '@/config/screens/companies';
import banksScreen from '@/config/screens/banks';
import warehousesScreen from '@/config/screens/warehouses';
import manufacturersScreen from '@/config/screens/manufacturers';
import productsScreen from '@/config/screens/products';
import constructionSitesScreen from '@/config/screens/construction_sites';
import partnerForm from '@/config/forms/partners';
import companyForm from '@/config/forms/companies';
import bankForm from '@/config/forms/banks';
import warehouseForm from '@/config/forms/warehouses';
import manufacturerForm from '@/config/forms/manufacturers';
import productForm from '@/config/forms/products';
import constructionSiteForm from '@/config/forms/construction_sites';
import poLineForm from '@/config/forms/po_line';
import costForm from '@/config/forms/cost';
import blLineForm from '@/config/forms/bl_line';
import receiptForm from '@/config/forms/receipt';
import declarationForm from '@/config/forms/declaration';
import depsDemoForm from '@/config/forms/deps_demo';
import outboundFormSimple from '@/config/forms/outbound_simple';
import outboundDetailSimple from '@/config/details/outbound_simple';
import declarationDetailSimple from '@/config/details/declaration_simple';

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
  { kind: 'screen', id: 'companies', label: '법인 마스터', routeHint: '/masters/companies-v2', default: companiesScreen },
  { kind: 'screen', id: 'banks', label: '은행 마스터', routeHint: '/masters/banks-v2', default: banksScreen },
  { kind: 'screen', id: 'warehouses', label: '창고 마스터', routeHint: '/masters/warehouses-v2', default: warehousesScreen },
  { kind: 'screen', id: 'manufacturers', label: '제조사 마스터', routeHint: '/masters/manufacturers-v2', default: manufacturersScreen },
  { kind: 'screen', id: 'products', label: '품번 마스터', routeHint: '/masters/products-v2', default: productsScreen },
  { kind: 'screen', id: 'construction_sites', label: '발전소 마스터', routeHint: '/masters/construction-sites-v2', default: constructionSitesScreen },
  { kind: 'form', id: 'partner_form_v2', label: '거래처 폼', routeHint: '/masters/partners-v2 → 새로 등록', default: partnerForm },
  { kind: 'form', id: 'company_form_v2', label: '법인 폼', routeHint: '/masters/companies-v2 → 새로 등록', default: companyForm },
  { kind: 'form', id: 'bank_form_v2', label: '은행 폼', routeHint: '/masters/banks-v2 → 새로 등록', default: bankForm },
  { kind: 'form', id: 'warehouse_form_v2', label: '창고 폼', routeHint: '/masters/warehouses-v2 → 새로 등록', default: warehouseForm },
  { kind: 'form', id: 'manufacturer_form_v2', label: '제조사 폼', routeHint: '/masters/manufacturers-v2 → 새로 등록', default: manufacturerForm },
  { kind: 'form', id: 'product_form_v2', label: '품번 폼 (13 필드)', routeHint: '/masters/products-v2 → 새로 등록', default: productForm },
  { kind: 'form', id: 'construction_site_form_v2', label: '발전소 폼', routeHint: '/masters/construction-sites-v2 → 새 현장 등록', default: constructionSiteForm },
  { kind: 'form', id: 'po_line_form_v2', label: 'PO 라인 폼 (메타 변환)', routeHint: '/po-line-meta-demo', default: poLineForm },
  { kind: 'form', id: 'cost_form_v2', label: '면장 원가 폼 (메타 변환, 17 필드)', routeHint: '/cost-meta-demo', default: costForm },
  { kind: 'form', id: 'bl_line_form_v2', label: 'BL 라인 폼 (메타 변환)', routeHint: '/child-forms-meta-demo', default: blLineForm },
  { kind: 'form', id: 'receipt_form_v2', label: '수금 폼 (메타 변환)', routeHint: '/child-forms-meta-demo', default: receiptForm },
  { kind: 'form', id: 'declaration_form_v2', label: '면장 폼 (메타 변환)', routeHint: '/child-forms-meta-demo', default: declarationForm },
  { kind: 'form', id: 'deps_demo', label: '의존성·동적옵션 데모', routeHint: '/meta-form-deps-demo', default: depsDemoForm },
  { kind: 'form', id: 'outbound_form_simple', label: '출고 폼 (한계선 데모)', routeHint: '/outbound-form-meta-demo', default: outboundFormSimple },
  { kind: 'detail', id: 'outbound_detail_simple', label: '출고 상세 (한계선 데모)', routeHint: '/outbound-detail-meta-demo', default: outboundDetailSimple },
  { kind: 'detail', id: 'declaration_detail_simple', label: '면장 상세 (한계선 데모)', routeHint: '/declaration-detail-meta-demo', default: declarationDetailSimple },
];
