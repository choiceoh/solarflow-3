// Phase 4: 은행(banks) 마스터 페이지 — 메타 ListScreen 기반
// /data 통합 페이지의 은행 탭과 동일 데이터를 메타 템플릿으로 그린다.
// /masters/banks-v2에서 비교 가능 (운영 기본 흐름은 /data 그대로 유지).

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'banks',
  page: {
    eyebrow: 'MASTER DATA',
    title: '은행 관리',
    description: 'LC 한도·수수료 기준정보. 활성 은행만 LC 한도 집계에 반영됩니다.',
  },
  source: { hookId: 'useBankList' },
  requiresCompany: false,
  filters: [],
  searchable: {
    placeholder: '은행명, 법인명, 수수료방식 검색',
    fields: ['bank_name', 'company_name', 'companies.company_name', 'fee_calc_method'],
  },
  metrics: [
    { label: '전체 은행', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '활성', computerId: 'count.bank_active', tone: 'pos' },
    { label: 'LC 한도 합계', unit: 'M USD', computerId: 'sum.bank_lc_limit_million', tone: 'info' },
  ],
  columns: [
    { key: 'company_name', label: '법인', rendererId: 'bank_company_name' },
    { key: 'bank_name', label: '은행명' },
    { key: 'lc_limit_usd', label: 'LC 한도(USD)', formatter: 'number', align: 'right', className: 'tabular-nums' },
    { key: 'limit_expiry_date', label: '승인기한', formatter: 'date' },
    { key: 'opening_fee_rate', label: '개설(%)', align: 'right', className: 'tabular-nums' },
    { key: 'acceptance_fee_rate', label: '인수(%)', align: 'right', className: 'tabular-nums' },
    { key: 'is_active', label: '상태', rendererId: 'active_badge' },
  ],
  actions: [
    {
      id: 'create',
      label: '새로 등록',
      trigger: 'header',
      kind: 'open_form',
      formId: 'bank_form',
      iconId: 'plus',
      variant: 'primary',
    },
    {
      id: 'edit_row',
      label: '수정',
      trigger: 'row',
      kind: 'edit_form',
      formId: 'bank_form',
      iconId: 'pencil',
      variant: 'ghost',
    },
    {
      id: 'delete_row',
      label: '삭제',
      trigger: 'row',
      kind: 'confirm_call',
      endpoint: '/api/v1/banks/:id',
      method: 'DELETE',
      idField: 'bank_id',
      iconId: 'trash',
      variant: 'destructive',
      confirm: {
        title: '은행 삭제',
        description: '"{bank_name}"을(를) 삭제하시겠습니까? 연결된 LC가 있으면 삭제가 실패할 수 있습니다.',
        confirmLabel: '삭제',
        variant: 'destructive',
      },
    },
  ],
  emptyState: { message: '등록된 은행이 없습니다', actionId: 'create' },
  forms: [
    {
      id: 'bank_form',
      componentId: 'bank_form_v2',
      endpoint: '/api/v1/banks',
      editEndpoint: '/api/v1/banks/:id',
      editIdField: 'bank_id',
    },
  ],
  tableSubFromTotal: true,
};

export default config;
