// Phase 4: 법인(companies) 마스터 페이지 — 메타 ListScreen 기반
// /data 통합 페이지의 법인 탭과 동일 데이터를 메타 템플릿으로 그린다.
// /masters/companies-v2에서 비교 가능 (운영 기본 흐름은 /data 그대로 유지).

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'companies',
  page: {
    eyebrow: 'MASTER DATA',
    title: '법인 관리',
    description: '법인 기준정보 — 사업자번호 + 법인코드. 수정 시 모든 모듈에 반영됩니다.',
  },
  source: { hookId: 'useCompanyList' },
  requiresCompany: false,
  filters: [],
  searchable: {
    placeholder: '법인명, 코드, 사업자번호 검색',
    fields: ['company_name', 'company_code', 'business_number'],
  },
  metrics: [
    { label: '전체 법인', computerId: 'count', tone: 'solar', spark: 'auto' },
  ],
  columns: [
    { key: 'company_name', label: '법인명' },
    { key: 'company_code', label: '법인코드', className: 'font-mono' },
    { key: 'business_number', label: '사업자번호', className: 'font-mono' },
    { key: 'is_active', label: '상태', rendererId: 'active_badge' },
  ],
  actions: [
    {
      id: 'create',
      label: '새로 등록',
      trigger: 'header',
      kind: 'open_form',
      formId: 'company_form',
      iconId: 'plus',
      variant: 'primary',
    },
    {
      id: 'edit_row',
      label: '수정',
      trigger: 'row',
      kind: 'edit_form',
      formId: 'company_form',
      iconId: 'pencil',
      variant: 'ghost',
    },
    {
      id: 'delete_row',
      label: '삭제',
      trigger: 'row',
      kind: 'confirm_call',
      endpoint: '/api/v1/companies/:id',
      method: 'DELETE',
      idField: 'company_id',
      iconId: 'trash',
      variant: 'destructive',
      confirm: {
        title: '법인 삭제',
        description: '"{company_name}"을(를) 삭제하시겠습니까? 연결된 거래처·은행·창고가 있으면 삭제가 실패할 수 있습니다.',
        confirmLabel: '삭제',
        variant: 'destructive',
      },
    },
  ],
  emptyState: { message: '등록된 법인이 없습니다', actionId: 'create' },
  forms: [
    {
      id: 'company_form',
      componentId: 'company_form_v2',
      endpoint: '/api/v1/companies',
      editEndpoint: '/api/v1/companies/:id',
      editIdField: 'company_id',
    },
  ],
  tableSubFromTotal: true,
};

export default config;
