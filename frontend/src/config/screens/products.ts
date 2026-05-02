// Phase 4: 제품(products) 마스터 페이지 — 메타 ListScreen 기반
// 메타 인프라 최대 복잡도 케이스 — 제조사 JOIN 셀 + 모듈 치수 다수 컬럼.

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'products',
  page: {
    eyebrow: 'MASTER DATA',
    title: '품번 관리',
    description: '제품 기준정보 — 품번코드 · 제조사 · 모듈 스펙. 입출고·수주·재고 모듈에서 참조됩니다.',
  },
  source: { hookId: 'useProductList' },
  requiresCompany: false,
  filters: [],
  searchable: {
    placeholder: '품번코드, 품명, 제조사, 시리즈 검색',
    fields: [
      'product_code', 'product_name', 'series_name',
      'manufacturer_name', 'manufacturers.name_kr', 'manufacturers.short_name',
    ],
  },
  metrics: [
    { label: '전체 품번', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '활성', computerId: 'count.product_active', tone: 'pos' },
  ],
  columns: [
    { key: 'product_code', label: '품번코드', className: 'font-mono' },
    { key: 'product_name', label: '품명' },
    { key: 'manufacturer_name', label: '제조사', rendererId: 'product_manufacturer_name' },
    { key: 'spec_wp', label: '규격(Wp)', formatter: 'number', align: 'right', className: 'tabular-nums' },
    { key: 'module_width_mm', label: '가로(mm)', formatter: 'number', align: 'right', className: 'tabular-nums' },
    { key: 'module_height_mm', label: '세로(mm)', formatter: 'number', align: 'right', className: 'tabular-nums' },
    { key: 'series_name', label: '시리즈', fallback: '—' },
    { key: 'is_active', label: '상태', rendererId: 'active_badge' },
  ],
  actions: [
    {
      id: 'create',
      label: '새로 등록',
      trigger: 'header',
      kind: 'open_form',
      formId: 'product_form',
      iconId: 'plus',
      variant: 'primary',
    },
    {
      id: 'edit_row',
      label: '수정',
      trigger: 'row',
      kind: 'edit_form',
      formId: 'product_form',
      iconId: 'pencil',
      variant: 'ghost',
    },
    {
      id: 'delete_row',
      label: '삭제',
      trigger: 'row',
      kind: 'confirm_call',
      endpoint: '/api/v1/products/:id',
      method: 'DELETE',
      idField: 'product_id',
      iconId: 'trash',
      variant: 'destructive',
      confirm: {
        title: '품번 삭제',
        description: '"{product_name}"을(를) 삭제하시겠습니까? 입출고·수주에 사용 중이면 삭제가 실패할 수 있습니다.',
        confirmLabel: '삭제',
        variant: 'destructive',
      },
    },
  ],
  emptyState: { message: '등록된 품번이 없습니다', actionId: 'create' },
  forms: [
    {
      id: 'product_form',
      componentId: 'product_form_v2',
      endpoint: '/api/v1/products',
      editEndpoint: '/api/v1/products/:id',
      editIdField: 'product_id',
    },
  ],
  tableSubFromTotal: true,
};

export default config;
