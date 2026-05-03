// Phase 4: 제조사(manufacturers) 마스터 페이지 — 메타 ListScreen 기반

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'manufacturers',
  page: {
    eyebrow: 'MASTER DATA',
    title: '제조사 관리',
    description: '제조사 기준정보. 표시순위로 드롭다운 정렬, 약칭은 화면 표시용 단축어.',
  },
  source: { hookId: 'useManufacturerList' },
  requiresCompany: false,
  filters: [],
  searchable: {
    placeholder: '제조사명(한/영), 약칭, 국가 검색',
    fields: ['name_kr', 'name_en', 'short_name', 'country'],
  },
  metrics: [
    { label: '전체 제조사', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '국내', computerId: 'count.manufacturer_domestic', tone: 'info', spark: 'auto' },
    { label: '해외', computerId: 'count.manufacturer_foreign', tone: 'warn', spark: 'auto' },
    { label: '활성', computerId: 'count.manufacturer_active', tone: 'pos', spark: 'auto' },
  ],
  columns: [
    { key: 'priority_rank', label: '순위', align: 'right', className: 'tabular-nums' },
    { key: 'name_kr', label: '제조사명(한)' },
    { key: 'short_name', label: '약칭', fallback: '—' },
    { key: 'name_en', label: '제조사명(영)', fallback: '—' },
    { key: 'country', label: '국가' },
    { key: 'domestic_foreign', label: '국내/해외' },
    { key: 'is_active', label: '상태', rendererId: 'active_badge' },
  ],
  actions: [
    {
      id: 'create',
      label: '새로 등록',
      trigger: 'header',
      kind: 'open_form',
      formId: 'manufacturer_form',
      iconId: 'plus',
      variant: 'primary',
    },
    {
      id: 'edit_row',
      label: '수정',
      trigger: 'row',
      kind: 'edit_form',
      formId: 'manufacturer_form',
      iconId: 'pencil',
      variant: 'ghost',
    },
    {
      id: 'delete_row',
      label: '삭제',
      trigger: 'row',
      kind: 'confirm_call',
      endpoint: '/api/v1/manufacturers/:id',
      method: 'DELETE',
      idField: 'manufacturer_id',
      iconId: 'trash',
      variant: 'destructive',
      confirm: {
        title: '제조사 삭제',
        description: '"{name_kr}"을(를) 삭제하시겠습니까? 연결된 제품이 있으면 삭제가 실패할 수 있습니다.',
        confirmLabel: '삭제',
        variant: 'destructive',
      },
    },
  ],
  // Phase 4 follow-up: 행 클릭 → MetaDetail (registry.detailComponents.manufacturer)
  onRowClick: { kind: 'detail', detailId: 'manufacturer', idField: 'manufacturer_id' },
  emptyState: { message: '등록된 제조사가 없습니다', actionId: 'create' },
  forms: [
    {
      id: 'manufacturer_form',
      componentId: 'manufacturer_form_v2',
      endpoint: '/api/v1/manufacturers',
      editEndpoint: '/api/v1/manufacturers/:id',
      editIdField: 'manufacturer_id',
    },
  ],
  tableSubFromTotal: true,
};

export default config;
