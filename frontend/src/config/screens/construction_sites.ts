// Phase 4: 발전소(construction-sites) 마스터 페이지 — 메타 ListScreen 기반
// /masters/construction-sites 의 메타 v2 — 표준 테이블 렌더 (인라인 공급이력 expand 는 코드 영역 유지)

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'construction_sites',
  page: {
    eyebrow: 'MASTER DATA',
    title: '발전소 관리',
    description: '공사 현장 기준정보 — 자체/EPC 구분 + 설비용량(MW) + 착공/준공일.',
  },
  source: { hookId: 'useConstructionSiteList' },
  // Phase 4: 법인별 데이터 — 법인 미선택 시 ListScreen 이 안내 표시
  requiresCompany: true,
  filters: [],
  searchable: {
    placeholder: '발전소명, 지명 검색',
    fields: ['name', 'location'],
  },
  metrics: [
    { label: '현장 수', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '활성', computerId: 'count.site_active', tone: 'pos', spark: 'auto' },
    { label: '자체', computerId: 'count.site_own', tone: 'info', spark: 'auto' },
    { label: 'EPC', computerId: 'count.site_epc', tone: 'warn', spark: 'auto' },
    { label: '총 용량', unit: 'MW', computerId: 'sum.site_capacity_mw', tone: 'ink', spark: 'auto' },
  ],
  columns: [
    { key: 'name', label: '발전소명', sortable: true },
    { key: 'site_type', label: '유형', rendererId: 'site_type_badge', sortable: true },
    { key: 'location', label: '지명', fallback: '—', hideable: true },
    { key: 'capacity_mw', label: '용량(MW)', formatter: 'number', align: 'right', className: 'tabular-nums', sortable: true },
    { key: 'started_at', label: '착공일', formatter: 'date', hideable: true, hiddenByDefault: true },
    { key: 'completed_at', label: '준공일', formatter: 'date', hideable: true },
    { key: 'is_active', label: '상태', rendererId: 'active_badge', sortable: true },
  ],
  actions: [
    {
      id: 'create',
      label: '새 현장 등록',
      trigger: 'header',
      kind: 'open_form',
      formId: 'construction_site_form',
      iconId: 'plus',
      variant: 'primary',
    },
    {
      id: 'edit_row',
      label: '수정',
      trigger: 'row',
      kind: 'edit_form',
      formId: 'construction_site_form',
      iconId: 'pencil',
      variant: 'ghost',
    },
    {
      id: 'delete_row',
      label: '삭제',
      trigger: 'row',
      kind: 'confirm_call',
      endpoint: '/api/v1/construction-sites/:id',
      method: 'DELETE',
      idField: 'site_id',
      iconId: 'trash',
      variant: 'destructive',
      confirm: {
        title: '현장 삭제',
        description: '"{name}"을(를) 삭제하시겠습니까? 연결된 공급 이력이 있으면 삭제가 실패할 수 있습니다.',
        confirmLabel: '삭제',
        variant: 'destructive',
      },
    },
  ],
  emptyState: { message: '등록된 공사 현장이 없습니다', actionId: 'create' },
  forms: [
    {
      id: 'construction_site_form',
      componentId: 'construction_site_form_v2',
      endpoint: '/api/v1/construction-sites',
      editEndpoint: '/api/v1/construction-sites/:id',
      editIdField: 'site_id',
    },
  ],
  tableSubFromTotal: true,
};

export default config;
