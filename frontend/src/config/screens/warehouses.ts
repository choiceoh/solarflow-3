// Phase 4: 창고(warehouses) 마스터 페이지 — 메타 ListScreen 기반
// /data 통합 페이지의 창고 탭과 동일 데이터를 메타 템플릿으로 그린다.

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'warehouses',
  page: {
    eyebrow: 'MASTER DATA',
    title: '창고 관리',
    description: '창고/장소 코드. 입출고·수주·통관 모듈에서 참조됩니다.',
  },
  source: { hookId: 'useWarehouseList' },
  requiresCompany: false,
  filters: [],
  searchable: {
    placeholder: '창고명, 코드, 장소 검색',
    fields: ['warehouse_name', 'warehouse_code', 'location_name', 'location_code'],
  },
  metrics: [
    { label: '전체 창고', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '활성', computerId: 'count.warehouse_active', tone: 'pos' },
  ],
  columns: [
    { key: 'warehouse_code', label: '창고코드', className: 'font-mono' },
    { key: 'warehouse_name', label: '창고명' },
    { key: 'warehouse_type', label: '유형', rendererId: 'warehouse_type_badge' },
    { key: 'location_code', label: '장소코드', className: 'font-mono' },
    { key: 'location_name', label: '장소명' },
    { key: 'is_active', label: '상태', rendererId: 'active_badge' },
  ],
  actions: [
    {
      id: 'create',
      label: '새로 등록',
      trigger: 'header',
      kind: 'open_form',
      formId: 'warehouse_form',
      iconId: 'plus',
      variant: 'primary',
    },
    {
      id: 'edit_row',
      label: '수정',
      trigger: 'row',
      kind: 'edit_form',
      formId: 'warehouse_form',
      iconId: 'pencil',
      variant: 'ghost',
    },
    {
      id: 'delete_row',
      label: '삭제',
      trigger: 'row',
      kind: 'confirm_call',
      endpoint: '/api/v1/warehouses/:id',
      method: 'DELETE',
      idField: 'warehouse_id',
      iconId: 'trash',
      variant: 'destructive',
      confirm: {
        title: '창고 삭제',
        description: '"{warehouse_name}"을(를) 삭제하시겠습니까? 입출고·재고가 있으면 삭제가 실패할 수 있습니다.',
        confirmLabel: '삭제',
        variant: 'destructive',
      },
    },
  ],
  emptyState: { message: '등록된 창고가 없습니다', actionId: 'create' },
  forms: [
    {
      id: 'warehouse_form',
      componentId: 'warehouse_form_v2',
      endpoint: '/api/v1/warehouses',
      editEndpoint: '/api/v1/warehouses/:id',
      editIdField: 'warehouse_id',
    },
  ],
  tableSubFromTotal: true,
};

export default config;
